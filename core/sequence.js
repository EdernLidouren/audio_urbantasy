// SÉQUENCES d'effets (voir doc/scripting.md/"Séquences : wait") — une
// liste d'effets peut s'écouler dans le temps : un pas `{ type: "wait", ms }`
// la découpe en TRANCHES. La tranche de tête s'exécute tout de suite ; les
// suivantes attendent sur l'entité qui les porte (`entity.pendingEffects`),
// décomptées en ticks, puis s'exécutent à leur tour
// (core/pending-effects.js). Pur, sans dépendance au reste du core : lu par
// core/state.js (application), core/triggers.js et la vue (rendu de la
// tête).
//
// `wait` n'est PAS un effet : ni état, ni rendu, ni mixte (voir
// core/effects.js/SEQUENCE_EFFECT_TYPES). Il ne parvient jamais à un
// exécuteur, qui ne reçoit que des tranches.

import { TICK_MS } from "../lib/loop.js";
import { nextRandom } from "./rng.js";

function isWait(effect) {
  return effect.type === "wait";
}

// Durée d'un `wait` en ticks : au moins un, pour qu'une attente déclarée
// sépare toujours deux tranches. `variationMs` : un écart tiré dans
// [-variationMs, +variationMs] avec le PRNG SEEDÉ passé (celui de la face de
// l'entité, ou des compagnons, voir core/state.js) — deux chiens sifflés
// ensemble ne jappent pas au même tick, et la même partie rejouée donne
// les mêmes écarts. Sans variation, aucun tirage. -> { ticks, rngState }
function waitTicks(effect, rngState) {
  if (!effect.variationMs) return { ticks: Math.max(1, Math.round(effect.ms / TICK_MS)), rngState };
  const draw = nextRandom(rngState);
  const ms = effect.ms + (draw.value * 2 - 1) * effect.variationMs;
  return { ticks: Math.max(1, Math.round(ms / TICK_MS)), rngState: draw.state };
}

// La tranche de TÊTE : les effets avant le premier `wait` (toute la liste
// sans `wait`, la même référence).
export function sequenceHead(effects) {
  const index = effects.findIndex(isWait);
  return index < 0 ? effects : effects.slice(0, index);
}

// Les tranches SUIVANTES, prêtes à attendre : `[{ ticksLeft, effects }]`,
// chacune avec son délai CUMULÉ depuis maintenant (deux `wait` de 500 ms
// mettent la troisième tranche à 1 s). Deux `wait` qui se suivent
// s'additionnent, sans tranche vide entre eux. `rngState` : le PRNG des
// variations (voir waitTicks), rendu avancé d'un pas par `wait` qui varie.
// -> { chunks, rngState } ; liste sans `wait` -> aucune tranche, même état.
export function sequenceTail(effects, rngState) {
  const chunks = [];
  let ticks = 0;
  let current = null;
  let state = rngState;
  for (const effect of effects) {
    if (isWait(effect)) {
      const wait = waitTicks(effect, state);
      ticks += wait.ticks;
      state = wait.rngState;
      current = null;
      continue;
    }
    if (ticks === 0) continue;
    if (!current) {
      current = { ticksLeft: ticks, effects: [] };
      chunks.push(current);
    }
    current.effects.push(effect);
  }
  return { chunks, rngState: state };
}
