// Le réducteur : seule source de vérité pour l'évolution de l'état. Pure,
// ne mute jamais state, renvoie toujours un nouvel objet (sauf action
// inconnue, qui renvoie la référence inchangée).
//
// Pipeline du TICK, en deux phases explicites (voir core/physics/ pour le
// détail de la frontière) :
//   1. INTENTIONS — qui veut bouger, et dans quel sens : action.dir pour le
//      joueur (déjà une intention, câblée depuis view/input.js -> tick(),
//      voir actions.js) ; core/behaviors/ pour chaque entité dotée d'un
//      comportement (wander décide de sa propre direction).
//   2. PHYSIQUE — applique et contraint ces intentions, sans rien savoir de
//      qui les a formées : core/physics/collision.js résout le déplacement
//      du joueur (pas fixe, bornes, collision contre les corps impassables)
//      ; core/physics/overlap.js referme, en une passe finale universelle,
//      tout chevauchement de corps résiduel.

import BEHAVIORS from "./behaviors/index.js";
import { resolvePlayerMove } from "./physics/collision.js";
import { resolveOverlaps } from "./physics/overlap.js";

export function reduce(state, action) {
  switch (action.type) {
    case "TICK": {
      // --- Phase 1 : intentions ---

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

      // --- Phase 2 : physique ---

      const { x: nextX, blockedBy } = resolvePlayerMove(
        state.player.x,
        action.dir,
        state.level.entities,
        state.level.length
      );

      // Passe curative finale : sépare tout chevauchement de corps résiduel
      // (impossible en théorie vu ce qui précède, mais le level design peut
      // en produire un au chargement, ou une entité mobile peut finir
      // exactement sur le joueur/une autre entité) — voir resolveOverlaps.
      const overlapFix = resolveOverlaps(nextX, nextEntities, state.level.length);

      return {
        ...state,
        player: { ...state.player, x: overlapFix.playerX, blockedBy, pushedBy: overlapFix.pushedBy },
        level: { ...state.level, entities: overlapFix.entities },
        rngState,
      };
    }
    default:
      return state;
  }
}
