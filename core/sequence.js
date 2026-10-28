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

export function isWait(effect) {
  return effect.type === "wait";
}

// Durée d'un `wait` en ticks : au moins un, pour qu'une attente déclarée
// sépare toujours deux tranches.
function waitTicks(effect) {
  return Math.max(1, Math.round(effect.ms / TICK_MS));
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
// s'additionnent, sans tranche vide entre eux. Liste sans `wait` -> [].
export function sequenceTail(effects) {
  const chunks = [];
  let ticks = 0;
  let current = null;
  for (const effect of effects) {
    if (isWait(effect)) {
      ticks += waitTicks(effect);
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
  return chunks;
}
