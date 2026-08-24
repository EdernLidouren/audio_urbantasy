// Le réducteur : seule source de vérité pour l'évolution de l'état. Pure,
// ne mute jamais state, renvoie toujours un nouvel objet (sauf action
// inconnue, qui renvoie la référence inchangée).

import { MOVE_STEP } from "./state.js";
import { nextRandom } from "./rng.js";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Défauts d'errance : pas encore dans config/tuning-values.js (hors
// périmètre de cette tâche, qui ne touche que core/) — constantes locales,
// comme les autres invariants qui restent dans leur fichier consommateur.
const DEFAULT_WANDER_SPEED = MOVE_STEP / 2;
const DEFAULT_WANDER_TURN_CHANCE = 0.02;

// Avance une entité "wander" d'un tick. Petite probabilité (turnChance,
// tirée du PRNG) d'inverser la direction, puis déplacement de dir * speed ;
// demi-tour (position bornée + direction inversée) si ça dépasse [0,
// length]. Pure : ne mute rien, renvoie {entity, rngState}.
function stepWanderEntity(entity, length, rngState) {
  const speed = entity.behavior.speed ?? DEFAULT_WANDER_SPEED;
  const turnChance = entity.behavior.turnChance ?? DEFAULT_WANDER_TURN_CHANCE;

  const { value: turnRoll, state: nextRngState } = nextRandom(rngState);
  const dir = turnRoll < turnChance ? -entity.dir : entity.dir;

  const rawX = entity.x + dir * speed;
  const hitLower = rawX <= 0;
  const hitUpper = rawX >= length;
  const nextX = clamp(rawX, 0, length);
  const nextDir = hitLower ? 1 : hitUpper ? -1 : dir;

  return { entity: { ...entity, x: nextX, dir: nextDir }, rngState: nextRngState };
}

export function reduce(state, action) {
  switch (action.type) {
    case "TICK": {
      const nextX = clamp(state.player.x + action.dir * MOVE_STEP, 0, state.level.length);

      // Chaque entité "wander" tire son propre coup dans la MÊME suite de
      // PRNG, à la queue leu leu (rngState avance à chaque tirage) : ordre
      // stable (celui de level.entities) -> déterminisme préservé même avec
      // plusieurs entités mobiles.
      let rngState = state.rngState;
      const nextEntities = state.level.entities.map((entity) => {
        if (entity.behavior?.kind !== "wander") return entity;
        const stepped = stepWanderEntity(entity, state.level.length, rngState);
        rngState = stepped.rngState;
        return stepped.entity;
      });

      return {
        ...state,
        player: { ...state.player, x: nextX },
        level: { ...state.level, entities: nextEntities },
        rngState,
      };
    }
    default:
      return state;
  }
}
