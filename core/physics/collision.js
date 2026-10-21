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
// Pourquoi cette distinction : un mobile à corps arrêté au dégagement
// "point" (un seul BODY_RADIUS) serait encore trop proche d'un bloqueur
// pour resolveOverlaps, qui écarterait alors LES DEUX corps d'un cran — y
// compris le bloqueur, pourtant censé être statique — CHAQUE tick tant que
// l'intention persiste : un suiveur pousserait ainsi un mur à travers la
// scène au lieu d'être arrêté par lui. Les deux fonctions exportées partagent resolveBlockedMove
// ci-dessous ; seul le dégagement (clearance) diffère.

import { MOVE_STEP, BODY_RADIUS } from "../state.js";
import { moveWithinBounds } from "./movement.js";
import { isBlocking } from "../presence.js";

// Cœur commun : pas fixe (MOVE_STEP × speed, voir plus bas) + bornes de la
// scène (moveWithinBounds), PUIS le corps de la première entité BLOQUANTE
// rencontrée dans le sens du déplacement (isBlocking : blocksMovement ET
// présente, voir core/presence.js — une entité DORMANTE ne bloque jamais,
// "comme si absente"), à `clearance` du centre de son corps (si son bord
// serait franchi). blockedBy est l'id de cette entité, ou null si rien
// n'arrête le mouvement. dir === 0 : jamais bloqué (rien n'est tenté). Pure,
// ne mute rien. Interne, non exportée — voir resolvePlayerMove/
// resolveBodyMove ci-dessous pour les deux dégagements concrets.
//
// speed (défaut 1) : facteur MULTIPLICATIF du pas fixe — c'est ICI, dans la
// PHYSIQUE de résolution, que la vitesse d'un mobile à intention prend effet,
// JAMAIS dans le comportement qui a produit `dir` (wander/follow/goto
// continuent de ne connaître qu'une direction, voir core/behaviors/) :
// frontière comportement/physique préservée. Défaut 1 -> le pas fixe
// MOVE_STEP tel quel, pour tout appelant qui ne le fournit pas (le joueur,
// voir resolvePlayerMove).
function resolveBlockedMove(moverX, dir, entities, sceneLength, clearance, presenceContext, speed = 1) {
  const intendedX = moveWithinBounds(moverX, dir * MOVE_STEP * speed, sceneLength);
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
// porter une règle de présence (toujours fourni par core/reduce.js). `speed`
// n'est JAMAIS fourni par le joueur (voir core/reduce.js) : reste à son
// défaut 1, le joueur avance toujours au pas fixe MOVE_STEP.
export function resolvePlayerMove(playerX, dir, entities, sceneLength, presenceContext, speed = 1) {
  return resolveBlockedMove(playerX, dir, entities, sceneLength, BODY_RADIUS, presenceContext, speed);
}

// Résout le déplacement VOULU d'une entité à CORPS mue par intention (ex.
// un compagnon en follow, core/behaviors/follow.js — jamais le joueur) :
// dégagement de 2×BODY_RADIUS, cohérent avec overlap.js §2 (deux corps
// pleins qui ne doivent pas se chevaucher). Le mobile s'arrête pile où
// resolveOverlaps le laisserait de toute façon au tick suivant : aucune
// poussée résiduelle du bloqueur, voir header. `speed` : voir
// resolveBlockedMove — core/reduce.js le lit sur l'entité résolue
// (entity.speed, voir core/entity-parse.js/parseEntity), défaut 1 si absent
// (compagnon sans cascade dédiée, ex. core/state.js/createTestCompanion).
export function resolveBodyMove(entityX, dir, entities, sceneLength, presenceContext, speed = 1) {
  return resolveBlockedMove(entityX, dir, entities, sceneLength, 2 * BODY_RADIUS, presenceContext, speed);
}
