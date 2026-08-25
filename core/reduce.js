// Le réducteur : seule source de vérité pour l'évolution de l'état. Pure,
// ne mute jamais state, renvoie toujours un nouvel objet (sauf action
// inconnue, qui renvoie la référence inchangée).

import { MOVE_STEP } from "./state.js";
import BEHAVIORS from "./behaviors/index.js";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function reduce(state, action) {
  switch (action.type) {
    case "TICK": {
      const nextX = clamp(state.player.x + action.dir * MOVE_STEP, 0, state.level.length);

      // Chaque entité dotée d'un comportement tire son(ses) coup(s) dans la
      // MÊME suite de PRNG, à la queue leu leu (rngState avance à chaque
      // tirage fait par un module de comportement) : ordre stable (celui de
      // level.entities) -> déterminisme préservé même avec plusieurs
      // entités mobiles. Le kind est résolu via le registre (voir
      // core/behaviors/index.js) — reduce ne connaît aucun kind par son nom.
      let rngState = state.rngState;
      const nextEntities = state.level.entities.map((entity) => {
        const module = entity.behavior && BEHAVIORS[entity.behavior.kind];
        if (!module) return entity;
        const stepped = module.step(entity, state.level.length, rngState);
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
