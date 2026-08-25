// Comportement "wander" : errance basique et déterministe (voir CLAUDE.md,
// PRNG seedé). Module autonome — core/reduce.js et core/level.js ne
// connaissent aucun détail de wander, seulement ce que ce fichier expose
// (voir core/behaviors/index.js pour le registre qui les relie).
//
// Contrat des défauts (documenté ici, à l'endroit unique où il s'applique) :
// parseParams ne stocke QUE les champs fournis dans le JSON du niveau ; le
// repli sur DEFAULTS a lieu UNIQUEMENT dans step(), au moment de lire chaque
// paramètre (params.x ?? DEFAULTS.x). Jamais appliqué ailleurs.

import { MOVE_STEP } from "../state.js";
import { nextRandom } from "../rng.js";

export const DEFAULTS = {
  speed: MOVE_STEP / 2,
  turnChance: 0.02,
};

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Valide et ne renvoie QUE les champs présents dans raw (speed, turnChance) —
// pas de défauts bakés ici, voir le contrat ci-dessus. fail() est fourni par
// l'appelant (core/level.js) pour garder un message d'erreur uniforme avec
// le reste du parsing de niveau ; il lance toujours, jamais de retour normal.
export function parseParams(raw, fail) {
  const { speed, turnChance } = raw;
  if (speed !== undefined && (!isFiniteNumber(speed) || speed <= 0)) {
    fail(`behavior.speed doit être un nombre > 0 si présent.`);
  }
  if (turnChance !== undefined && (!isFiniteNumber(turnChance) || turnChance < 0 || turnChance > 1)) {
    fail(`behavior.turnChance doit être dans [0, 1] si présent.`);
  }

  const params = {};
  if (speed !== undefined) params.speed = speed;
  if (turnChance !== undefined) params.turnChance = turnChance;
  return params;
}

// Avance l'entité d'un tick. Petite probabilité (turnChance, tirée du PRNG)
// d'inverser la direction, puis déplacement de dir * speed ; demi-tour
// (position bornée + direction inversée) si ça dépasse [0, length]. Pure :
// ne mute rien, renvoie {entity, rngState}.
export function step(entity, length, rngState) {
  const speed = entity.behavior.speed ?? DEFAULTS.speed;
  const turnChance = entity.behavior.turnChance ?? DEFAULTS.turnChance;

  const { value: turnRoll, state: nextRngState } = nextRandom(rngState);
  const dir = turnRoll < turnChance ? -entity.dir : entity.dir;

  const rawX = entity.x + dir * speed;
  const hitLower = rawX <= 0;
  const hitUpper = rawX >= length;
  const nextX = clamp(rawX, 0, length);
  const nextDir = hitLower ? 1 : hitUpper ? -1 : dir;

  return { entity: { ...entity, x: nextX, dir: nextDir }, rngState: nextRngState };
}

export default { DEFAULTS, parseParams, step };
