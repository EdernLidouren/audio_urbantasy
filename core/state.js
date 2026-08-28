// Forme de l'état + construction de l'état initial. Pur, headless : aucun
// DOM, audio, ni API navigateur.
//
// PARTIE (session) multi-lieux, modèle "Animal Crossing" : le joueur
// traverse des MONDES (un par lieu visité) qui persistent, gelés, pendant
// son absence — une re-visite les ressort tels qu'ils ont été laissés
// (PNJ compris), pas réinitialisés. Forme :
//   { player, worlds: { [id]: <état d'un monde> }, activeWorldId, time,
//     companions, companionsRngState }
// player : l'état du joueur (position, extensible plus tard — inventaire...).
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
import { createSeed } from "./rng.js";
import { clamp } from "./physics/movement.js";
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
// parseLevel) : entités à leur position de départ (dir initiale pour les
// entités "wander", seule pièce d'état mobile qui n'existe pas encore sur
// l'entité telle que produite par parseLevel), PRNG propre au monde, et
// lastVisited à 0 (jamais encore rangé).
function createWorldState(level, seed) {
  return {
    ...level,
    entities: level.entities.map((entity) =>
      entity.behavior?.kind === "wander" ? { ...entity, dir: 1 } : entity
    ),
    rngState: createSeed(seed),
    lastVisited: 0,
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
    companions: repositionCompanions(requestedCompanions.slice(0, MAX_COMPANIONS), level.playerStart, level.length),
    // Flux PRNG dédié aux compagnons (voir header) : dérivé du même seed,
    // mais hashé sous une clé distincte — jamais la même suite que le
    // premier monde (createSeed accepte une chaîne, voir core/rng.js).
    companionsRngState: createSeed(`companions:${seed}`),
  };
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
  const worldsAfterParking = {
    ...session.worlds,
    [session.activeWorldId]: { ...currentWorld, lastVisited: session.time },
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
