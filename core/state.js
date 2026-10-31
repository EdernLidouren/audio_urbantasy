// Forme de l'état + construction de l'état initial. Pur, headless : aucun
// DOM, audio, ni API navigateur.
//
// PARTIE (session) multi-mondes, modèle "Animal Crossing" : le joueur
// traverse des MONDES (un par scène visitée) qui persistent, gelés, pendant
// son absence — une re-visite les ressort tels qu'ils ont été laissés
// (PNJ compris), pas réinitialisés. Forme :
//   { player, worlds: { [id]: <état d'un monde> }, activeWorldId, time,
//     money, bag, equipment, companions, companionsRngState }
// player : l'état du joueur (position, extensible plus tard).
// money : entier, cercle PARTIE (comme time) — voir core/money.js/addMoney,
// SEUL point d'écriture.
// bag : liste d'entrées d'objets, cercle PARTIE (comme money) — voir
// core/bag.js/addItem, SEUL point d'écriture. Premier tiers de
// l'inventaire (money) puis deuxième (bag), même statut, même patron.
// equipment : slots nommés { feet: <entrée ou null> }, TROISIÈME tiers —
// voir core/equipment.js (equipItem/unequipItem, SEULS points d'écriture ;
// gaitOf, dérivation pure du pas). Un objet donné n'est jamais À LA FOIS
// dans bag ET dans equipment.
// Tous trois vivent ICI, JAMAIS dans les entités d'un monde : ils
// traversent les mondes, ne leur appartiennent pas. worlds[id] : une
// scène vivante (entités avec position/intention/état, longueur,
// métadonnées), PLUS son propre rngState
// (chaque monde avance sa propre suite de tirages, gelée avec lui) et
// lastVisited (horodaté au rangement, voir travelToWorld, avec la minute de
// jeu COURANTE — voir core/time.js). Un seul monde actif à la fois
// (activeWorldId) : seul lui reçoit les ticks (voir core/reduce.js) — les
// autres sont inertes tant qu'ils ne sont pas réactivés (simulation de
// l'absence : pas codée, lastVisited est le crochet réservé pour ça, voir
// doc/time.md).
// time : minutes de jeu écoulées depuis l'origine de la partie — SEULE
// source de vérité temporelle (voir core/time.js pour les dérivations
// minute/heure/jour/mois/saison/année). Avance UNIQUEMENT via
// core/time.js/advanceTime, jamais ici ni dans core/reduce.js.
//
// RECTO/VERSO — scène à DEUX FACES (voir doc/entity-model.md/"Recto/verso",
// doc/scene-format.md/"Scène à deux faces") : worlds[id]
// peut être SIMPLE (comme ci-dessus) ou contenir un recto ET un verso
// (jamais un seul), chacun sa propre face — voir isTwoSided/resolveFace/
// withFace plus bas. `player.side` ("recto"|"verso", "recto" par défaut) dit
// QUELLE face est ACTIVE (celle qui porte le joueur et les compagnons).
// COEXISTENCE (voir core/reduce.js/TICK) : LES DEUX faces
// tiquent à chaque tour, chacune ISOLÉE dans son propre espace (aucune
// collision, aucun ciblage de comportement, aucune interaction entre
// faces) — seule la face active reçoit joueur/compagnons. `getInactiveFace`
// plus bas expose l'AUTRE face en LECTURE SEULE, pour son rendu audio
// étouffé (voir view/audio/entity-audio.js, view/audio/muffle.js). Basculer
// de face (voir
// switchSide plus bas) reste DANS le même monde, contrairement à
// travelToWorld qui en change.
//
// COMPAGNONS — cercle PARTIE, comme le joueur : `companions` est une liste
// d'entités (MÊME
// forme qu'une entité de monde — id/type/x/behavior/...) qui vit à CE niveau,
// PAS dans worlds[x].entities. Elle traverse les transitions avec le
// joueur, jamais rangée avec un monde quitté. `companionsRngState` est un
// flux PRNG dédié, DISTINCT de world.rngState : un compagnon est tické à
// CHAQUE tour de jeu quel que soit le monde actif, alors que world.rngState
// est gelé pendant qu'un monde est rangé (inactif) — les deux ne peuvent pas
// partager le même flux sans que l'un ou l'autre perde son déterminisme
// "de partie" ou "de monde". INJECTION à la lecture (voir getActiveWorld) :
// un compagnon n'est jamais persisté DANS un monde, seulement mélangé au
// flux d'entités du monde actif au moment où un consommateur (vue, ou le
// réducteur lui-même) le lit — voir le commentaire de getActiveWorld pour
// le détail du mécanisme, c'est le cœur de ce système.

import { TUNING_DEFAULTS } from "../config/tuning-values.js";
import { MAX_COMPANIONS } from "../config/companions.js";
import { MAX_EPHEMERALS } from "../config/ephemerals.js";
import { createSeed, nextRandom } from "./rng.js";
import { clamp } from "../lib/math.js";
import { isBlocking, presenceContextOf, tracksPresence } from "./presence.js";
import { INITIAL_TIME } from "./time.js";
import { createInitialWeather } from "./weather.js";
import { parseVariables, applyActionEffects } from "./variables.js";
import { sequenceHead, sequenceTail } from "./sequence.js";
import { createEmptyEquipment } from "./equipment.js";

function fail(message) {
  throw new Error(`createInitialState: ${message}`);
}

export const MOVE_STEP = TUNING_DEFAULTS.moveStep;

// Rayon de corps uniforme pour toute entité blocksMovement — pas encore par
// entité/type. Orthogonal à blocksMovement, qui décide SEUL si ce corps
// arrête/exclut quelque chose (voir core/reduce.js). Vit ici (pas dans
// reduce.js) pour être partagé sans détour par core/scene.js (validation au
// chargement) ET core/physics/ (résolution au tick) — une seule source.
export const BODY_RADIUS = 0.25;

// Graine par défaut du PRNG : fixe, jamais Date.now() — le déterminisme
// s'applique aussi en jeu réel, pas seulement en test. Utilisée pour CHAQUE
// monde nouvellement créé (première visite) : chaque monde porte son
// propre flux, jamais un flux de partie entière.
const DEFAULT_SEED = 1;

// Écart minimal entre deux compagnons repositionnés côte à côte (voir
// repositionCompanions) — réutilise BODY_RADIUS (déjà la référence
// structurelle d'encombrement du jeu, voir physics/overlap.js) plutôt qu'un
// nombre arbitraire de plus : jamais un empilement exact, sans inventer un
// nouveau réglage.
const COMPANION_SPAWN_SPACING = 2 * BODY_RADIUS;

