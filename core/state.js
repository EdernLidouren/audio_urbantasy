// Forme de l'état + construction de l'état initial. Pur, headless : aucun
// DOM, audio, ni API navigateur.
//
// PARTIE (session) multi-lieux, modèle "Animal Crossing" : le joueur
// traverse des MONDES (un par lieu visité) qui persistent, gelés, pendant
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
// traversent les lieux, ne leur appartiennent pas. worlds[id] : ~ l'ancien
// "level" (entités avec
// position/intention/état, longueur, métadonnées), PLUS son propre rngState
// (chaque monde avance sa propre suite de tirages, gelée avec lui) et
// lastVisited (horodaté au rangement, voir travelToWorld, avec la minute de
// jeu COURANTE — voir core/time.js). Un seul monde actif à la fois
// (activeWorldId) : seul lui reçoit les ticks (voir core/reduce.js) — les
// autres sont inertes tant qu'ils ne sont pas réactivés (simulation de
// l'absence : pas codée, lastVisited est le crochet réservé pour ça, voir
// core/time.md).
// time : minutes de jeu écoulées depuis l'origine de la partie — SEULE
// source de vérité temporelle (voir core/time.js pour les dérivations
// minute/heure/jour/mois/saison/année). Avance UNIQUEMENT via
// core/time.js/advanceTime, jamais ici ni dans core/reduce.js.
//
// RECTO/VERSO — scène à DEUX FACES (modèle B, voir CLAUDE.md) : worlds[id]
// peut être SIMPLE (comme ci-dessus) ou contenir un recto ET un verso
// (jamais un seul), chacun sa propre face — voir isTwoSided/resolveFace/
// withFace plus bas. `player.side` ("recto"|"verso", "recto" par défaut) dit
// QUELLE face est ACTIVE (celle qui porte le joueur et les compagnons).
// Étape 2/2 — COEXISTENCE (voir core/reduce.js/TICK) : LES DEUX faces
// tiquent à chaque tour, chacune ISOLÉE dans son propre espace (aucune
// collision, aucun ciblage de comportement, aucune interaction entre
// faces) — seule la face active reçoit joueur/compagnons. `getInactiveFace`
// plus bas expose l'AUTRE face en LECTURE SEULE, pour son rendu audio
// étouffé (voir view/audio/city-scene.js). Basculer de face (voir
// switchSide plus bas) reste DANS le même monde, contrairement à
// travelToWorld qui en change.
//
// COMPAGNONS — cercle PARTIE, comme le joueur (voir CLAUDE.md, brique 1/3
// du système de compagnons) : `companions` est une liste d'entités (MÊME
// forme qu'une entité de lieu — id/type/x/behavior/...) qui vit à CE niveau,
// PAS dans worlds[x].entities. Elle traverse les transitions avec le
// joueur, jamais rangée avec un monde quitté. `companionsRngState` est un
// flux PRNG dédié, DISTINCT de world.rngState : un compagnon est tické à
// CHAQUE tour de jeu quel que soit le monde actif, alors que world.rngState
// est gelé pendant qu'un lieu est rangé (inactif) — les deux ne peuvent pas
// partager le même flux sans que l'un ou l'autre perde son déterminisme
// "de partie" ou "de lieu". INJECTION à la lecture (voir getActiveWorld) :
// un compagnon n'est jamais persisté DANS un monde, seulement mélangé au
// flux d'entités du monde actif au moment où un consommateur (vue, ou le
// réducteur lui-même) le lit — voir le commentaire de getActiveWorld pour
// le détail du mécanisme, c'est le cœur de ce système.

import { TUNING_DEFAULTS } from "../config/tuning-values.js";
import { MAX_COMPANIONS } from "../config/companions.js";
import { MAX_EPHEMERALS } from "../config/ephemerals.js";
import { createSeed, nextRandom } from "./rng.js";
import { clamp } from "./physics/movement.js";
import { isBlocking } from "./presence.js";
import { INITIAL_TIME } from "./time.js";
import { createInitialWeather } from "./weather.js";
import { parseVariables, applyActionEffects } from "./variables.js";

function fail(message) {
  throw new Error(`createInitialState: ${message}`);
}

export const MOVE_STEP = TUNING_DEFAULTS.moveStep;

