// Physique : collision préventive contre les corps impassables. Reçoit une
// intention de déplacement déjà formée (dir) et la contraint — ne décide
// jamais elle-même de bouger (voir movement.js pour la frontière
// physique/comportement).
//
// DEUX conventions de dégagement coexistent, miroir de celles de
// physics/overlap.js (résolution curative de chevauchement) :
//   - le JOUEUR est un POINT partout (voir overlap.js §1 : dégagement d'un
//     seul BODY_RADIUS face à un corps bloquant, celui du bloqueur) ->
//     resolvePlayerMove.
//   - toute autre entité mue par INTENTION (ex. un compagnon en follow,
//     core/behaviors/follow.js) reste un CORPS PLEIN, soumis à la même
//     règle que deux entités qui se chevauchent (voir overlap.js §2 :
//     dégagement de 2×BODY_RADIUS, un rayon par corps) -> resolveBodyMove.
// Sans cette distinction (un bug réel, corrigé ici), un mobile à corps
// s'arrêtait à l'ancien dégagement "point" (un seul BODY_RADIUS) ;
// resolveOverlaps le retrouvait alors encore trop proche d'un bloqueur et
// écartait LES DEUX corps d'un cran — y compris le bloqueur, pourtant
// censé être statique — CHAQUE tick tant que l'intention persistait : un
// suiveur pouvait ainsi pousser un mur à travers le niveau au lieu d'être
// arrêté par lui. Les deux fonctions exportées partagent resolveBlockedMove
// ci-dessous ; seul le dégagement (clearance) diffère.

import { MOVE_STEP, BODY_RADIUS } from "../state.js";
import { moveWithinBounds } from "./movement.js";
import { isBlocking } from "../presence.js";

// Cœur commun : pas fixe + bornes du niveau (moveWithinBounds), PUIS le
// corps de la première entité BLOQUANTE rencontrée dans le sens du
// déplacement (isBlocking : blocksMovement ET présente, voir
// core/presence.js — une entité DORMANTE ne bloque jamais, "comme si
// absente"), à `clearance` du centre de son corps (si son bord serait
// franchi). blockedBy est l'id de cette entité, ou null si rien n'arrête le
// mouvement. dir === 0 : jamais bloqué (rien n'est tenté). Pure, ne mute
// rien. Interne, non exportée — voir resolvePlayerMove/resolveBodyMove
// ci-dessous pour les deux dégagements concrets.
function resolveBlockedMove(moverX, dir, entities, levelLength, clearance, presenceContext) {
  const intendedX = moveWithinBounds(moverX, dir * MOVE_STEP, levelLength);
  if (dir === 0) return { x: intendedX, blockedBy: null };

  let stoppedX = intendedX;
  let blockedBy = null;
  for (const entity of entities) {
    if (!isBlocking(entity, presenceContext)) continue;
    const edge = entity.x - dir * clearance; // bord du corps côté approche
    const crosses = dir === 1 ? moverX <= edge && intendedX > edge : moverX >= edge && intendedX < edge;
    if (!crosses) continue;
    // Le corps le plus proche du mobile dans le sens du déplacement gagne.
    if (blockedBy === null || (dir === 1 ? edge < stoppedX : edge > stoppedX)) {
      stoppedX = edge;
      blockedBy = entity.id;
    }
  }
  return { x: stoppedX, blockedBy };
}

// Résout le déplacement VOULU du joueur pour ce tick : le joueur est un
// POINT (dégagement d'un seul BODY_RADIUS face à un corps bloquant), voir
// header et overlap.js §1 pour la convention miroir. presenceContext : voir
// core/presence.js/isBlocking — requis dès qu'une entité de `entities` peut
// porter une règle de présence (toujours fourni par core/reduce.js).
export function resolvePlayerMove(playerX, dir, entities, levelLength, presenceContext) {
  return resolveBlockedMove(playerX, dir, entities, levelLength, BODY_RADIUS, presenceContext);
}

// Résout le déplacement VOULU d'une entité à CORPS mue par intention (ex.
// un compagnon en follow, core/behaviors/follow.js — jamais le joueur) :
// dégagement de 2×BODY_RADIUS, cohérent avec overlap.js §2 (deux corps
// pleins qui ne doivent pas se chevaucher). Le mobile s'arrête pile où
// resolveOverlaps le laisserait de toute façon au tick suivant : aucune
// poussée résiduelle du bloqueur, voir header.
export function resolveBodyMove(entityX, dir, entities, levelLength, presenceContext) {
  return resolveBlockedMove(entityX, dir, entities, levelLength, 2 * BODY_RADIUS, presenceContext);
}
