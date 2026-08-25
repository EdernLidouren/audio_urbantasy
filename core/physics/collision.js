// Physique : collision préventive contre les corps impassables. Reçoit une
// intention de déplacement déjà formée (dir) et la contraint — ne décide
// jamais elle-même de bouger (voir movement.js pour la frontière
// physique/comportement).

import { MOVE_STEP, BODY_RADIUS } from "../state.js";
import { moveWithinBounds } from "./movement.js";

// Résout le déplacement VOULU du joueur pour ce tick : pas fixe + bornes du
// niveau (moveWithinBounds), PUIS le corps de la première entité
// blocksMovement rencontrée dans le sens du déplacement (si son bord serait
// franchi). blockedBy est l'id de cette entité, ou null si rien n'arrête le
// mouvement. dir === 0 : jamais bloqué (rien n'est tenté). Pure, ne mute rien.
export function resolvePlayerMove(playerX, dir, entities, levelLength) {
  const intendedX = moveWithinBounds(playerX, dir * MOVE_STEP, levelLength);
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