// Rayon de corps uniforme pour toute entité blocksMovement — pas encore par
// entité/type. Orthogonal à blocksMovement, qui décide SEUL si ce corps
// arrête/exclut quelque chose (voir core/reduce.js). Vit ici (pas dans
// reduce.js) pour être partagé sans détour par core/level.js (validation au
// chargement) ET core/reduce.js (résolution au tick) — une seule source.
export const BODY_RADIUS = 0.25;

// Graine par défaut du PRNG : fixe, jamais Date.now() — le déterminisme
// (voir CLAUDE.md) s'applique aussi en jeu réel, pas seulement en test.
// Utilisée pour CHAQUE monde nouvellement créé (première visite) : même
// comportement qu'avant ce refacto, juste porté par monde plutôt que par
// partie entière.
const DEFAULT_SEED = 1;

// Écart minimal entre deux compagnons repositionnés côte à côte (voir
// repositionCompanions) — réutilise BODY_RADIUS (déjà la référence
// structurelle d'encombrement du jeu, voir physics/overlap.js) plutôt qu'un
// nombre arbitraire de plus : jamais un empilement exact, sans inventer un
// nouveau réglage.
const COMPANION_SPAWN_SPACING = 2 * BODY_RADIUS;

// Compagnon de test PRÉDÉFINI (brique 2/3 : comportement "follow", voir
// core/behaviors/follow.js et CLAUDE.md) : donnée plate, EXACTEMENT la
// forme qu'une entité de lieu obtient en sortie de core/level.js/
// parseEntity — le core ne connaît aucun registre de types (jamais importé
// ici, "buddy" n'est qu'une étiquette opaque, interprétée seulement par la
// vue, voir entities/types/buddy.js). behavior "follow" SANS surcharge :
// suit le joueur (cible par défaut) à distance élastique (voir
// follow.js/DEFAULTS). x laissé à 0 ici : toujours réassigné par
// repositionCompanions juste après, jamais lu tel quel. Pas de `dir` :
// contrairement à wander, follow ne mémorise aucune direction d'un tick à
// l'autre (recalculée à chaque fois depuis la distance à la cible).
// sounds : dupliqué à la main depuis entities/types/buddy.js (comme
// labelKey/descriptionKey ci-dessus) — le rendu audio lit désormais
// `entity.sounds` (résultat de la cascade de core/level.js/parseEntity,
// jamais le registre directement, voir view/audio/city-scene.js), donc CE
// champ doit être porté explicitement ici aussi. Risque de dérive ASSUMÉ
// (même risque que labelKey/descriptionKey déjà) : si buddy.js change ses
// sons, cette copie ne suit pas automatiquement — le core ne peut PAS
// importer le registre de contenu pour se resynchroniser lui-même.
const TEST_COMPANION_SOUNDS = {
  vocal: {
    path: "assets/sounds/entities/dog_medium_vocal",
    loop: false,
    vocalInterval: 6000,
    vocalIntervalVariation: 2000,
    pitchVariation: 0.15,
  },
  movement: {
    path: "assets/sounds/footsteps/entities/dog_medium_walk",
    loop: false,
    pitchVariation: 0.08,
  },
};

function createTestCompanion() {
  return {
    id: "companion-test-dog",
    type: "buddy",
    labelKey: "entity.dog.name",
    descriptionKey: "entity.buddy.description",
    sounds: TEST_COMPANION_SOUNDS,
    blocksMovement: false,
    x: 0,
    behavior: { kind: "follow" },
  };
}

// Replace chaque compagnon près de `playerX` (comme le joueur lui-même,
// voir createInitialState/travelToWorld) — un léger décalage PAR compagnon
// (jamais un empilement exact si la partie en compte plusieurs un jour,
// voir MAX_COMPANIONS), borné aux limites du lieu. Pure.
function repositionCompanions(companions, playerX, length) {
  return companions.map((companion, index) => ({
    ...companion,
    x: clamp(playerX + index * COMPANION_SPAWN_SPACING, 0, length),
  }));
}