// Replace chaque compagnon près de `playerX` (comme le joueur lui-même,
// voir createInitialState/travelToWorld) — un léger décalage PAR compagnon
// (jamais un empilement exact si la partie en compte plusieurs un jour,
// voir MAX_COMPANIONS), borné aux limites de la scène. Pure.
function repositionCompanions(companions, playerX, length) {
  return companions.map((companion, index) => ({
    ...companion,
    x: clamp(playerX + index * COMPANION_SPAWN_SPACING, 0, length),
  }));
}

// SEUL point d'ajout d'un compagnon à la partie — le
// recrutement en jeu n'existe pas encore, mais quand il arrivera, c'est ICI
// qu'il appellera, jamais en poussant directement dans session.companions.
// Politique volontairement simple : à la limite (MAX_COMPANIONS), REFUSE
// (liste renvoyée INCHANGÉE) et SIGNALE l'échec — jamais d'éviction
// silencieuse d'un compagnon existant pour faire de la place. `added` dans
// le retour permet à l'appelant (vue ou test) de distinguer un ajout réussi
// d'un refus sans avoir à recomparer les longueurs lui-même. Pure hormis
// l'avertissement diagnostique (même convention que core/scene.js, qui
// avertit sur des cas similaires au chargement).
export function addCompanion(companions, companion) {
  if (companions.length >= MAX_COMPANIONS) {
    console.warn(`addCompanion: limite de ${MAX_COMPANIONS} compagnon(s) déjà atteinte, ajout refusé.`);
    return { companions, added: false };
  }
  return { companions: [...companions, companion], added: true };
}

// SCÈNE À DEUX FACES (voir doc/scene-format.md/"Scène à deux faces") : une scène
// PEUT contenir un recto ET un verso (core/scene.js/parseScene garantit les
// deux présents ensemble, jamais un seul) — chacun sa PROPRE face
// (entities/rngState/nextEphemeralId/segments/defaultSurface/music*/
// ambiences*/reverb*), length/playerStart/lastVisited restant PARTAGÉS au
// niveau du monde. Une scène SIMPLE (pas de recto/verso déclarés) EST
// elle-même sa seule face — isTwoSided/resolveFace/withFace routent TOUT
// accès à travers `side` (session.player.side), pour que le reste de ce
// fichier (et core/reduce.js) n'ait JAMAIS à distinguer les deux cas :
// resolveFace(world, side) renvoie toujours "la face à lire", withFace
// "comment y réécrire", qu'il y ait deux faces ou une seule.
export function isTwoSided(world) {
  return world.recto !== undefined;
}

// Face COURANTE d'un monde, à LIRE. `side` ignoré pour un monde simple (il
// est sa propre unique face) — jamais besoin de vérifier isTwoSided à
// l'appel, cette fonction le fait une fois pour toutes.
export function resolveFace(world, side) {
  return isTwoSided(world) ? world[side] : world;
}

// Réécrit UNE face d'un monde avec `patch` (fusion superficielle, comme un
// spread), en laissant l'AUTRE face totalement INTACTE (même référence) —
// PRIMITIVE D'ÉCRITURE générique, appelée une fois par face à tiquer (voir
// core/reduce.js/TICK : les DEUX faces d'un monde à deux faces tiquent,
// chacune via son propre appel à withFace). Pour un
// monde SIMPLE, `side` est ignoré (il n'a qu'une seule face, lui-même).
export function withFace(world, side, patch) {
  if (!isTwoSided(world)) return { ...world, ...patch };
  return { ...world, [side]: { ...world[side], ...patch } };
}

// Remplace le monde ACTIF de la partie ; les autres mondes gardent leur
// référence.
export function withActiveWorld(session, world) {
  return { ...session, worlds: { ...session.worlds, [session.activeWorldId]: world } };
}

// Réécrit UNE face du monde actif (voir withFace) — celle du joueur par
// défaut. Point d'écriture commun de tout ce qui modifie les entités, le
// PRNG ou le compteur d'éphémères de la face où l'on se trouve.
export function updateActiveFace(session, patch, side = session.player.side) {
  return withActiveWorld(session, withFace(session.worlds[session.activeWorldId], side, patch));
}

// Purge les entités ÉPHÉMÈRES d'un monde ENTIER (voir travelToWorld plus
// bas et core/save.js/stripEphemeralEntities, SEULS appelants — factorisé
// ICI pour ne jamais dupliquer cette logique) : SIMPLE -> sa seule face ;
// À DEUX FACES -> LES DEUX, indépendamment (on quitte le MONDE, pas une
// seule face — l'autre face, même tickée en coexistence, voir
// core/reduce.js, peut très bien porter des éphémères jamais ramassés,
// eux aussi exclus d'une sortie de SCÈNE). Référence inchangée si rien à
// purger, même politique que le reste de ce fichier.
function stripFaceEphemerals(face) {
  if (!face.entities.some((entity) => entity.ephemeral)) return face;
  return { ...face, entities: face.entities.filter((entity) => !entity.ephemeral) };
}

export function stripEphemeralsFromWorld(world) {
  if (!isTwoSided(world)) return stripFaceEphemerals(world);
  const recto = stripFaceEphemerals(world.recto);
  const verso = stripFaceEphemerals(world.verso);
  if (recto === world.recto && verso === world.verso) return world;
  return { ...world, recto, verso };
}

// Construit l'état d'UNE face (rngState propre, compteur d'éphémères à 0) —
// factorisé pour être appelé UNE fois (monde simple) ou DEUX (monde à deux
// faces, recto et verso), jamais dupliqué entre les deux cas.
function createFaceState(face, seed) {
  return {
    ...face,
    rngState: createSeed(seed),
    // Compteur d'ids ÉPHÉMÈRES, dédié à CETTE face — voir spawnEphemeral plus
    // bas. Monotone, JAMAIS décrémenté (contrairement au nombre d'éphémères
    // VIVANTS, qui peut baisser au gré des ramassages/purges) : garantit un
    // id jamais réutilisé au sein de cette face, pour toute sa durée de vie
    // (même à travers plusieurs visites — ce compteur n'est jamais remis à
    // zéro après sa création initiale). Deux faces d'un même monde ont
    // chacune LE LEUR : jamais partagé, elles n'ont jamais besoin de se
    // distinguer l'une de l'autre puisque leurs entités ne se mêlent jamais
    // dans une même liste (faces isolées, voir header).
    nextEphemeralId: 0,
  };
}

