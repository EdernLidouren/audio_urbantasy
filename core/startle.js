// ENTITÉS FAROUCHES (voir doc/entity-model.md/"Entités farouches") — une
// entité qui porte `startle` (cascade instance -> archétype, voir
// core/entity-parse.js/parseStartle) s'enfuit quand le joueur s'approche :
// un oiseau posé s'envole. Pur, headless.
//
// UN SEUL drapeau runtime, `startled` (comme `consumed`, jamais un champ du
// JSON de scène), et trois moments :
//   - FUITE À L'APPROCHE : à la FIN de chaque tick (core/reduce.js), une
//     entité farouche présente de la face du joueur, à `range` ou moins de
//     lui, est marquée (startleNearby). La distance seule compte, quel que
//     soit celui qui a bougé : un oiseau qui erre vers un joueur immobile
//     s'envole aussi. L'autre face n'est jamais concernée (isolée).
//   - FUITE À L'INTERACTION : l'effet d'action d'ÉTAT "startle"
//     (core/variables.js/applyActionEffects), sans champ, marque l'entité
//     qui porte l'action. Il vaut pour toute entité, farouche ou non.
//   - RETOUR AU CHARGEMENT du monde (returnStartledEntities, appelé par
//     view/world-travel.js à CHAQUE chargement, comme le regarnissage de
//     collecte) : l'entité reprend sa place, comme un oiseau dérangé qui
//     revient quand on n'est plus là. Revenir dans la scène, ou continuer
//     une partie sauvegardée pendant la visite, la ramène. Un COMPAGNON
//     effarouché (l'effet "startle" d'un de ses triggers) revient de même
//     au chargement suivant : il suit le joueur, aucun monde ne le
//     ramènerait sinon.
//
// DORMANCE : une entité marquée est dormante (core/presence.js/
// resolveEntityRules), avec ses trois plans coupés (comportement, son,
// interaction). Le marquage se fait en FIN de tick, la dormance prend donc
// effet au tick SUIVANT : la présence de ce tick-ci est déjà connue, et la
// bascule "exited" est toujours OBSERVÉE (voir presenceChanged) — même au
// tout premier tick d'une visite, quand le joueur arrive à côté d'un
// oiseau. La vue joue alors le son de sortie de l'entité (rôle exitSound,
// l'envol), sans aucune plomberie dédiée. Aucun tirage PRNG : le
// déterminisme ne dépend que des positions.

import { TUNING_DEFAULTS } from "../config/tuning-values.js";
import { isTwoSided, withFace, withActiveWorld } from "./state.js";

// Portée de fuite d'une entité farouche : la sienne, sinon le défaut de
// ressenti. Résolue à la lecture, jamais figée au chargement : retoucher le
// défaut vaut aussi pour les mondes déjà sauvegardés.
export function startleRangeOf(entity) {
  return entity.startle.range ?? TUNING_DEFAULTS.startleRange;
}

// Fin de tick (core/reduce.js) : marque les entités farouches de la face du
// joueur qui sont à portée de fuite. `present` est la présence de CE tick
// (posée par stepEntities sur toute entité farouche) : une entité déjà
// dormante (règle de présence, ou déjà envolée) n'est jamais marquée.
// Références conservées pour les entités inchangées.
export function startleNearby(entities, playerX) {
  return entities.map((entity) => {
    if (!entity.startle || entity.startled || entity.present === false) return entity;
    if (Math.abs(entity.x - playerX) > startleRangeOf(entity)) return entity;
    return { ...entity, startled: true };
  });
}

// Une entité ramenée à sa place : sans marque, et sans présence mémorisée —
// pour le tick suivant, elle n'a encore jamais tiqué (aucune bascule
// "entered" fantôme au retour, aucun "exited" resté collé d'un départ en
// plein envol, voir core/presence.js/resolveEntityRules).
function settle(entity) {
  const { startled, present, presenceChanged, ...rest } = entity;
  return rest;
}

// Chargement du monde ACTIF (voir l'en-tête) : ses DEUX faces s'il en a
// deux, et les compagnons. Aucune entité envolée -> MÊME référence de
// session.
export function returnStartledEntities(session) {
  const world = session.worlds[session.activeWorldId];
  const sides = isTwoSided(world) ? ["recto", "verso"] : [null];
  let nextWorld = world;
  for (const side of sides) {
    const face = side === null ? world : world[side];
    if (!face.entities.some((entity) => entity.startled)) continue;
    const entities = face.entities.map((entity) => (entity.startled ? settle(entity) : entity));
    nextWorld = withFace(nextWorld, side, { entities });
  }
  const next = nextWorld === world ? session : withActiveWorld(session, nextWorld);
  if (!session.companions.some((companion) => companion.startled)) return next;
  return { ...next, companions: next.companions.map((companion) => (companion.startled ? settle(companion) : companion)) };
}