// SEUL point d'ajout d'un compagnon à la partie (brique 3/3) — le
// recrutement en jeu n'existe pas encore, mais quand il arrivera, c'est ICI
// qu'il appellera, jamais en poussant directement dans session.companions.
// Politique volontairement simple : à la limite (MAX_COMPANIONS), REFUSE
// (liste renvoyée INCHANGÉE) et SIGNALE l'échec — jamais d'éviction
// silencieuse d'un compagnon existant pour faire de la place. `added` dans
// le retour permet à l'appelant (vue ou test) de distinguer un ajout réussi
// d'un refus sans avoir à recomparer les longueurs lui-même. Pure hormis
// l'avertissement diagnostique (même convention que core/level.js, qui
// avertit déjà sur des cas similaires au chargement).
export function addCompanion(companions, companion) {
  if (companions.length >= MAX_COMPANIONS) {
    console.warn(`addCompanion: limite de ${MAX_COMPANIONS} compagnon(s) déjà atteinte, ajout refusé.`);
    return { companions, added: false };
  }
  return { companions: [...companions, companion], added: true };
}

// SCÈNE À DEUX FACES (modèle B, voir CLAUDE.md/"RECTO/VERSO") : une scène
// PEUT contenir un recto ET un verso (core/level.js/parseLevel garantit les
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
// core/reduce.js/TICK, étape 2/2 : les DEUX faces d'un monde à deux faces
// tiquent désormais, chacune via son propre appel à withFace). Pour un
// monde SIMPLE, `side` est ignoré (il n'a qu'une seule face, lui-même).
export function withFace(world, side, patch) {
  if (!isTwoSided(world)) return { ...world, ...patch };
  return { ...world, [side]: { ...world[side], ...patch } };
}

// Purge les entités ÉPHÉMÈRES d'un monde ENTIER (voir travelToWorld plus
// bas et core/save.js/stripEphemeralEntities, SEULS appelants — factorisé
// ICI pour ne jamais dupliquer cette logique) : SIMPLE -> sa seule face ;
// À DEUX FACES -> LES DEUX, indépendamment (on quitte le LIEU, pas une
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
    // distinguer l'une de l'autre puisqu'elles ne coexistent jamais dans la
    // même liste d'entités (voir header, "étape 1 : une seule face active").
    nextEphemeralId: 0,
  };
}

// Construit l'état d'un monde à partir d'un niveau déjà validé (sortie de
// parseLevel) : entités telles quelles (plus de seed dédiée pour "wander"
// depuis son passage en machine à deux états — il initialise seul son
// propre état au premier tick, voir core/behaviors/wander.js). SIMPLE ->
// une face (comportement STRICTEMENT inchangé). À DEUX FACES -> recto ET
// verso construits chacun via createFaceState, avec des GRAINES DISTINCTES
// (seed pour recto, `${seed}:verso` pour verso — même principe que
// companionsRngState, voir header) : deux faces d'un même monde ne doivent
// jamais tirer la MÊME suite de nombres, elles sont deux lieux indépendants
// qui partagent seulement leur longueur X. lastVisited : toujours au niveau
// du MONDE (jamais par face, voir header) — jamais encore rangé à la
// création, quel que soit le nombre de faces.
function createWorldState(level, seed) {
  const { recto, verso, ...shared } = level;
  if (recto !== undefined) {
    return {
      ...shared,
      lastVisited: 0,
      recto: createFaceState(recto, seed),
      verso: createFaceState(verso, `${seed}:verso`),
    };
  }
  return { ...createFaceState(level, seed), lastVisited: 0 };
}