// Construit l'état d'un monde à partir d'une scène déjà validée (sortie de
// parseScene) : entités telles quelles (aucune seed dédiée par
// comportement — wander initialise seul son propre état au premier tick,
// voir core/behaviors/wander.js). SIMPLE -> le monde est sa propre et
// unique face. À DEUX FACES -> recto ET
// verso construits chacun via createFaceState, avec des GRAINES DISTINCTES
// (seed pour recto, `${seed}:verso` pour verso — même principe que
// companionsRngState, voir header) : deux faces d'un même monde ne doivent
// jamais tirer la MÊME suite de nombres, elles sont deux espaces indépendants
// qui partagent seulement leur longueur X. lastVisited : toujours au niveau
// du MONDE (jamais par face, voir header) — jamais encore rangé à la
// création, quel que soit le nombre de faces.
function createWorldState(scene, seed) {
  const { recto, verso, ...shared } = scene;
  if (recto !== undefined) {
    return {
      ...shared,
      lastVisited: 0,
      recto: createFaceState(recto, seed),
      verso: createFaceState(verso, `${seed}:verso`),
    };
  }
  return { ...createFaceState(scene, seed), lastVisited: 0 };
}

// Objets acquis au moins une fois (voir core/bag.js/addItem), DÉDUITS de ce
// que la partie possède : sac et équipement. Sert au départ d'une partie,
// qui ne passe pas par addItem, et au rebouchage d'une sauvegarde
// antérieure (core/save.js). Tolère des entrées mal formées (donnée de
// disque) en les ignorant.
export function deriveAcquiredItems(bag, equipment) {
  const acquiredItems = {};
  for (const entry of Array.isArray(bag) ? bag : []) {
    if (entry && typeof entry.type === "string") acquiredItems[entry.type] = true;
  }
  for (const slot of Object.values(equipment || {})) {
    if (slot && typeof slot.type === "string") acquiredItems[slot.type] = true;
  }
  return acquiredItems;
}

// Construit une PARTIE avec un premier monde actif. Le joueur démarre à
// scene.playerStart (filet à 0 déjà géré par parseScene). seed optionnel,
// transmise au premier monde.
// Le troisième paramètre est le DÉPART (argent, sac, équipement,
// compagnons, variables de partie), déjà résolu par
// core/new-game.js/parseNewGame pour une vraie partie (voir
// config/new-game.js). Chaque champ absent part VIDE : sans départ, une
// partie n'a ni argent, ni objet, ni compagnon — les vérifications du core
// déclarent ainsi seulement ce dont elles ont besoin. Les compagnons sont
// toujours plafonnés à MAX_COMPANIONS et repositionnés près du joueur,
// quelle que soit leur source : l'invariant tient dès la construction.
export function createInitialState(
  scene,
  seed = DEFAULT_SEED,
  { money = 0, bag = [], equipment = createEmptyEquipment(), companions = [], partyVariables, emotes = {} } = {}
) {
  const world = createWorldState(scene, seed);
  return {
    // blockedBy : id de l'entité bloquante contre laquelle le joueur bute CE
    // tick, ou null. pushedBy : id de l'entité dont la résolution de
    // chevauchement a forcé le joueur à se déplacer CE tick (cas curatif,
    // voir core/reduce.js), ou null — distinct de blockedBy (bute en
    // avançant vs déjà chevauché malgré lui). Les deux transitoires,
    // recalculés à chaque tick, jamais accumulés.
    // side : voir isTwoSided/resolveFace plus haut — "recto" par défaut, y
    // compris pour une scène simple (ignoré dans ce cas, mais toujours
    // présent : jamais de branche "side existe ou pas" ailleurs dans le
    // core).
    player: { x: scene.playerStart, side: "recto", blockedBy: null, pushedBy: null },
    worlds: { [scene.id]: world },
    activeWorldId: scene.id,
    // Horloge de partie : voir core/time.js. INITIAL_TIME = jour 1, mois 1,
    // à l'heure de départ configurée (config/time-values.js/startHour).
    time: INITIAL_TIME,
    // Argent (core/money.js), sac (core/bag.js) et équipement
    // (core/equipment.js) : ceux du départ, vides par défaut.
    money,
    bag,
    equipment,
    // Le départ ne passe pas par addItem : ses objets sont notés acquis
    // ici, déduits du sac et de l'équipement, jamais listés à la main.
    acquiredItems: deriveAcquiredItems(bag, equipment),
    // Types d'entité observés au moins une fois (core/observations.js) :
    // aucun au départ.
    observedEntityTypes: {},
    companions: repositionCompanions(companions.slice(0, MAX_COMPANIONS), scene.playerStart, scene.length),
    // Flux PRNG dédié aux compagnons (voir header) : dérivé du même seed,
    // mais hashé sous une clé distincte — jamais la même suite que le
    // premier monde (createSeed accepte une chaîne, voir core/rng.js).
    companionsRngState: createSeed(`companions:${seed}`),
    // Météo (voir core/weather.js) : machine à états GLOBALE, cercle
    // PARTIE comme time/money — jamais par monde. État initial +
    // rendez-vous de transition dérivés du seed de partie, comme
    // companionsRngState juste au-dessus.
    weather: createInitialWeather(seed),
    // Perception surnaturelle (voir core/presence.js/"perceptionActive",
    // view/perception-toggle.js) : booléen simple, cercle PARTIE comme side/
    // time/money — jamais par monde. false par défaut : une partie neuve
    // démarre en perception normale.
    perceptionActive: false,
    // variables : STOCKAGE de variables de portée "party" (voir
    // core/variables.js, doc/scripting.md/"Variables"), cercle PARTIE comme
    // money/weather — jamais par monde ni par entité. `partyVariables` :
    // déclarations BRUTES (même forme qu'une entité/scène, voir
    // core/entity-parse.js/parseEntity), fournies par l'appelant — le core
    // n'importe AUCUN registre de contenu, jamais un fichier de
    // déclarations global importé ICI. Absent -> sac vide `{}`.
    // TOUJOURS résolu (jamais undefined), même politique EAGER que
    // money/bag/equipment ci-dessus.
    variables: parseVariables(partyVariables, "variables de partie", fail),
    // improvements (voir core/improvements.js/IMPROVEMENT_REGISTRY) :
    // capacités POSSÉDÉES par le joueur, cercle PARTIE comme
    // equipment/variables — jamais par monde. Sac VIDE au départ (aucune
    // improvement débloquée à la création d'une partie neuve), PERSISTANT
    // (une improvement débloquée le reste, jamais réinitialisée comme une
    // variable volatile — voir core/save.js).
    improvements: {},
    // émotes CONNUES (voir core/emotes.js/EMOTE_REGISTRY) : même stockage
    // que improvements, SPARSE et PERSISTANT. Celles du départ d'une partie
    // neuve (config/new-game.js), aucune par défaut.
    emotes,
    // Émote en raccourci (touche "e", voir core/emotes.js/
    // setEmoteShortcut) : aucune au départ, le premier "e" ouvre le choix.
    emoteShortcut: null,
  };
}

