// Comportement "goto" : direction vers une cible FIXE (par id, ex. une
// porte), jusqu'à l'ATTEINDRE, puis s'arrête et SIGNALE son arrivée —
// déterministe, AUCUN PRNG (comme follow.js, contrairement à wander.js).
//
// Variante de follow.js (voir son header) SANS zone morte élastique (une
// seule distance d'arrivée, pas un couple minDistance/maxDistance) et AVEC
// un état d'arrivée exposé (`entity.gotoArrived`) — c'est ce qui permettra
// à un appelant futur d'enchaîner un effet ("donc devient dormant", voir le
// prompt d'origine, brique 2/2 — PAS câblé ici, cette brique s'arrête à
// "signale l'arrivée").
//
// Même frontière comportement/physique que follow.js : ce module produit
// SEULEMENT une intention (-1/0/+1), jamais une position résolue —
// core/reduce.js/resolveBodyMove (core/physics/collision.js) arrête
// l'entité au contact d'un corps bloquant, jamais de traversée. Un
// obstacle sur le chemin peut donc empêcher l'arrivée indéfiniment ; ce
// module ne le détecte PAS lui-même (pas d'échéance de secours ici, voir
// brique 2/2).
//
// Cible résolue via context.getTargetPosition(targetId) — EXACTEMENT le
// même mécanisme que follow.js (core/reduce.js/resolveTargetPosition,
// déjà générique par id : joueur, entité du monde actif, ou compagnon).
// Aucune duplication nécessaire, ce module s'en sert tel quel.

import { BODY_RADIUS } from "../state.js";

export const DEFAULTS = {
  // Distance en-deçà de laquelle la cible est considérée ATTEINTE — même
  // convention "corps plein" que le dégagement entre deux entités
  // (2×BODY_RADIUS, voir core/physics/overlap.js/collision.js) : arrivé
  // veut dire "juste à côté", au contact.
  arriveDistance: 2 * BODY_RADIUS,
};

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// targetId est REQUIS (contrairement à follow.js, qui retombe sur "player"
// par défaut) : "aller vers" sans cible n'a pas de sens pour ce
// comportement, une entité oubliant de le préciser doit échouer clairement
// au chargement plutôt que de silencieusement immobiliser l'entité.
export function parseParams(raw, fail) {
  const { targetId, arriveDistance, speed } = raw;

  if (typeof targetId !== "string" || targetId.trim().length === 0) {
    fail(`behavior.targetId est requis (chaîne non vide) pour "goto".`);
  }
  if (arriveDistance !== undefined && (!isFiniteNumber(arriveDistance) || arriveDistance <= 0)) {
    fail(`behavior.arriveDistance doit être un nombre > 0 si présent.`);
  }
  if (speed !== undefined && (!isFiniteNumber(speed) || speed <= 0)) {
    fail(`behavior.speed doit être un nombre > 0 si présent.`);
  }

  const params = { targetId };
  if (arriveDistance !== undefined) params.arriveDistance = arriveDistance;
  // speed : jamais lu par step() — consommé à la RÉSOLUTION par
  // core/reduce.js/resolveIntents (prime sur entity.speed), comme
  // follow.js/speed. Ancien commentaire : reduce.js résout tout mobile
  // à intention à la cadence MOVE_STEP uniforme, réservé pour une future
  // variation de cadence.
  if (speed !== undefined) params.speed = speed;
  return params;
}

// Cible introuvable (id invalide, entité disparue...) -> s'arrête, jamais
// de crash — même dégradation que follow.js. gotoArrived n'est PAS posé
// dans ce cas : une impossibilité de progresser n'est pas une arrivée : la
// dégradation en présence pour ce cas précis reste à la charge de
// l'appelant (brique 2/2), pas de ce module.
//
// Arrivée (distance <= arriveDistance) : intent retombe à 0 (s'arrête) ET
// `gotoArrived: true` est posé sur l'entité — persistant, jamais remis à
// false ici (rien dans ce module ne redonnerait de raison de repartir).
// Une entité SANS ce comportement ne porte jamais ce champ (comme
// `entity.dir` pour wander, propre au comportement qui le pose).
export function step(entity, context) {
  const { targetId, arriveDistance } = { ...DEFAULTS, ...entity.behavior };
  const targetX = context.getTargetPosition(targetId);

  if (targetX === undefined) {
    return { entity, rngState: context.rngState, intent: 0 };
  }

  const distance = Math.abs(targetX - entity.x);
  if (distance <= arriveDistance) {
    return { entity: { ...entity, gotoArrived: true }, rngState: context.rngState, intent: 0 };
  }

  const intent = Math.sign(targetX - entity.x);
  return { entity, rngState: context.rngState, intent };
}

export default { DEFAULTS, parseParams, step };