// Construit une PARTIE avec un premier monde actif. Le joueur démarre à
// level.playerStart (filet à 0 déjà géré par parseLevel). seed optionnel
// (les appelants existants n'en fournissent pas), transmise au premier
// monde. companions optionnel (voir header) : par défaut, UN compagnon de
// test prédéfini (comportement réel du jeu — "Nouvelle partie" démarre
// toujours avec ce compagnon) ; un appelant (movement.check.js en
// particulier, pour les scénarios qui ne concernent pas les compagnons)
// peut passer `{ companions: [] }` pour s'en passer explicitement. Toujours
// plafonné à MAX_COMPANIONS et repositionné près du joueur, quelle que soit
// la source (défaut ou fournie) — l'invariant "près du joueur, jamais plus
// de MAX_COMPANIONS" tient dès la construction, pas seulement après une
// transition.
export function createInitialState(level, seed = DEFAULT_SEED, { companions, partyVariables } = {}) {
  const world = createWorldState(level, seed);
  const requestedCompanions = companions ?? [createTestCompanion()];
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
    player: { x: level.playerStart, side: "recto", blockedBy: null, pushedBy: null },
    worlds: { [level.id]: world },
    activeWorldId: level.id,
    // Horloge de partie : voir core/time.js. INITIAL_TIME = jour 1, mois 1,
    // à l'heure de départ configurée (config/time-values.js/startHour).
    time: INITIAL_TIME,
    // Argent : voir core/money.js. Une partie neuve démarre à 0, jamais rien
    // de plus arbitraire.
    money: 0,
    // Sac d'objets : voir core/bag.js/addItem, SEUL point d'écriture. Une
    // partie neuve démarre avec une paire de rangers ET une paire
    // d'escarpins DÉJÀ DANS LE SAC (pas équipées) — contenu de départ pour
    // tester l'échange gait "boots"/"high_heels" et le tag "chic" (porte à
    // dresscode, voir level/demo.json) sans avoir à en ramasser en jeu (voir
    // core/items.js/ITEM_REGISTRY.combat_boots/high_heels). Rien d'autre :
    // pas d'argent, ni le reste du contenu ramassable normalement.
    bag: [{ type: "combat_boots" }, { type: "high_heels" }],
    // Équipement : voir core/equipment.js. Une partie neuve démarre avec
    // une paire de baskets déjà ÉQUIPÉE au slot "feet" — jamais posée dans
    // le sac d'abord : ce n'est pas un ramassage, juste l'état de départ.
    // Plus naturel que pieds nus, et donne un équipement non vide dès le
    // premier pas pour l'entendre/le tester (gait "shoes", voir
    // core/items.js/ITEM_REGISTRY.sneakers).
    equipment: { feet: { type: "sneakers" } },
    companions: repositionCompanions(requestedCompanions.slice(0, MAX_COMPANIONS), level.playerStart, level.length),
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
    // view/audio/city-scene.js) : booléen simple, cercle PARTIE comme side/
    // time/money — jamais par monde. false par défaut : une partie neuve
    // démarre en perception normale.
    perceptionActive: false,
    // variables : STOCKAGE de variables de portée "party" (voir
    // core/variables.js/CLAUDE.md), cercle PARTIE comme money/weather —
    // jamais par monde ni par entité. `partyVariables` : déclarations BRUTES
    // (même forme qu'une entité/scène, voir core/level.js/parseEntity),
    // fournies par l'appelant — le core n'importe AUCUN registre de contenu
    // (voir CLAUDE.md, "réglages en cascade"), jamais un fichier de
    // déclarations global importé ICI. Absent -> sac vide `{}`, comportement
    // inchangé pour tout appelant existant (aucun n'en fournit encore).
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
  };
}

// Bascule la perception surnaturelle (touche dédiée, voir
// view/city-screen.js — le COOLDOWN anti-spam reste entièrement côté vue,
// rien à en savoir ici). Pur : un simple flip, aucun état d'attente ni
// compte-à-rebours — la bascule est INSTANTANÉE, c'est le SEUIL de
// perception lui-même qui change, jamais un délai. Toute entité dont la
// présence dépend de "perceptionActive" (voir core/presence.js) réagit dès
// le PROCHAIN tick, via le même mécanisme de présence conditionnelle que
// le reste (ex. neon.js) — rien de plus à faire ici.
export function togglePerception(session) {
  return { ...session, perceptionActive: !session.perceptionActive };
}

// Retire UNE entité (par id) du lieu ACTIF — mécanisme générique derrière
// "une entité ramassée disparaît" (voir core/money.js/pickupEntity), mais
// pas spécifique à l'argent : n'importe quel futur effet qui fait
// disparaître une entité du monde peut le réutiliser tel quel. Jamais les
// compagnons (cercle partie, pas dans worlds[x].entities — voir header) :
// ce n'est même pas la même liste. id absent du lieu actif -> RÉFÉRENCE
// INCHANGÉE (rien à retirer), jamais une exception — une entité déjà
// retirée (double appel, id périmé) doit se dégrader silencieusement, pas
// planter la partie en cours.
export function removeEntity(session, entityId) {
  const world = session.worlds[session.activeWorldId];
  const face = resolveFace(world, session.player.side);
  const entities = face.entities.filter((entity) => entity.id !== entityId);
  if (entities.length === face.entities.length) return session;
  const nextWorld = withFace(world, session.player.side, { entities });
  return { ...session, worlds: { ...session.worlds, [session.activeWorldId]: nextWorld } };
}