// Bascule la perception surnaturelle (touche dédiée, voir
// view/perception-toggle.js — le COOLDOWN anti-spam reste entièrement côté vue,
// rien à en savoir ici). Pur : un simple flip, aucun état d'attente ni
// compte-à-rebours — la bascule est INSTANTANÉE, c'est le SEUIL de
// perception lui-même qui change, jamais un délai. Toute entité dont la
// présence dépend de "perceptionActive" (voir core/presence.js) réagit dès
// le PROCHAIN tick, via le même mécanisme de présence conditionnelle que
// le reste (ex. neon.js) — rien de plus à faire ici.
export function togglePerception(session) {
  return { ...session, perceptionActive: !session.perceptionActive };
}

// Entités de la FACE ACTIVE du monde actif (sans les compagnons, qui ne
// vivent pas dans les mondes). À utiliser pour chercher une entité de
// scène : un monde à deux faces n'a pas de liste `entities` propre, elle
// vit dans `recto`/`verso` (voir resolveFace).
export function activeFaceEntities(session) {
  return resolveFace(session.worlds[session.activeWorldId], session.player.side).entities;
}

// Retire UNE entité (par id) du monde ACTIF — mécanisme générique derrière
// "une entité ramassée disparaît" (voir core/money.js/pickupEntity), mais
// pas spécifique à l'argent : n'importe quel futur effet qui fait
// disparaître une entité du monde peut le réutiliser tel quel. Jamais les
// compagnons (cercle partie, pas dans worlds[x].entities — voir header) :
// ce n'est même pas la même liste. id absent du monde actif -> RÉFÉRENCE
// INCHANGÉE (rien à retirer), jamais une exception — une entité déjà
// retirée (double appel, id périmé) doit se dégrader silencieusement, pas
// planter la partie en cours.
export function removeEntity(session, entityId) {
  const world = session.worlds[session.activeWorldId];
  const face = resolveFace(world, session.player.side);
  const entities = face.entities.filter((entity) => entity.id !== entityId);
  if (entities.length === face.entities.length) return session;
  return updateActiveFace(session, { entities });
}

// Marque UNE entité (par id) du monde ACTIF comme "consumed" — mécanisme
// générique derrière un COLLECTIBLE PERSISTANT (voir core/money.js/
// lootEntity, doc/entity-model.md/"Collectible persistant") : contrairement à
// removeEntity ci-dessus, l'entité N'EST JAMAIS retirée, elle change
// simplement d'état. `consumed` est un champ RUNTIME comme `present`/
// `gotoArrived` (jamais posé au chargement, voir core/entity-parse.js) :
// absent (falsy) tant que
// l'entité n'a jamais été activée, écrit ICI une seule fois. id absent du
// monde actif -> RÉFÉRENCE INCHANGÉE, même politique défensive que
// removeEntity (une entité déjà consommée ou un id périmé ne doit jamais
// planter la partie).
export function markConsumed(session, entityId) {
  const world = session.worlds[session.activeWorldId];
  const face = resolveFace(world, session.player.side);
  if (!face.entities.some((entity) => entity.id === entityId)) return session;
  const entities = face.entities.map((entity) => (entity.id === entityId ? { ...entity, consumed: true } : entity));
  return updateActiveFace(session, { entities });
}

// Champs de la session qu'un effet d'action peut écrire (portée "party",
// voir core/variables.js/applyActionEffects) : les SEULS repris de
// `result.session`, pour une entité comme pour un compagnon. Un effet qui
// écrirait un nouveau champ de partie l'ajoute ICI, une seule fois.
const PARTY_EFFECT_FIELDS = ["variables", "improvements", "emotes"];

// Les champs de partie écrits par les effets, à étaler sur la session
// suivante ; rien si la partie n'a pas bougé (ils traversent alors par
// RÉFÉRENCE inchangée).
function partyEffectFields(session, result) {
  if (result.session === session) return {};
  return Object.fromEntries(PARTY_EFFECT_FIELDS.map((field) => [field, result.session[field]]));
}

