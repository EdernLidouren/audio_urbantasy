// Le réducteur : seule source de vérité pour l'évolution de l'état. Pure,
// ne mute jamais state, renvoie toujours un nouvel objet (sauf action
// inconnue, qui renvoie la référence inchangée).

import { MOVE_STEP } from "./state.js";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function reduce(state, action) {
  switch (action.type) {
    case "TICK": {
      const nextX = clamp(state.player.x + action.dir * MOVE_STEP, 0, state.level.length);
      return { ...state, player: { ...state.player, x: nextX } };
    }
    default:
      return state;
  }
}