// Marque UNE entité (par id) du lieu ACTIF comme "consumed" — mécanisme
// générique derrière un COLLECTIBLE PERSISTANT (voir core/money.js/
// lootEntity, entities/model.md/"Collectible persistant") : contrairement à
// removeEntity ci-dessus, l'entité N'EST JAMAIS retirée, elle change
// simplement d'état. `consumed` est un champ RUNTIME comme `present`/
// `gotoArrived` (jamais posé par core/level.js) : absent (falsy) tant que
// l'entité n'a jamais été activée, écrit ICI une seule fois. id absent du
// lieu actif -> RÉFÉRENCE INCHANGÉE, même politique défensive que
// removeEntity (une entité déjà consommée ou un id périmé ne doit jamais
// planter la partie).
export function markConsumed(session, entityId) {
  const world = session.worlds[session.activeWorldId];
  const face = resolveFace(world, session.player.side);
  if (!face.entities.some((entity) => entity.id === entityId)) return session;
  const entities = face.entities.map((entity) => (entity.id === entityId ? { ...entity, consumed: true } : entity));
  const nextWorld = withFace(world, session.player.side, { entities });
  return { ...session, worlds: { ...session.worlds, [session.activeWorldId]: nextWorld } };
}

// Applique une LISTE d'effets D'ÉCRITURE de variable (voir core/level.js/
// parseActionEffect, core/variables.js/applyActionEffects) déclenchés par
// l'ACTIVATION d'une action portée par UNE entité du lieu ACTIF (par id) —
// POINT D'ENTRÉE unique pour la vue (voir view/interaction.js/
// setVariableEffectsHandler), qui ne connaît ni resolveFace/withFace ni la
// forme de session.worlds : construit le contexte { entity, world, session }
// attendu par applyActionEffects depuis LA FACE ACTIVE, puis SPLICE le
// résultat aux emplacements RÉELLEMENT touchés (une liste d'effets peut
// mélanger les trois portées — entity/scene/party — dans la MÊME
// activation, voir core/scripting.md/"Actions multiples filtrées par
// condition") : chaque portée non touchée traverse par RÉFÉRENCE INCHANGÉE.
// `result.session` : SEULS `.variables`/`.improvements` en sont repris
// (portée "party") — jamais le reste de l'objet, qui resterait le SESSION
// PRÉ-effets (worlds pas encore patché par un éventuel effet "entity"/
// "scene" de la MÊME liste) si on le reprenait tel quel. id absent du lieu
// actif -> session INCHANGÉE, même politique défensive que markConsumed/
// removeEntity. `side` : face qui porte l'entité — celle du joueur par
// défaut (une action s'active toujours sur sa face), explicite pour un
// trigger horaire de l'AUTRE face (voir core/triggers.js).
export function applyEntityActionEffects(session, entityId, effects, side = session.player.side) {
  const world = session.worlds[session.activeWorldId];
  const face = resolveFace(world, side);
  const entity = face.entities.find((e) => e.id === entityId);
  if (!entity) return session;

  const result = applyActionEffects(effects, { entity, world, session });
  const entityChanged = result.entity !== entity;
  const worldChanged = result.world !== world;
  const partyChanged = result.session !== session;
  if (!entityChanged && !worldChanged && !partyChanged) return session;

  let nextWorld = worldChanged ? result.world : world;
  if (entityChanged) {
    const entities = face.entities.map((e) => (e.id === entityId ? result.entity : e));
    nextWorld = withFace(nextWorld, side, { entities });
  }

  return {
    ...session,
    worlds: worldChanged || entityChanged ? { ...session.worlds, [session.activeWorldId]: nextWorld } : session.worlds,
    variables: partyChanged ? result.session.variables : session.variables,
    improvements: partyChanged ? result.session.improvements : session.improvements,
  };
}