// Applique une LISTE d'effets D'ÉCRITURE de variable (voir core/script-parse.js/
// parseActionEffect, core/variables.js/applyActionEffects) déclenchés par
// l'ACTIVATION d'une action portée par UNE entité du monde ACTIF (par id) —
// POINT D'ENTRÉE unique pour la vue (voir view/interaction-handlers.js/
// setVariableEffectsHandler), comme pour les triggers (core/triggers.js) et
// les tranches de séquence dues (core/pending-effects.js) ; la vue ne
// connaît ni resolveFace/withFace ni la
// forme de session.worlds : construit le contexte { entity, world, session }
// attendu par applyActionEffects depuis LA FACE ACTIVE, puis SPLICE le
// résultat aux emplacements RÉELLEMENT touchés (une liste d'effets peut
// mélanger les trois portées — entity/scene/party — dans la MÊME
// activation, voir doc/scripting.md/"Actions multiples filtrées par
// condition") : chaque portée non touchée traverse par RÉFÉRENCE INCHANGÉE.
// `result.session` : SEULS les champs de PARTY_EFFECT_FIELDS en sont repris
// (portée "party") — jamais le reste de l'objet, qui resterait le SESSION
// PRÉ-effets (worlds pas encore patché par un éventuel effet "entity"/
// "scene" de la MÊME liste) si on le reprenait tel quel. id absent du monde
// actif -> session INCHANGÉE, même politique défensive que markConsumed/
// removeEntity. `side` : face qui porte l'entité — celle du joueur par
// défaut (une action s'active toujours sur sa face), explicite pour un
// trigger horaire de l'AUTRE face (voir core/triggers.js).
//
// SÉQUENCE (voir core/sequence.js) : seule la tranche de TÊTE (avant le
// premier `wait`) s'applique ici ; les suivantes attendent sur l'entité
// (`pendingEffects`), qu'elles REMPLACENT — une entité ne suit qu'un fil à
// la fois (le chien sifflé deux fois reprend sa réaction au début). Une
// liste sans `wait` ne touche pas aux tranches en attente. `append` : les
// tranches s'AJOUTENT à celles en attente au lieu de les remplacer — pour
// plusieurs séquences lancées par UN MÊME évènement (deux triggers qui
// répondent au même sifflet, voir core/triggers.js/applyTriggers), qui
// forment un seul fil et vont toutes à leur terme. Les variations
// de `wait` se tirent dans le PRNG de la FACE qui porte l'entité, comme la
// dispersion du butin (spawnScatteredEphemerals).
export function applyEntityActionEffects(session, entityId, effects, side = session.player.side, { append = false } = {}) {
  const world = session.worlds[session.activeWorldId];
  const face = resolveFace(world, side);
  const entity = face.entities.find((e) => e.id === entityId);
  if (!entity) return session;

  const result = applyHeadAndSchedule(effects, { entity, world, session }, face.rngState, append);
  const entityChanged = result.entity !== entity;
  const worldChanged = result.world !== world;
  const partyChanged = result.session !== session;
  if (!entityChanged && !worldChanged && !partyChanged && !result.spawns) return session;

  let nextWorld = worldChanged ? result.world : world;
  if (entityChanged) {
    const entities = face.entities.map((e) => (e.id === entityId ? result.entity : e));
    const patch = result.rngState !== face.rngState ? { entities, rngState: result.rngState } : { entities };
    nextWorld = withFace(nextWorld, side, patch);
  }

  const withWorld = worldChanged || entityChanged ? withActiveWorld(session, nextWorld) : session;
  const next = { ...withWorld, ...partyEffectFields(session, result) };
  return applySpawns(next, result.spawns, side);
}

// Naissances notées par l'effet "spawn" (voir core/variables.js/
// applyActionEffects), réalisées dans l'ordre sur la face `side` par
// spawnEphemeral. Une entité qui porte sa présence (règles, voir
// core/presence.js/tracksPresence) naît ABSENTE (`present: false`) : le
// tick suivant observe son ENTRÉE et la vue joue son enterSound (le
// ghosten qui apparaît) — ou plus tard, quand ses règles l'admettent (la
// perception activée). Sans règle, elle est simplement là.
function applySpawns(session, spawns, side) {
  if (!spawns) return session;
  return spawns.reduce((next, { spec, x }) => spawnEphemeral(next, tracksPresence(spec) ? { ...spec, present: false } : spec, x, side), session);
}

// Tête appliquée, suite mise en attente sur l'entité (voir
// applyEntityActionEffects). Même forme de résultat qu'applyActionEffects,
// plus `rngState` : le PRNG des variations, avancé seulement si un `wait`
// varie (la suite d'une séquence fait toujours changer l'entité).
// `append` : voir applyEntityActionEffects. Chaque tranche porte son délai
// depuis MAINTENANT (core/sequence.js/sequenceTail) : deux séquences mises
// bout à bout restent chacune à l'heure, le décompte les traite toutes
// (core/pending-effects.js/countDownPending).
function applyHeadAndSchedule(effects, context, rngState, append = false) {
  const result = applyActionEffects(sequenceHead(effects), context);
  const tail = sequenceTail(effects, rngState);
  if (tail.chunks.length === 0) return { ...result, rngState };
  const pending = append ? [...(result.entity.pendingEffects ?? []), ...tail.chunks] : tail.chunks;
  return { ...result, entity: { ...result.entity, pendingEffects: pending }, rngState: tail.rngState };
}

// Même chose pour un COMPAGNON (session.companions) : il n'est sur aucune
// face, il suit le joueur. Ses effets voient le monde actif comme porteur
// des variables de scène, comme une entité de la face du joueur. id absent
// -> session INCHANGÉE. Variations de `wait` : dans le PRNG des compagnons
// (companionsRngState), le leur.
export function applyCompanionActionEffects(session, companionId, effects, { append = false } = {}) {
  const companion = session.companions.find((c) => c.id === companionId);
  if (!companion) return session;
  const world = session.worlds[session.activeWorldId];

  const result = applyHeadAndSchedule(effects, { entity: companion, world, session }, session.companionsRngState, append);
  const entityChanged = result.entity !== companion;
  const worldChanged = result.world !== world;
  const partyChanged = result.session !== session;
  if (!entityChanged && !worldChanged && !partyChanged && !result.spawns) return session;

  const withWorld = worldChanged ? withActiveWorld(session, result.world) : session;
  const next = {
    ...withWorld,
    companionsRngState: result.rngState,
    companions: entityChanged ? session.companions.map((c) => (c.id === companionId ? result.entity : c)) : session.companions,
    ...partyEffectFields(session, result),
  };
  // Un compagnon suit le joueur : ce qu'il fait naître naît sur SA face.
  return applySpawns(next, result.spawns, session.player.side);
}

