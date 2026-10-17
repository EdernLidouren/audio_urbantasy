// Comportement "follow" : suivi ÉLASTIQUE d'une cible (par défaut, le
// joueur) — déterministe, AUCUN PRNG (contrairement à wander) : suivre ne
// dépend que de la distance à la cible, rien à tirer au hasard.
//
// Respecte la frontière comportement/physique (voir core/reduce.js,
// CLAUDE.md) : ce module produit SEULEMENT une INTENTION de direction
// (`intent` : -1/0/+1), JAMAIS une position résolue lui-même — contrairement
// à wander (voir wander.js), qui se déplace ET se borne tout seul. Ni
// collision ni borne ici : reduce.js résout l'intention via resolveBodyMove
// (core/physics/collision.js) — un mobile à intention est un corps PLEIN,
// dégagement double par rapport au joueur (voir le header de collision.js),
// mais le principe reste le même : arrêt au contact d'un corps bloquant,
// jamais de traversée ni de contournement.
//
// Zones, de la cible vers l'extérieur :
//   dist < minDistance                 -> s'arrête (intent: 0). NE RECULE
//                                          JAMAIS, même trop proche.
//   minDistance <= dist <= maxDistance -> zone morte : ne bouge pas (intent: 0).
//   dist > maxDistance                 -> se rapproche (intent: signe vers
//                                          la cible).
// Direction recalculée à CHAQUE tick depuis les positions COURANTES (jamais
// mémorisée) : si la cible dépasse le suiveur par l'autre côté, le sens
// s'inverse naturellement au tick suivant, sans code spécial.

export const DEFAULTS = {
  minDistance: 1,
  maxDistance: 3,
  // "player" : convention reconnue par reduce.js (voir
  // resolveTargetPosition) pour désigner le joueur — ce module ne code
  // jamais "le joueur" en dur, il demande juste une position par id via
  // context.getTargetPosition.
  targetId: "player",
};

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// Valide et ne renvoie QUE les champs présents dans raw — même contrat que
// wander.js/parseParams : les défauts se résolvent ailleurs (ici, dans
// step()), jamais bakés à l'analyse. minDistance >= maxDistance est
// incohérent (zone morte nulle ou inversée) -> rejeté.
export function parseParams(raw, fail) {
  const { minDistance, maxDistance, targetId, speed } = raw;

  if (minDistance !== undefined && (!isFiniteNumber(minDistance) || minDistance < 0)) {
    fail(`behavior.minDistance doit être un nombre >= 0 si présent.`);
  }
  if (maxDistance !== undefined && (!isFiniteNumber(maxDistance) || maxDistance <= 0)) {
    fail(`behavior.maxDistance doit être un nombre > 0 si présent.`);
  }
  const resolvedMin = minDistance !== undefined ? minDistance : DEFAULTS.minDistance;
  const resolvedMax = maxDistance !== undefined ? maxDistance : DEFAULTS.maxDistance;
  if (resolvedMin >= resolvedMax) {
    fail(
      `behavior.minDistance (${resolvedMin}) doit être strictement inférieur à behavior.maxDistance (${resolvedMax}).`
    );
  }
  if (targetId !== undefined && (typeof targetId !== "string" || targetId.trim().length === 0)) {
    fail(`behavior.targetId doit être une chaîne non vide si présent.`);
  }
  if (speed !== undefined && (!isFiniteNumber(speed) || speed <= 0)) {
    fail(`behavior.speed doit être un nombre > 0 si présent.`);
  }

  const params = {};
  if (minDistance !== undefined) params.minDistance = minDistance;
  if (maxDistance !== undefined) params.maxDistance = maxDistance;
  if (targetId !== undefined) params.targetId = targetId;
  // speed : jamais lu par step() — consommé à la RÉSOLUTION par
  // core/reduce.js/resolveIntents, où il prime sur entity.speed.
  if (speed !== undefined) params.speed = speed;
  return params;
}

// context.getTargetPosition(id) -> number | undefined — fourni par
// reduce.js, qui sait résoudre un id vers une position (joueur, entité du
// monde actif, ou compagnon) sans que ce module connaisse cette structure.
// Cible introuvable (id invalide, pas encore chargée...) -> s'arrête,
// jamais de crash. Pure : ne mute rien. rngState TRANSMIS TEL QUEL (jamais
// consommé, voir header) pour que le pipeline (core/reduce.js) reste
// uniforme entre comportements, qu'ils utilisent le PRNG ou non.
export function step(entity, context) {
  const { minDistance, maxDistance, targetId } = { ...DEFAULTS, ...entity.behavior };
  const targetX = context.getTargetPosition(targetId);

  if (targetX === undefined) {
    return { entity, rngState: context.rngState, intent: 0 };
  }

  const distance = Math.abs(targetX - entity.x);
  // distance > maxDistance : se rapproche (Math.sign ne peut pas valoir 0
  // ici, maxDistance > 0 impose targetX !== entity.x). Sinon (dans la zone
  // morte OU trop proche) : intent reste 0, jamais de recul.
  const intent = distance > maxDistance ? Math.sign(targetX - entity.x) : 0;

  return { entity, rngState: context.rngState, intent };
}

export default { DEFAULTS, parseParams, step };