// Crée UNE entité ÉPHÉMÈRE dans le lieu ACTIF, à la position x — point
// d'entrée UNIQUE et RÉUTILISABLE pour toute création d'entité EN COURS DE
// JEU (voir entities/model.md/"Entités éphémères"). Deux appelants
// aujourd'hui : la touche debug "e" (voir view/city-screen.js) et
// spawnScatteredEphemerals plus bas (effet "spawn" d'une action, voir
// core/money.js/lootEntitySpawn) ; demain : un objet lâché par un
// compagnon, un autre effet... — tous passeraient par cette même fonction,
// jamais une variante par appelant.
//
// `spec` est un descripteur d'entité DÉJÀ RÉSOLU (type, labelKey,
// blocksMovement, observable, interactable, action...) — EXACTEMENT la
// forme qu'une entité obtient en sortie de core/level.js/parseEntity,
// construit par L'APPELANT (voir createTestCompanion plus haut, même
// principe) : ce module ne connaît AUCUN registre de types, `spec.type`
// reste une étiquette opaque, jamais résolue ici — c'est la VUE qui sait
// traduire un type en sons/rendu (voir view/audio/city-scene.js).
//
// Deux règles STRICTES posées ICI, jamais par l'appelant :
//   - `ephemeral: true` — exclut l'entité de la sérialisation
//     (core/save.js/serializeGame) ET la cible pour la purge au départ
//     (travelToWorld ci-dessous).
//   - id dérivé de `world.nextEphemeralId` (compteur dédié, voir
//     createWorldState) — JAMAIS Date.now()/Math.random() : le core reste
//     déterministe, un id ne doit dépendre que d'un état déjà threadé
//     explicitement, comme tout le reste de ce fichier.
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
export function spawnEphemeral(session, spec, x) {
  const world = session.worlds[session.activeWorldId];
  const face = resolveFace(world, session.player.side);
  const entity = { ...spec, id: `ephemeral-${face.nextEphemeralId}`, x, ephemeral: true };
  let entities = [...face.entities, entity];

  if (entities.filter((e) => e.ephemeral).length > MAX_EPHEMERALS) {
    const oldestIndex = entities.findIndex((e) => e.ephemeral);
    entities = [...entities.slice(0, oldestIndex), ...entities.slice(oldestIndex + 1)];
  }

  const nextWorld = withFace(world, session.player.side, { entities, nextEphemeralId: face.nextEphemeralId + 1 });
  return { ...session, worlds: { ...session.worlds, [session.activeWorldId]: nextWorld } };
}

// Tentatives maximum avant d'abandonner un tirage éparpillé et de retomber
// sur sourceX (voir drawScatteredPosition ci-dessous) — un plafond, jamais
// une boucle sans fin : même un lieu très encombré finit TOUJOURS par
// produire une position, au pire celle de la source elle-même.
const SCATTER_MAX_ATTEMPTS = 5;

// Une position est BLOQUÉE si elle tombe dans le corps (BODY_RADIUS) d'une
// entité qui bloque RÉELLEMENT le mouvement (isBlocking : blocksMovement ET
// présente, voir core/presence.js — une entité dormante ne compte jamais).
// `entities` : le lieu actif ET les compagnons (voir spawnScatteredEphemerals)
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
// EXPORTÉE (bien qu'interne à spawnScatteredEphemerals en usage normal)
// SEULEMENT pour permettre à core/movement.check.js de vérifier
// directement, sans dépendre du hasard d'un tirage complet, que les BORNES
// (carte + obstacles) sont RÉELLEMENT respectées — jamais appelée hors
// core/state.js/movement.check.js.
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

// Effet "spawn d'éphémères ÉPARPILLÉS" (voir view/interaction.js,
// ACTION_HANDLERS.loot — action.spawn ; core/money.js/lootEntitySpawn, seul
// appelant aujourd'hui) : fait naître `count` entités éphémères autour de
// sourceX, chacune décalée aléatoirement pour éviter l'empilement sonore —
// voir entities/model.md/"Entités éphémères". Réutilise spawnEphemeral TEL
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
  const presenceContext = { time: session.time };
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

  const finalWorld = nextSession.worlds[nextSession.activeWorldId];
  const nextWorld = withFace(finalWorld, side, { rngState });
  return { ...nextSession, worlds: { ...nextSession.worlds, [nextSession.activeWorldId]: nextWorld } };
}