// Crée UNE entité ÉPHÉMÈRE dans le monde ACTIF, à la position x — point
// d'entrée UNIQUE et RÉUTILISABLE pour toute création d'entité EN COURS DE
// JEU (voir doc/entity-model.md/"Entités éphémères"). Appelants
// aujourd'hui : spawnScatteredEphemerals plus bas (butin d'un collectible,
// core/money.js/lootEntitySpawn ; fouille, core/spawn.js/searchContainer),
// le dépôt d'un objet du sac (core/bag.js/dropItem), l'effet "spawn"
// (applySpawns) et la touche debug "e" (view/debug-effects.js) ; demain :
// un objet lâché par un compagnon... — tous passent par cette même
// fonction, jamais une variante par appelant.
//
// `spec` est un descripteur d'entité DÉJÀ RÉSOLU (type, labelKey,
// blocksMovement, observable, interactable, action...) — EXACTEMENT la
// forme qu'une entité obtient en sortie de core/entity-parse.js/parseEntity,
// construit par L'APPELANT (par parseSpawnedEntity, comme le fait
// core/spawn.js) : ce module ne connaît AUCUN registre de types, `spec.type`
// reste une étiquette opaque, jamais résolue ici — c'est la VUE qui sait
// traduire un type en sons/rendu (voir view/audio/entity-sound-entry.js).
//
// Deux règles STRICTES posées ICI, jamais par l'appelant :
//   - `ephemeral: true` — exclut l'entité de la sérialisation
//     (core/save.js/serializeGame) ET la cible pour la purge au départ
//     (travelToWorld ci-dessous).
//   - id dérivé de `world.nextEphemeralId` (compteur dédié, voir
//     createWorldState) — JAMAIS Date.now()/Math.random() : le core reste
//     déterministe, un id ne doit dépendre que d'un état déjà threadé
//     explicitement, comme tout le reste de ce fichier. Chaque face a son
//     compteur : dans un monde à deux faces, l'id porte aussi la face
//     ("ephemeral-verso-0"), pour rester unique dans tout le monde — la vue
//     audio rend les deux faces à la fois et repère une entité par son id
//     (voir core/scene.js, même règle pour les entités déclarées).
//
// Limite anti-prolifération (MAX_EPHEMERALS, config/ephemerals.js) : SEULES
// les entités éphémères comptent (jamais les entités déclarées, dont le
// nombre est maîtrisé à l'écriture). Au dépassement — APRÈS ajout de la
// nouvelle — ÉVICTION DU PLUS ANCIEN éphémère VIVANT : le premier trouvé
// dans l'ordre du tableau, qui EST l'ordre de création (les éphémères sont
// toujours AJOUTÉS en fin de liste, jamais réordonnés) — jamais la nouvelle
// entité elle-même (toujours la dernière, donc jamais la première
// éphémère trouvée). Transitoire par nature : cohérent qu'il cède la place
// plutôt que de refuser la création demandée (alternative "refuser le
// nouveau" possible, non retenue ici).
//
// `side` : la face où l'entité naît — celle du joueur par défaut, celle de
// l'entité qui la fait naître pour l'effet "spawn" (applySpawns).
export function spawnEphemeral(session, spec, x, side = session.player.side) {
  const world = session.worlds[session.activeWorldId];
  const face = resolveFace(world, side);
  const id = isTwoSided(world) ? `ephemeral-${side}-${face.nextEphemeralId}` : `ephemeral-${face.nextEphemeralId}`;
  const entity = { ...spec, id, x, ephemeral: true };
  let entities = [...face.entities, entity];

  if (entities.filter((e) => e.ephemeral).length > MAX_EPHEMERALS) {
    const oldestIndex = entities.findIndex((e) => e.ephemeral);
    entities = [...entities.slice(0, oldestIndex), ...entities.slice(oldestIndex + 1)];
  }

  return updateActiveFace(session, { entities, nextEphemeralId: face.nextEphemeralId + 1 }, side);
}

// Tentatives maximum avant d'abandonner un tirage éparpillé et de retomber
// sur sourceX (voir drawScatteredPosition ci-dessous) — un plafond, jamais
// une boucle sans fin : même un monde très encombré finit TOUJOURS par
// produire une position, au pire celle de la source elle-même.
const SCATTER_MAX_ATTEMPTS = 5;

// Une position est BLOQUÉE si elle tombe dans le corps (BODY_RADIUS) d'une
// entité qui bloque RÉELLEMENT le mouvement (isBlocking : blocksMovement ET
// présente, voir core/presence.js — une entité dormante ne compte jamais).
// `entities` : le monde actif ET les compagnons (voir spawnScatteredEphemerals)
// — un compagnon pourrait bloquer demain, autant rester correct dès
// aujourd'hui plutôt que de le découvrir en contenu.
function isPositionBlocked(x, entities, presenceContext) {
  return entities.some((entity) => isBlocking(entity, presenceContext) && Math.abs(entity.x - x) < BODY_RADIUS);
}

// Tire UNE position ÉPARPILLÉE autour de sourceX, dans [-spread, +spread],
// via le PRNG SEEDÉ passé en paramètre (déterministe : même rngState +
// mêmes paramètres -> même résultat, toujours). BORNES respectées à TOUS
// COUPS : chaque candidat est d'abord CLAMPÉ dans [0, length] (jamais hors
// carte, voir clamp/physics/movement.js) puis, s'il tombe dans un corps
// bloquant, RE-TIRÉ (jusqu'à SCATTER_MAX_ATTEMPTS fois) — filet ultime :
// sourceX lui-même, TOUJOURS valide (c'est la position d'une source qui
// vient d'être activée ; un collectible n'est jamais blocksMovement, voir
// entities/types/crate.js). Un tirage consommé PAR TENTATIVE, jamais plus :
// le rngState renvoyé reflète exactement le nombre de tirages réellement
// faits, pour que l'appelant l'enchaîne sans rien perdre ni dupliquer.
// Exportée : réutilisée par core/spawn.js (placement des plages), et
// vérifiée directement par core/checks/ephemerals.check.js, sans dépendre
// du hasard d'un tirage complet. `presenceContext` : voir
// core/presence.js/presenceContextOf.
export function drawScatteredPosition(sourceX, spread, length, entities, presenceContext, rngState) {
  let state = rngState;
  for (let attempt = 0; attempt < SCATTER_MAX_ATTEMPTS; attempt++) {
    const draw = nextRandom(state);
    state = draw.state;
    const offset = (draw.value * 2 - 1) * spread; // [-spread, +spread]
    const candidate = clamp(sourceX + offset, 0, length);
    if (!isPositionBlocked(candidate, entities, presenceContext)) {
      return { x: candidate, rngState: state };
    }
  }
  return { x: sourceX, rngState: state };
}

