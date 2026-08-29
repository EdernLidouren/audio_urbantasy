// Forme de l'état + construction de l'état initial. Pur, headless : aucun
// DOM, audio, ni API navigateur.
//
// PARTIE (session) multi-lieux, modèle "Animal Crossing" : le joueur
// traverse des MONDES (un par lieu visité) qui persistent, gelés, pendant
// son absence — une re-visite les ressort tels qu'ils ont été laissés
// (PNJ compris), pas réinitialisés. Forme :
//   { player, worlds: { [id]: <état d'un monde> }, activeWorldId, time,
//     money, companions, companionsRngState }
// player : l'état du joueur (position, extensible plus tard — inventaire...).
// money : entier, cercle PARTIE (comme time) — voir core/money.js/addMoney,
// SEUL point d'écriture.
// Vit ICI, JAMAIS dans les entités d'un monde : il traverse les lieux, ne
// leur appartient pas. worlds[id] : ~ l'ancien "level" (entités avec
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
function createTestCompanion() {
  return {
    id: "companion-test-dog",
    type: "buddy",
    labelKey: "entity.dog",
    descriptionKey: "entity.buddy.description",
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

// Construit l'état d'un monde à partir d'un niveau déjà validé (sortie de
// parseLevel) : entités telles quelles (plus de seed dédiée pour "wander"
// depuis son passage en machine à deux états — il initialise seul son
// propre état au premier tick, voir core/behaviors/wander.js), PRNG propre
// au monde, et lastVisited à 0 (jamais encore rangé).
function createWorldState(level, seed) {
  return {
    ...level,
    rngState: createSeed(seed),
    lastVisited: 0,
    // Compteur d'ids ÉPHÉMÈRES, dédié à ce monde — voir spawnEphemeral plus
    // bas. Monotone, JAMAIS décrémenté (contrairement au nombre d'éphémères
    // VIVANTS, qui peut baisser au gré des ramassages/purges) : garantit un
    // id jamais réutilisé au sein de ce monde, pour toute sa durée de vie
    // (même à travers plusieurs visites — ce compteur n'est jamais remis à
    // zéro après sa création initiale).
    nextEphemeralId: 0,
  };
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
export function createInitialState(level, seed = DEFAULT_SEED, { companions } = {}) {
  const world = createWorldState(level, seed);
  const requestedCompanions = companions ?? [createTestCompanion()];
  return {
    // blockedBy : id de l'entité bloquante contre laquelle le joueur bute CE
    // tick, ou null. pushedBy : id de l'entité dont la résolution de
    // chevauchement a forcé le joueur à se déplacer CE tick (cas curatif,
    // voir core/reduce.js), ou null — distinct de blockedBy (bute en
    // avançant vs déjà chevauché malgré lui). Les deux transitoires,
    // recalculés à chaque tick, jamais accumulés.
    player: { x: level.playerStart, blockedBy: null, pushedBy: null },
    worlds: { [level.id]: world },
    activeWorldId: level.id,
    // Horloge de partie : voir core/time.js. INITIAL_TIME = jour 1, mois 1,
    // à l'heure de départ configurée (config/time-values.js/startHour).
    time: INITIAL_TIME,
    // Argent : voir core/money.js. Une partie neuve démarre à 0, jamais rien
    // de plus arbitraire.
    money: 0,
    companions: repositionCompanions(requestedCompanions.slice(0, MAX_COMPANIONS), level.playerStart, level.length),
    // Flux PRNG dédié aux compagnons (voir header) : dérivé du même seed,
    // mais hashé sous une clé distincte — jamais la même suite que le
    // premier monde (createSeed accepte une chaîne, voir core/rng.js).
    companionsRngState: createSeed(`companions:${seed}`),
  };
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
  const entities = world.entities.filter((entity) => entity.id !== entityId);
  if (entities.length === world.entities.length) return session;
  return { ...session, worlds: { ...session.worlds, [session.activeWorldId]: { ...world, entities } } };
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
  if (!world.entities.some((entity) => entity.id === entityId)) return session;
  const entities = world.entities.map((entity) => (entity.id === entityId ? { ...entity, consumed: true } : entity));
  return { ...session, worlds: { ...session.worlds, [session.activeWorldId]: { ...world, entities } } };
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
  const entity = { ...spec, id: `ephemeral-${world.nextEphemeralId}`, x, ephemeral: true };
  let entities = [...world.entities, entity];

  if (entities.filter((e) => e.ephemeral).length > MAX_EPHEMERALS) {
    const oldestIndex = entities.findIndex((e) => e.ephemeral);
    entities = [...entities.slice(0, oldestIndex), ...entities.slice(oldestIndex + 1)];
  }

  const nextWorld = { ...world, entities, nextEphemeralId: world.nextEphemeralId + 1 };
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
  let rngState = session.worlds[session.activeWorldId].rngState;
  let nextSession = session;

  for (let i = 0; i < count; i++) {
    const currentWorld = nextSession.worlds[nextSession.activeWorldId];
    const obstacles = [...currentWorld.entities, ...nextSession.companions];
    const draw = drawScatteredPosition(sourceX, spread, currentWorld.length, obstacles, presenceContext, rngState);
    rngState = draw.rngState;
    nextSession = spawnEphemeral(nextSession, spec, draw.x);
  }

  const finalWorld = nextSession.worlds[nextSession.activeWorldId];
  return { ...nextSession, worlds: { ...nextSession.worlds, [nextSession.activeWorldId]: { ...finalWorld, rngState } } };
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
export function getActiveWorld(session) {
  const world = session.worlds[session.activeWorldId];
  if (session.companions.length === 0) return world;
  return { ...world, entities: [...world.entities, ...session.companions] };
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
export function travelToWorld(session, targetId, freshLevel = null) {
  const currentWorld = session.worlds[session.activeWorldId];
  // Purge des entités ÉPHÉMÈRES du lieu qu'on quitte (voir
  // entities/model.md/"Entités éphémères") : PILE le moment où ce lieu est
  // rangé (gelé) — aucun éphémère ne doit survivre à une sortie de scène,
  // qu'il ait été ramassé ou non. Ici et nulle part ailleurs : le seul
  // autre chemin de sortie d'une scène (retour au menu principal) abandonne
  // la session ENTIÈRE (voir view/city-screen.js/onExit, setSession(null)),
  // rien à purger explicitement dans ce cas.
  const purgedEntities = currentWorld.entities.filter((entity) => !entity.ephemeral);
  const worldsAfterParking = {
    ...session.worlds,
    [session.activeWorldId]: { ...currentWorld, entities: purgedEntities, lastVisited: session.time },
  };

  const existingTarget = worldsAfterParking[targetId];
  if (!existingTarget && !freshLevel) {
    throw new Error(`travelToWorld: monde "${targetId}" introuvable et aucun niveau fourni pour le créer.`);
  }
  const targetWorld = existingTarget ?? createWorldState(freshLevel, DEFAULT_SEED);

  return {
    ...session,
    player: { ...session.player, x: targetWorld.playerStart, blockedBy: null, pushedBy: null },
    worlds: { ...worldsAfterParking, [targetId]: targetWorld },
    activeWorldId: targetId,
    companions: repositionCompanions(session.companions, targetWorld.playerStart, targetWorld.length),
  };
}
