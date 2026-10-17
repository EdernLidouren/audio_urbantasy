// Comportement "wander" : errance en DEUX ÉTATS — MARCHE (avance dans une
// direction) / PAUSE (immobile) — au lieu d'un mouvement continu haché par
// un flip de direction à chaque tick. Déterministe (PRNG seedé, voir
// core/rng.js) : les durées de chaque état ET les directions sont TIRÉES,
// jamais Math.random().
//
// Respecte la frontière comportement/physique (voir core/reduce.js,
// CLAUDE.md) : ce module produit SEULEMENT une INTENTION (`intent` :
// -1/0/+1), JAMAIS une position résolue lui-même — CHANGEMENT par rapport à
// l'ancienne version (qui se bornait toute seule via moveAndBounce,
// core/physics/movement.js). Nécessaire pour l'item "blocage" (voir plus
// bas) : reduce.js résout l'intention via resolveBodyMove
// (core/physics/collision.js), qui arrête déjà tout mobile à intention pile
// au contact d'un corps bloquant (borne de la scène OU entité impassable) —
// PHYSIQUE INCHANGÉE, wander n'a donc plus besoin de connaître les
// obstacles pour s'y arrêter proprement, seulement pour RÉAGIR à l'arrêt
// (rebond, voir plus bas).
//
// Conséquence : `speed` (validé ci-dessous) n'est jamais lu par step() —
// consommé à la RÉSOLUTION par core/reduce.js/resolveIntents, où il prime
// sur entity.speed, comme pour follow.js/goto.js. `turnChance` (ancien réglage,
// flip à chaque tick) disparaît : REMPLACÉ par la machine à deux états
// ci-dessous, qui ne choisit plus une direction qu'aux TRANSITIONS de
// phase, jamais par tick.
//
// État interne, sous `entity.wander` (jamais `entity.dir` — l'ancien champ,
// propre à l'ex-implémentation, n'est plus lu ici) :
//   { phase: "walk" | "pause", ticksLeft, dir, prevX }
// phase/ticksLeft/dir pilotent la machine ; prevX (position au tick
// PRÉCÉDENT) sert UNIQUEMENT à détecter un blocage (voir step()) — jamais
// lu ailleurs. Absent tant qu'aucun tick n'a encore été joué pour cette
// entité (lazy init dans step(), pas de seed dédiée dans core/state.js
// contrairement à l'ancien `dir:1` : ce module gère désormais seul tout son
// état, y compris son tirage initial).

import { nextRandom } from "../rng.js";

// Durées en TICKS (pas fixe du jeu, ~16.7ms — voir lib/loop.js/TICK_MS) :
// seule unité disponible ici sans dépendre de l'horloge de partie
// (core/time.js), hors de portée de ce module. Défauts posés pour un
// rythme CALME : marches courtes (0.75 à 1.5s), pauses nettement plus
// longues et notables (2 à 5s) — à ajuster à l'oreille via une surcharge de
// behavior si besoin (cascade instance -> archétype -> ces défauts, comme
// tout autre comportement).
//
// continueBias (0..1) : probabilité, à l'entrée d'une NOUVELLE marche, de
// repartir dans la direction de la marche précédente plutôt que de faire
// demi-tour. 0.65 par défaut : évite le ping-pong systématique sans figer
// l'entité dans un aller simple. 0 = demi-tour à chaque pause (garde qui
// fait les cent pas), vers 1 = ne revient presque jamais sur ses pas
// (explorateur ; seuls les bords la retournent).
export const DEFAULTS = {
  walkMin: 45,
  walkMax: 90,
  pauseMin: 120,
  pauseMax: 300,
  continueBias: 0.65,
};

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function checkTickRange(raw, minKey, maxKey, fail) {
  const min = raw[minKey];
  const max = raw[maxKey];
  if (min !== undefined && (!Number.isInteger(min) || min < 1)) {
    fail(`behavior.${minKey} doit être un entier >= 1 (ticks) si présent.`);
  }
  if (max !== undefined && (!Number.isInteger(max) || max < 1)) {
    fail(`behavior.${maxKey} doit être un entier >= 1 (ticks) si présent.`);
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
  const { walkMin, walkMax, pauseMin, pauseMax, speed, continueBias } = raw;

  checkTickRange(raw, "walkMin", "walkMax", fail);
  checkTickRange(raw, "pauseMin", "pauseMax", fail);
  if (continueBias !== undefined && (!isFiniteNumber(continueBias) || continueBias < 0 || continueBias > 1)) {
    fail(`behavior.continueBias doit être un nombre entre 0 et 1 si présent.`);
  }
  if (speed !== undefined && (!isFiniteNumber(speed) || speed <= 0)) {
    fail(`behavior.speed doit être un nombre > 0 si présent.`);
  }

  const params = {};
  if (walkMin !== undefined) params.walkMin = walkMin;
  if (walkMax !== undefined) params.walkMax = walkMax;
  if (pauseMin !== undefined) params.pauseMin = pauseMin;
  if (pauseMax !== undefined) params.pauseMax = pauseMax;
  // speed : voir header — consommé par core/reduce.js, jamais par step().
  if (speed !== undefined) params.speed = speed;
  if (continueBias !== undefined) params.continueBias = continueBias;
  return params;
}

// Entier uniforme dans [min, max] (bornes incluses).
function drawTicks(rngState, min, max) {
  const { value, state } = nextRandom(rngState);
  return { value: min + Math.floor(value * (max - min + 1)), rngState: state };
}

function drawDirection(rngState) {
  const { value, state } = nextRandom(rngState);
  return { value: value < 0.5 ? -1 : 1, rngState: state };
}

// Voir continueBias (DEFAULTS) ci-dessus.
function drawWalkDirection(previousDir, continueBias, rngState) {
  const { value, state } = nextRandom(rngState);
  return { value: value < continueBias ? previousDir : -previousDir, rngState: state };
}

// step(entity, context) : context porte length/rngState (ce module ignore
// le reste, ex. getTargetPosition, réservé à follow/goto). Ne mute rien,
// renvoie {entity, rngState, intent} — signature UNIFORME avec follow.js/
// goto.js désormais (voir header).
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
    const durationDraw = drawTicks(rngState, cfg.walkMin, cfg.walkMax);
    rngState = durationDraw.rngState;
    w = { phase: "walk", ticksLeft: durationDraw.value, dir: dirDraw.value };
  } else if (w.phase === "walk" && entity.x === w.prevX) {
    // Bloquée pendant la marche (bord de map OU obstacle impassable — les
    // deux arrêtent déjà le mobile au même endroit via resolveBodyMove,
    // voir header) : REBOND — inverse la direction pour la durée RESTANTE
    // de cette même phase, aucun nouveau tirage. Choisi plutôt qu'une pause
    // anticipée : c'est exactement le comportement qu'avait déjà l'ancienne
    // version aux bornes de la scène (moveAndBounce), maintenant étendu aux
    // obstacles pour une réaction cohérente dans les deux cas — sans ce
    // rebond, l'entité resterait à intention constante contre l'obstacle,
    // collée à pousser dans le vide.
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
    const [min, max] = phase === "walk" ? [cfg.walkMin, cfg.walkMax] : [cfg.pauseMin, cfg.pauseMax];
    const durationDraw = drawTicks(rngState, min, max);
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

export default { DEFAULTS, parseParams, step };