// Effet "spawn d'éphémères ÉPARPILLÉS" (appelants : core/money.js/
// lootEntitySpawn, pour action.spawn d'un "loot" ; core/spawn.js/
// searchContainer, pour la fouille d'un conteneur) : fait naître `count` entités éphémères autour de
// sourceX, chacune décalée aléatoirement pour éviter l'empilement sonore —
// voir doc/entity-model.md/"Entités éphémères". Réutilise spawnEphemeral TEL
// QUEL, N fois : même mécanisme, mêmes garanties (id unique, exclusion de
// sérialisation, MAX_EPHEMERALS — l'éviction, si elle se déclenche, agit
// DÉJÀ pendant cette boucle, jamais seulement après coup). `spec` : même
// contrat que spawnEphemeral (descripteur DÉJÀ RÉSOLU, construit par
// l'appelant/la vue — ce module ignore tout du type qui naît). `spread`
// optionnel -> config/tuning-values.js/ephemeralScatterSpread (lu
// DIRECTEMENT, comme MOVE_STEP ci-dessus, pas via resolveTuning : un
// défaut PAR ACTION, pas par entité/son).
//
// rngState : consommé depuis world.rngState — LE MÊME flux que le
// comportement des entités (core/reduce.js/stepEntities), jamais un flux
// séparé. Sûr : ce flux est un état EXPLICITE, threadé ici comme partout
// ailleurs dans ce fichier — consommer un tirage de PLUS, à un point précis
// entre deux ticks (une interaction du joueur), reste parfaitement
// déterministe (même seed + même SUITE d'actions, ticks ET interactions
// confondus, -> même état, toujours).
export function spawnScatteredEphemerals(session, spec, sourceX, count, spread = TUNING_DEFAULTS.ephemeralScatterSpread) {
  const presenceContext = presenceContextOf(session);
  const side = session.player.side;
  let rngState = resolveFace(session.worlds[session.activeWorldId], side).rngState;
  let nextSession = session;

  for (let i = 0; i < count; i++) {
    const currentWorld = nextSession.worlds[nextSession.activeWorldId];
    const currentFace = resolveFace(currentWorld, side);
    const obstacles = [...currentFace.entities, ...nextSession.companions];
    const draw = drawScatteredPosition(sourceX, spread, currentWorld.length, obstacles, presenceContext, rngState);
    rngState = draw.rngState;
    nextSession = spawnEphemeral(nextSession, spec, draw.x);
  }

  return updateActiveFace(nextSession, { rngState }, side);
}

// FACE COURANTE aplatie (voir isTwoSided/resolveFace plus haut) : un monde
// à deux faces expose ICI un objet plat indiscernable d'un monde simple
// (length/playerStart/id/titleKey du monde + entities/segments/music*/...
// de la face courante SEULEMENT) — tout lecteur de getActiveWorld
// ci-dessous ignore donc TOTALEMENT l'existence de deux faces, sans jamais
// avoir à tester isTwoSided lui-même. recto/verso ne fuient jamais dans ce
// résultat, même pour un monde à deux faces.
function flattenActiveFace(world, side) {
  if (!isTwoSided(world)) return world;
  const { recto, verso, ...shared } = world;
  return { ...shared, ...world[side] };
}

// Le monde actuellement actif, AUGMENTÉ des compagnons de la partie (voir
// header) — accesseur pur, utilisé partout où la VUE lit le monde courant
// (view/audio/ — city-scene.js, entity-sounds.js, footsteps.js —,
// view/occupancy.js, view/status-announcements.js, view/menus/). Le core,
// lui, ne s'en sert pas : core/reduce.js lit les mondes BRUTS pour garder
// entités et compagnons séparés. C'est ICI, à la LECTURE SEULE, que
// l'injection a lieu : les compagnons sont ajoutés à la fin de `entities`
// (jamais avant — la première entité d'un monde reste toujours SA première
// entité propre), sans jamais être écrits dans `session.worlds`. Résultat :
// tout consommateur qui lit `getActiveWorld(session).entities` voit le
// compagnon comme une entité comme une autre, sans rien savoir du
// mécanisme — mais session.worlds[x].entities, LUI, ne contient jamais de
// compagnon. C'est cette asymétrie lecture/stockage qui garantit qu'un
// compagnon ne reste JAMAIS résident dans un monde quitté : voir
// travelToWorld ci-dessous, qui range le monde BRUT (session.worlds[...]),
// jamais le résultat de cet accesseur.
export function getActiveWorld(session) {
  const world = session.worlds[session.activeWorldId];
  const face = flattenActiveFace(world, session.player.side);
  if (session.companions.length === 0) return face;
  return { ...face, entities: [...face.entities, ...session.companions] };
}

// L'AUTRE face du monde actif (RECTO/VERSO, voir header) — celle
// que le joueur ne regarde PAS en ce moment. `null` pour un monde simple
// (rien à rendre en plus, voir isTwoSided) : tout appelant doit gérer ce
// cas, jamais un objet vide qui laisserait croire à une face sans entités.
// JAMAIS de compagnons injectés (contrairement à getActiveWorld ci-dessus) :
// ils suivent le joueur, jamais l'autre face — isolation stricte (voir
// core/reduce.js/TICK). Lecture SEULE, utilisée UNIQUEMENT par la vue pour
// le rendu audio ÉTOUFFÉ de l'autre face (view/audio/) —
// jamais par le core lui-même, qui tique déjà les deux faces séparément
// sans passer par cet accesseur.
export function getInactiveFace(session) {
  const world = session.worlds[session.activeWorldId];
  if (!isTwoSided(world)) return null;
  const otherSide = session.player.side === "recto" ? "verso" : "recto";
  return world[otherSide];
}

