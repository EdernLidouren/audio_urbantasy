// Le réducteur : seule source de vérité pour l'évolution de l'état. Pure,
// ne mute jamais state, renvoie toujours un nouvel objet (sauf action
// inconnue, qui renvoie la référence inchangée).

import { MOVE_STEP } from "./state.js";
import BEHAVIORS from "./behaviors/index.js";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Rayon de corps uniforme pour toute entité blocksMovement — pas encore par
// entité/type (hors périmètre de cette tâche, qui ne touche que core/) ;
// orthogonal à blocksMovement, qui décide SEUL si ce corps arrête le joueur.
export const BODY_RADIUS = 0.25;

// Résout le déplacement VOULU du joueur pour ce tick : bornes du niveau,
// PUIS le corps de la première entité blocksMovement rencontrée dans le
// sens du déplacement (si son bord serait franchi). blockedBy est l'id de
// cette entité, ou null si rien n'arrête le mouvement. dir === 0 : jamais
// bloqué (rien n'est tenté). Pure, ne mute rien.
function resolvePlayerMove(playerX, dir, entities, levelLength) {
  const intendedX = clamp(playerX + dir * MOVE_STEP, 0, levelLength);
  if (dir === 0) return { x: intendedX, blockedBy: null };

  let stoppedX = intendedX;
  let blockedBy = null;
  for (const entity of entities) {
    if (!entity.blocksMovement) continue;
    const edge = entity.x - dir * BODY_RADIUS; // bord du corps côté approche
    const crosses = dir === 1 ? playerX <= edge && intendedX > edge : playerX >= edge && intendedX < edge;
    if (!crosses) continue;
    // Le corps le plus proche du joueur dans le sens du déplacement gagne.
    if (blockedBy === null || (dir === 1 ? edge < stoppedX : edge > stoppedX)) {
      stoppedX = edge;
      blockedBy = entity.id;
    }
  }
  return { x: stoppedX, blockedBy };
}

export function reduce(state, action) {
  switch (action.type) {
    case "TICK": {
      const { x: nextX, blockedBy } = resolvePlayerMove(
        state.player.x,
        action.dir,
        state.level.entities,
        state.level.length
      );

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
        player: { ...state.player, x: nextX, blockedBy },
        level: { ...state.level, entities: nextEntities },
        rngState,
      };
    }
    default:
      return state;
  }
}