// Le monde actuellement actif, AUGMENTÉ des compagnons de la partie (voir
// header) — accesseur pur, utilisé partout où "session.level" existait
// avant le refacto multi-mondes (core/reduce.js, view/audio/city-scene.js,
// view/city-screen.js). C'est ICI, à la LECTURE SEULE, que l'injection a
// lieu : les compagnons sont ajoutés à la fin de `entities` (jamais avant —
// la première entité d'un lieu reste toujours SA première entité propre),
// sans jamais être écrits dans `session.worlds`. Résultat : tout
// consommateur qui lit `getActiveWorld(session).entities` (vue comprise)
// voit le compagnon comme une entité comme une autre, sans rien savoir du
// mécanisme — mais session.worlds[x].entities, LUI, ne contient jamais de
// compagnon. C'est cette asymétrie lecture/stockage qui garantit qu'un
// compagnon ne reste JAMAIS résident dans un lieu quitté : voir
// travelToWorld ci-dessous, qui range le monde BRUT (session.worlds[...]),
// jamais le résultat de cet accesseur.
// FACE COURANTE aplatie (voir isTwoSided/resolveFace plus haut) : un monde
// à deux faces expose ICI un objet plat indiscernable d'un monde simple
// (length/playerStart/id/titleKey du monde + entities/segments/music*/...
// de la face courante SEULEMENT) — tout consommateur externe (vue,
// core/reduce.js) ignore donc TOTALEMENT l'existence de deux faces, sans
// jamais avoir à tester isTwoSided lui-même. recto/verso ne fuient jamais
// dans ce résultat, même pour un monde à deux faces.
function flattenActiveFace(world, side) {
  if (!isTwoSided(world)) return world;
  const { recto, verso, ...shared } = world;
  return { ...shared, ...world[side] };
}

export function getActiveWorld(session) {
  const world = session.worlds[session.activeWorldId];
  const face = flattenActiveFace(world, session.player.side);
  if (session.companions.length === 0) return face;
  return { ...face, entities: [...face.entities, ...session.companions] };
}

