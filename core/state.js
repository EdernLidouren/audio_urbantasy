// Forme de l'état + construction de l'état initial. Pur, headless : aucun
// DOM, audio, ni API navigateur.
//
// PARTIE (session) multi-lieux, modèle "Animal Crossing" : le joueur
// traverse des MONDES (un par lieu visité) qui persistent, gelés, pendant
// son absence — une re-visite les ressort tels qu'ils ont été laissés
// (PNJ compris), pas réinitialisés. Forme :
//   { player, worlds: { [id]: <état d'un monde> }, activeWorldId, parkCounter }
// player : l'état du joueur (position, extensible plus tard — inventaire...).
// Vit ICI, JAMAIS dans les entités d'un monde : il traverse les lieux, ne
// leur appartient pas. worlds[id] : ~ l'ancien "level" (entités avec
// position/intention/état, longueur, métadonnées), PLUS son propre rngState
// (chaque monde avance sa propre suite de tirages, gelée avec lui) et
// lastVisited (horodaté au rangement, voir travelToWorld). Un seul monde
// actif à la fois (activeWorldId) : seul lui reçoit les ticks (voir
// core/reduce.js) — les autres sont inertes tant qu'ils ne sont pas
// réactivés (simulation de l'absence : pas codée, viendra avec une horloge,
// lastVisited est le crochet réservé pour ça).

// MOVE_STEP est un réglage de feeling. Le core importe UNIQUEMENT les
// valeurs pures (config/tuning-values.js), jamais config/tuning.js — ce
// dernier connecte aussi le registre d'entités et la logique de cascade, que
// le core n'a aucune raison de draîner pour lire un seul nombre.
import { TUNING_DEFAULTS } from "../config/tuning-values.js";
import { createSeed } from "./rng.js";

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
// monde.
export function createInitialState(level, seed = DEFAULT_SEED) {
  const world = createWorldState(level, seed);
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
    // Compteur monotone de rangements de monde, source de lastVisited (voir
    // travelToWorld) — jamais un monde rangé avant la première transition.
    parkCounter: 0,
  };
}

// Le monde actuellement actif (seul à recevoir les ticks) — accesseur pur,
// utilisé partout où "session.level" existait avant ce refacto (voir
// core/reduce.js, view/audio/city-scene.js, view/city-screen.js).
export function getActiveWorld(session) {
  return session.worlds[session.activeWorldId];
}

// Transition vers un autre monde (porte). RANGE le monde courant tel quel
// (gelé, lastVisited horodaté par parkCounter) ; ressort la cible telle
// quelle si déjà visitée (état sauvegardé : entités où elles étaient),
// sinon la construit depuis freshLevel et l'ajoute à worlds ; ACTIVE la
// cible et replace le JOUEUR à son point d'arrivée (playerStart) — sans
// toucher au reste de son état, qui traverse la transition intact (le
// joueur n'est jamais rangé dans un monde).
//
// Contrat pur/bord : freshLevel doit déjà être passé par parseLevel — le
// fetch réseau reste entièrement à la charge de l'appelant (voir
// view/city-screen.js), fourni SEULEMENT si la cible n'est pas encore dans
// worlds (ignoré sinon, le monde déjà rangé prime). Cible ni visitée ni
// fournie -> erreur claire plutôt qu'un état à moitié construit.
export function travelToWorld(session, targetId, freshLevel = null) {
  const nextParkCounter = session.parkCounter + 1;
  const currentWorld = getActiveWorld(session);
  const worldsAfterParking = {
    ...session.worlds,
    [session.activeWorldId]: { ...currentWorld, lastVisited: nextParkCounter },
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
    parkCounter: nextParkCounter,
  };
}
