// Comportement "wander" : errance en DEUX ÉTATS — MARCHE (avance dans une
// direction) / PAUSE (immobile) — au lieu d'un mouvement continu haché par
// un flip de direction à chaque tick. Déterministe (PRNG seedé, voir
// core/rng.js) : les durées de chaque état ET les directions sont TIRÉES,
// jamais Math.random().
//
// Respecte la frontière comportement/physique (voir core/reduce.js) : ce
// module produit SEULEMENT une INTENTION (`intent` : -1/0/+1), JAMAIS une
// position résolue lui-même. reduce.js résout l'intention via
// resolveBodyMove (core/physics/collision.js), qui arrête tout mobile à
// intention pile au contact d'un corps bloquant (borne de la scène OU
// entité impassable) — wander n'a donc pas besoin de connaître les
// obstacles pour s'y arrêter proprement, seulement pour RÉAGIR à l'arrêt
// (rebond, voir plus bas).
//
// Conséquence : `speed` (validé ci-dessous) n'est jamais lu par step() —
// consommé à la RÉSOLUTION par core/reduce.js/resolveIntents, où il prime
// sur entity.speed, comme pour follow.js et goto.js. La machine à deux états
// ci-dessous ne choisit une direction qu'aux TRANSITIONS de phase, jamais
// par tick.
//
// État interne, sous `entity.wander` :
//   { phase: "walk" | "pause", ticksLeft, dir, prevX }
// phase/ticksLeft/dir pilotent la machine ; prevX (position au tick
// PRÉCÉDENT) sert UNIQUEMENT à détecter un blocage (voir step()) — jamais
// lu ailleurs. Absent tant qu'aucun tick n'a encore été joué pour cette
// entité (lazy init dans step(), pas de seed dédiée dans core/state.js :
// ce module gère seul tout son état, y compris son tirage initial).

import { nextRandom } from "../rng.js";
import { TICK_MS } from "../../lib/loop.js";
import { TUNING_DEFAULTS } from "../../config/tuning-values.js";
import { isFiniteNumber } from "../../lib/validate.js";

// Durées déclarées en MILLISECONDES, comme tout réglage de durée du projet,
// puis converties en TICKS (pas fixe du jeu, voir lib/loop.js/TICK_MS) au
// moment du tirage : le décompte d'une phase (ticksLeft) avance avec la
// simulation, donc se gèle avec elle (menu ouvert), et reste entier, donc
// déterministe. Défauts dans config/tuning-values.js (wander*), surchargés
// champ par champ par l'objet `behavior` qui déclare l'errance (champ
// d'entité ou effet "behavior" d'une règle) — aucune autre cascade.
// continueBias : voir config/tuning-values.js/wanderContinueBias.
export const DEFAULTS = {
  walkMinMs: TUNING_DEFAULTS.wanderWalkMinMs,
  walkMaxMs: TUNING_DEFAULTS.wanderWalkMaxMs,
  pauseMinMs: TUNING_DEFAULTS.wanderPauseMinMs,
  pauseMaxMs: TUNING_DEFAULTS.wanderPauseMaxMs,
  continueBias: TUNING_DEFAULTS.wanderContinueBias,
};

// Champs acceptés dans `behavior` en plus de `kind` (voir
// core/parse-common.js/parseBehavior, qui rejette tout autre champ).
export const PARAMS = ["walkMinMs", "walkMaxMs", "pauseMinMs", "pauseMaxMs", "continueBias", "speed"];

// Au moins un tick : une durée positive mais plus courte qu'un tick
// donnerait sinon une phase vide.
function msToTicks(ms) {
  return Math.max(1, Math.round(ms / TICK_MS));
}

function checkDurationRange(raw, minKey, maxKey, fail) {
  const min = raw[minKey];
  const max = raw[maxKey];
  if (min !== undefined && (!isFiniteNumber(min) || min <= 0)) {
    fail(`behavior.${minKey} doit être un nombre > 0 (ms) si présent.`);
  }
  if (max !== undefined && (!isFiniteNumber(max) || max <= 0)) {
    fail(`behavior.${maxKey} doit être un nombre > 0 (ms) si présent.`);
  }
  const resolvedMin = min !== undefined ? min : DEFAULTS[minKey];
  const resolvedMax = max !== undefined ? max : DEFAULTS[maxKey];
  if (resolvedMin > resolvedMax) {
    fail(`behavior.${minKey} (${resolvedMin}) doit être <= behavior.${maxKey} (${resolvedMax}).`);
  }
}