// Transition vers un autre monde (porte). RANGE le monde courant tel quel
// (gelé, lastVisited horodaté à la minute de jeu COURANTE — session.time,
// voir core/time.js — jamais l'horloge réelle) ; ressort la cible telle
// quelle si déjà visitée (état sauvegardé : entités où elles étaient),
// sinon la construit depuis freshScene et l'ajoute à worlds ; ACTIVE la
// cible et replace le JOUEUR à son point d'arrivée (playerStart) — sans
// toucher au reste de son état, qui traverse la transition intact (le
// joueur n'est jamais rangé dans un monde). Les COMPAGNONS suivent le même
// principe que le joueur (voir header) : jamais rangés avec le monde quitté
// — `currentWorld` ci-dessous lit délibérément `session.worlds[...]`
// directement, PAS `getActiveWorld(session)`, précisément pour ne jamais
// ranger un compagnon dans le monde qu'on quitte (sinon il y resterait
// résident pour toujours, voir getActiveWorld). Leur position est
// réinitialisée près du joueur à l'arrivée, comme le joueur lui-même.
//
// Contrat pur/bord : freshScene doit déjà être passé par parseScene — le
// fetch réseau reste entièrement à la charge de l'appelant (voir
// view/world-travel.js/loadTargetScene), fourni SEULEMENT si la cible n'est pas encore dans
// worlds (ignoré sinon, le monde déjà rangé prime). Cible ni visitée ni
// fournie -> erreur claire plutôt qu'un état à moitié construit.
// x/side (optionnels) : point d'arrivée EXPLICITE — voir core/effects.js/
// "teleport", qui les porte. Absents -> défauts d'une porte ordinaire
// (x -> targetWorld.playerStart, side -> "recto", même pour un monde qui n'a
// qu'une face, ignoré dans ce cas). x fourni est bordé dans [0, longueur de
// la cible], comme placePlayer ci-dessous. Compagnons repositionnés autour
// du point d'arrivée RÉEL (celui-ci, pas playerStart) : tout se résout EN
// UNE FOIS, pour qu'un appelant qui replacerait le joueur APRÈS coup ne
// puisse pas laisser les compagnons autour de playerStart tandis que le
// joueur atterrit ailleurs.
export function travelToWorld(session, targetId, freshScene = null, { x, side = "recto" } = {}) {
  const currentWorld = session.worlds[session.activeWorldId];
  // Purge des entités ÉPHÉMÈRES du monde qu'on quitte (voir
  // doc/entity-model.md/"Entités éphémères") : PILE le moment où ce monde est
  // rangé (gelé) — aucun éphémère ne doit survivre à une sortie de SCÈNE,
  // qu'il ait été ramassé ou non. À DEUX FACES : LES DEUX sont purgées
  // (voir stripEphemeralsFromWorld), pas seulement celle qu'on regardait —
  // on quitte le MONDE entier, pas juste une face. Ici et nulle part
  // ailleurs : le seul autre chemin de sortie d'une scène (retour au menu
  // principal) abandonne la session ENTIÈRE (voir view/city-screen.js/
  // onExit, setSession(null)), rien à purger explicitement dans ce cas.
  const parkedWorld = { ...stripEphemeralsFromWorld(currentWorld), lastVisited: session.time };
  const worldsAfterParking = { ...session.worlds, [session.activeWorldId]: parkedWorld };

  const existingTarget = worldsAfterParking[targetId];
  if (!existingTarget && !freshScene) {
    throw new Error(`travelToWorld: monde "${targetId}" introuvable et aucune scène fournie pour le créer.`);
  }
  const targetWorld = existingTarget ?? createWorldState(freshScene, DEFAULT_SEED);
  const arrivalX = x !== undefined ? clamp(x, 0, targetWorld.length) : targetWorld.playerStart;

  return {
    ...session,
    player: { ...session.player, x: arrivalX, side, blockedBy: null, pushedBy: null },
    worlds: { ...worldsAfterParking, [targetId]: targetWorld },
    activeWorldId: targetId,
    companions: repositionCompanions(session.companions, arrivalX, targetWorld.length),
  };
}

// OUTIL DE DEBUG (voir view/menus/debug-teleport-menu.js, doc/entity-
// model.md/"Mode debug") : remplace le monde ACTIF par un monde NEUF,
// construit depuis la scène relue sur disque (`freshScene`, déjà passée par
// parseScene). Une sauvegarde fige chaque monde à sa première visite (voir
// doc/save.md) : sans cet outil, une scène modifiée ne se voit qu'en
// nouvelle partie. Perdu : l'état de CE monde (positions, variables
// d'entité et de scène, collectibles, stock, éphémères). Conservé : tout le
// reste de la partie (argent, sac, équipement, améliorations, variables de
// partie, heure, météo, compagnons, autres mondes). Le joueur reste à sa
// position, bordée à la nouvelle longueur, et sur sa face si la scène en a
// toujours deux (recto sinon) ; les compagnons sont replacés autour de lui
// comme à toute arrivée. Pure.
export function reloadActiveWorld(session, freshScene) {
  const worldId = session.activeWorldId;
  if (freshScene.id !== worldId) {
    throw new Error(`reloadActiveWorld: la scène relue a l'id "${freshScene.id}", attendu "${worldId}".`);
  }
  const world = createWorldState(freshScene, DEFAULT_SEED);
  const side = isTwoSided(world) ? session.player.side : "recto";
  const x = clamp(session.player.x, 0, world.length);
  return {
    ...session,
    player: { ...session.player, x, side, blockedBy: null, pushedBy: null },
    worlds: { ...session.worlds, [worldId]: world },
    companions: repositionCompanions(session.companions, x, world.length),
  };
}

// OUTIL DE DEBUG (même famille que reloadActiveWorld ci-dessus) : retire de
// la partie tous les mondes sauf l'actif. Chacun sera reconstruit depuis son
// fichier à la prochaine visite (travelToWorld ne le trouve plus dans
// worlds). Utile après avoir modifié plusieurs scènes d'un coup. Pure.
export function forgetInactiveWorlds(session) {
  return { ...session, worlds: { [session.activeWorldId]: session.worlds[session.activeWorldId] } };
}

// Place le joueur + les compagnons à x sur la face `side`, DANS LE MONDE
// ACTUEL — sans toucher activeWorldId/worlds/lastVisited (contrairement à
// travelToWorld : le monde n'est jamais quitté). Primitive PARTAGÉE par
// switchSide (bascule recto<->verso) ci-dessous ET par un teleport SANS
// rechargement (voir core/effects.js/"teleport", reloadIfSame: false —
// appliqué par la vue quand la cible EST le monde actif).
export function placePlayer(session, x, side) {
  const world = session.worlds[session.activeWorldId];
  const arrivalX = clamp(x, 0, world.length);
  return {
    ...session,
    player: { ...session.player, x: arrivalX, side, blockedBy: null, pushedBy: null },
    companions: repositionCompanions(session.companions, arrivalX, world.length),
  };
}

// Bascule de FACE dans le MÊME monde (point de passage recto<->verso, voir
// entities/types/passage.js, doc/scripting.md/action "switchSide") — PAS
// un travelToWorld : le monde n'est pas quitté, currentWorld n'est ni rangé
// ni purgé de ses éphémères (la face laissée n'est pas une "sortie de
// scène" — voir resolveFace/withFace, header). La face quittée continue de
// tiquer normalement (coexistence, voir core/reduce.js) : switchSide ne
// fait QUE changer laquelle porte le joueur et les compagnons, jamais un
// état "actif"/"inactif" séparé du reste. Bascule simplement
// session.player.side vers l'AUTRE face et replace joueur + compagnons au
// point d'arrivée déclaré par l'entité de passage — même principe de
// repositionnement que travelToWorld, mais SANS toucher à activeWorldId ni
// à worlds. arrivalX est une donnée de CONTENU (action.arrivalX, déjà
// validée dans les bornes de la scène au chargement, voir
// core/action-kinds.js/validateSwitchSide) — bordée en plus par
// placePlayer, comme tout point d'arrivée. Simple appel NOMMÉ de placePlayer ci-dessus (face TOUJOURS
// opposée à l'actuelle) — aucune logique propre au-delà de ce choix de face.
export function switchSide(session, arrivalX) {
  const nextSide = session.player.side === "recto" ? "verso" : "recto";
  return placePlayer(session, arrivalX, nextSide);
}