// L'AUTRE face du monde actif (RECTO/VERSO étape 2/2, voir header) — celle
// que le joueur ne regarde PAS en ce moment. `null` pour un monde simple
// (rien à rendre en plus, voir isTwoSided) : tout appelant doit gérer ce
// cas, jamais un objet vide qui laisserait croire à une face sans entités.
// JAMAIS de compagnons injectés (contrairement à getActiveWorld ci-dessus) :
// ils suivent le joueur, jamais l'autre face — isolation stricte (voir
// core/reduce.js/TICK). Lecture SEULE, utilisée UNIQUEMENT par la vue pour
// le rendu audio ÉTOUFFÉ de l'autre face (view/audio/city-scene.js) —
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
// sinon la construit depuis freshLevel et l'ajoute à worlds ; ACTIVE la
// cible et replace le JOUEUR à son point d'arrivée (playerStart) — sans
// toucher au reste de son état, qui traverse la transition intact (le
// joueur n'est jamais rangé dans un monde). Les COMPAGNONS suivent le même
// principe que le joueur (voir header) : jamais rangés avec le monde quitté
// — `currentWorld` ci-dessous lit délibérément `session.worlds[...]`
// directement, PAS `getActiveWorld(session)`, précisément pour ne jamais
// ranger un compagnon dans le lieu qu'on quitte (sinon il y resterait
// résident pour toujours, voir getActiveWorld). Leur position est
// réinitialisée près du joueur à l'arrivée, comme le joueur lui-même.
//
// Contrat pur/bord : freshLevel doit déjà être passé par parseLevel — le
// fetch réseau reste entièrement à la charge de l'appelant (voir
// view/city-screen.js), fourni SEULEMENT si la cible n'est pas encore dans
// worlds (ignoré sinon, le monde déjà rangé prime). Cible ni visitée ni
// fournie -> erreur claire plutôt qu'un état à moitié construit.
// x/side (optionnels) : point d'arrivée EXPLICITE — voir core/effects.js/
// "teleport", qui les porte. Absents -> comportement HISTORIQUE inchangé
// (x -> targetWorld.playerStart, side -> "recto", même pour un monde qui n'a
// qu'une face, ignoré dans ce cas). x fourni est bordé dans [0, longueur de
// la cible], comme placePlayer ci-dessous. Compagnons repositionnés autour
// du point d'arrivée RÉEL (celui-ci, pas playerStart) — avant ce paramètre,
// un appelant qui replaçait le joueur APRÈS coup (voir view/city-screen.js/
// performTransition, historique) laissait les compagnons autour de
// playerStart tandis que le joueur atterrissait ailleurs ; ce paramètre
// élimine cette classe de désync en résolvant tout EN UNE FOIS.
export function travelToWorld(session, targetId, freshLevel = null, { x, side = "recto" } = {}) {
  const currentWorld = session.worlds[session.activeWorldId];
  // Purge des entités ÉPHÉMÈRES du lieu qu'on quitte (voir
  // entities/model.md/"Entités éphémères") : PILE le moment où ce lieu est
  // rangé (gelé) — aucun éphémère ne doit survivre à une sortie de SCÈNE,
  // qu'il ait été ramassé ou non. À DEUX FACES : LES DEUX sont purgées
  // (voir stripEphemeralsFromWorld), pas seulement celle qu'on regardait —
  // on quitte le LIEU entier, pas juste une face. Ici et nulle part
  // ailleurs : le seul autre chemin de sortie d'une scène (retour au menu
  // principal) abandonne la session ENTIÈRE (voir view/city-screen.js/
  // onExit, setSession(null)), rien à purger explicitement dans ce cas.
  const parkedWorld = { ...stripEphemeralsFromWorld(currentWorld), lastVisited: session.time };
  const worldsAfterParking = { ...session.worlds, [session.activeWorldId]: parkedWorld };

  const existingTarget = worldsAfterParking[targetId];
  if (!existingTarget && !freshLevel) {
    throw new Error(`travelToWorld: monde "${targetId}" introuvable et aucun niveau fourni pour le créer.`);
  }
  const targetWorld = existingTarget ?? createWorldState(freshLevel, DEFAULT_SEED);
  const arrivalX = x !== undefined ? clamp(x, 0, targetWorld.length) : targetWorld.playerStart;

  return {
    ...session,
    player: { ...session.player, x: arrivalX, side, blockedBy: null, pushedBy: null },
    worlds: { ...worldsAfterParking, [targetId]: targetWorld },
    activeWorldId: targetId,
    companions: repositionCompanions(session.companions, arrivalX, targetWorld.length),
  };
}

// Place le joueur + les compagnons à x sur la face `side`, DANS LE MONDE
// ACTUEL — sans toucher activeWorldId/worlds/lastVisited (contrairement à
// travelToWorld : le lieu n'est jamais quitté). Primitive PARTAGÉE par
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
// entities/types/passage.js, core/scripting.md/action "switchSide") — PAS
// un travelToWorld : le lieu n'est pas quitté, currentWorld n'est ni rangé
// ni purgé de ses éphémères (la face laissée n'est pas une "sortie de
// scène" — voir resolveFace/withFace, header). Depuis l'étape 2/2, la face
// quittée continue de tiquer normalement (coexistence, voir
// core/reduce.js) : switchSide ne fait QUE changer laquelle porte le joueur
// et les compagnons, jamais un état "actif"/"inactif" séparé du reste.
// Bascule simplement session.player.side vers l'AUTRE face et replace
// joueur +
// compagnons au point d'arrivée déclaré par l'entité de passage — même
// principe de repositionnement que travelToWorld, mais SANS toucher à
// activeWorldId ni à worlds. arrivalX est une donnée de CONTENU
// (action.arrivalX, jamais validée en bornes par core/level.js — voir son
// commentaire sur `action`) — bordée par placePlayer, comme tout point
// d'arrivée. Simple appel NOMMÉ de placePlayer ci-dessus (face TOUJOURS
// opposée à l'actuelle) — aucune logique propre au-delà de ce choix de face.
export function switchSide(session, arrivalX) {
  const nextSide = session.player.side === "recto" ? "verso" : "recto";
  return placePlayer(session, arrivalX, nextSide);
}
