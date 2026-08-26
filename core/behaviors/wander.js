// Comportement "wander" : errance basique et déterministe (voir CLAUDE.md,
// PRNG seedé). Module autonome — core/reduce.js et core/level.js ne
// connaissent aucun détail de wander, seulement ce que ce fichier expose
// (voir core/behaviors/index.js pour le registre qui les relie).
//
// Contrat des défauts (documenté ici, à l'endroit unique où il s'applique) :
// parseParams ne stocke QUE les champs fournis dans le JSON du niveau ; le
// repli sur DEFAULTS a lieu UNIQUEMENT dans step(), au moment de lire chaque
// paramètre (params.x ?? DEFAULTS.x). Jamais appliqué ailleurs.
//
// step(entity, context) : signature UNIFORME avec les autres comportements
// (voir core/behaviors/follow.js) — context porte length/rngState (ce
// module ignore le reste, ex. getTargetPosition, réservé à follow). Permet
// à core/reduce.js d'appeler tout module de la même façon, sans jamais
// savoir lequel il invoque (voir son en-tête).

import { MOVE_STEP } from "../state.js";
import { nextRandom } from "../rng.js";
import { moveAndBounce } from "../physics/movement.js";

export const DEFAULTS = {
  speed: MOVE_STEP / 2,
  turnChance: 0.02,
};

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
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
// d'inverser la direction : c'est l'INTENTION de wander, la seule chose
// qu'il décide. Le déplacement lui-même et la réaction aux bornes du
// niveau (borner la position, inverser la direction si le bord serait
// franchi) sont de la PHYSIQUE — wander ne teste ni ne clampe rien
// lui-même, il délègue à moveAndBounce (core/physics/movement.js), qui
// renvoie la direction déjà à jour pour le tick suivant. Pure : ne mute
// rien, renvoie {entity, rngState} — jamais de champ `intent` (voir
// follow.js) : wander résout sa position LUI-MÊME, il n'y a rien de plus à
// faire pour la physique en phase 2.
export function step(entity, context) {
  const speed = entity.behavior.speed ?? DEFAULTS.speed;
  const turnChance = entity.behavior.turnChance ?? DEFAULTS.turnChance;

  const { value: turnRoll, state: nextRngState } = nextRandom(context.rngState);
  const intendedDir = turnRoll < turnChance ? -entity.dir : entity.dir;

  const { x: nextX, dir: nextDir } = moveAndBounce(entity.x, intendedDir, speed, context.length);

  return { entity: { ...entity, x: nextX, dir: nextDir }, rngState: nextRngState };
}

export default { DEFAULTS, parseParams, step };