// Valide et ne renvoie QUE les champs présents dans raw — même contrat que
// les autres comportements : les défauts se résolvent dans step(), jamais
// bakés ici.
export function parseParams(raw, fail) {
  const { walkMinMs, walkMaxMs, pauseMinMs, pauseMaxMs, speed, continueBias } = raw;

  checkDurationRange(raw, "walkMinMs", "walkMaxMs", fail);
  checkDurationRange(raw, "pauseMinMs", "pauseMaxMs", fail);
  if (continueBias !== undefined && (!isFiniteNumber(continueBias) || continueBias < 0 || continueBias > 1)) {
    fail(`behavior.continueBias doit être un nombre entre 0 et 1 si présent.`);
  }
  if (speed !== undefined && (!isFiniteNumber(speed) || speed <= 0)) {
    fail(`behavior.speed doit être un nombre > 0 si présent.`);
  }

  const params = {};
  if (walkMinMs !== undefined) params.walkMinMs = walkMinMs;
  if (walkMaxMs !== undefined) params.walkMaxMs = walkMaxMs;
  if (pauseMinMs !== undefined) params.pauseMinMs = pauseMinMs;
  if (pauseMaxMs !== undefined) params.pauseMaxMs = pauseMaxMs;
  // speed : voir header — consommé par core/reduce.js, jamais par step().
  if (speed !== undefined) params.speed = speed;
  if (continueBias !== undefined) params.continueBias = continueBias;
  return params;
}

// Durée d'une phase en ticks, entier uniforme entre les deux bornes
// converties (incluses). L'arrondi préserve min <= max validé en ms.
function drawTicks(rngState, minMs, maxMs) {
  const min = msToTicks(minMs);
  const max = msToTicks(maxMs);
  const { value, state } = nextRandom(rngState);
  return { value: min + Math.floor(value * (max - min + 1)), rngState: state };
}

function drawDirection(rngState) {
  const { value, state } = nextRandom(rngState);
  return { value: value < 0.5 ? -1 : 1, rngState: state };
}

// Voir config/tuning-values.js/wanderContinueBias.
function drawWalkDirection(previousDir, continueBias, rngState) {
  const { value, state } = nextRandom(rngState);
  return { value: value < continueBias ? previousDir : -previousDir, rngState: state };
}

// step(entity, context) : context porte length/rngState (ce module ignore
// le reste, ex. getTargetPosition, réservé à follow/goto). Ne mute rien,
// renvoie {entity, rngState, intent} — signature UNIFORME avec follow.js/
// goto.js (voir header).
export function step(entity, context) {
  const cfg = { ...DEFAULTS, ...entity.behavior };
  let rngState = context.rngState;
  let w = entity.wander;

  if (!w) {
    // Premier tick de cette entité : entre directement en MARCHE, direction
    // et durée tirées comme pour toute autre entrée en marche (voir plus
    // bas) — aucun traitement spécial au-delà de l'absence de direction
    // précédente à privilégier (drawDirection, pas drawWalkDirection).
    const dirDraw = drawDirection(rngState);
    rngState = dirDraw.rngState;
    const durationDraw = drawTicks(rngState, cfg.walkMinMs, cfg.walkMaxMs);
    rngState = durationDraw.rngState;
    w = { phase: "walk", ticksLeft: durationDraw.value, dir: dirDraw.value };
  } else if (w.phase === "walk" && entity.x === w.prevX) {
    // Bloquée pendant la marche (bord de map OU obstacle impassable — les
    // deux arrêtent déjà le mobile au même endroit via resolveBodyMove,
    // voir header) : REBOND — inverse la direction pour la durée RESTANTE
    // de cette même phase, aucun nouveau tirage. Choisi plutôt qu'une pause
    // anticipée : même réaction aux bornes de la scène et aux obstacles,
    // cohérente dans les deux cas — sans ce rebond, l'entité resterait à
    // intention constante contre l'obstacle, collée à pousser dans le vide.
    w = { ...w, dir: -w.dir };
  }

  let { phase, ticksLeft, dir } = w;
  ticksLeft -= 1;
  if (ticksLeft <= 0) {
    phase = phase === "walk" ? "pause" : "walk";
    if (phase === "walk") {
      const dirDraw = drawWalkDirection(dir, cfg.continueBias, rngState);
      rngState = dirDraw.rngState;
      dir = dirDraw.value;
    }
    const [minMs, maxMs] = phase === "walk" ? [cfg.walkMinMs, cfg.walkMaxMs] : [cfg.pauseMinMs, cfg.pauseMaxMs];
    const durationDraw = drawTicks(rngState, minMs, maxMs);
    rngState = durationDraw.rngState;
    ticksLeft = durationDraw.value;
  }

  const intent = phase === "walk" ? dir : 0;
  return {
    entity: { ...entity, wander: { phase, ticksLeft, dir, prevX: entity.x } },
    rngState,
    intent,
  };
}

export default { DEFAULTS, PARAMS, parseParams, step };
