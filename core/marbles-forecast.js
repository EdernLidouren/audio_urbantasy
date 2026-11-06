// Jeu des billes : la PRÉVISION. Aucune logique de règle ici : elle copie l'état,
// applique l'action envisagée sur la copie, lance la vraie résolution
// (core/marbles.js/runResolution) et lit le journal produit. Elle ne peut donc
// pas diverger du moteur.
//
// Garde-fous :
// - la copie n'a ni sac ni état de hasard : même un futur effet ne pourrait y
//   lire ce qui reste à piocher. Un effet de pioche s'annoncera « Pioche 1 »,
//   sans tirer : c'est à lui d'écrire cela dans le journal le jour où il existe ;
// - seules une pose et un échange s'envisagent, jamais une pioche ;
// - l'état reçu n'est jamais modifié.
//
// Résultat : { ok: false, error } si l'action serait refusée (mêmes codes que le
// réducteur), sinon { ok: true, error: null, knockout, hit, phases, speed, mass,
// impact }, où knockout et hit sont l'effet de l'action envisagée (null : pas de
// tel effet) et phases, par emplacement, l'effet de phase de sa bille (null :
// emplacement vide). Un effet : { marble, speed, mass, given }, le total effectif
// de la bille, bonus reçu compris.

import { MARBLE_TYPES } from "../config/marbles-values.js";
import { SLOTS, marblesReduce, runResolution, stageRefusal } from "./marbles.js";

const FORECASTABLE_ACTIONS = ["place", "swap"];

function outcomeOf(event) {
  if (event === undefined) return null;
  return { marble: event.marble, speed: event.speedDelta, mass: event.massDelta, given: event.given };
}

function failed(error) {
  return { ok: false, error };
}

// Ce que disent les journaux de l'action et de la résolution. Exportée pour
// comparer la prévision au résultat réel, lu de la même façon.
export function readForecast(actionEvents, resolutionEvents) {
  const fromAction = (trigger) => actionEvents.find((event) => event.type === "effect" && event.trigger === trigger);
  const phaseOf = (slot) => resolutionEvents.find((event) => event.type === "effect" && event.trigger === "phase" && event.slot === slot);
  const { speed, mass, impact } = resolutionEvents.find((event) => event.type === "impact");
  return {
    ok: true,
    error: null,
    knockout: outcomeOf(fromAction("knockout")),
    hit: outcomeOf(fromAction("hit")),
    phases: Object.fromEntries(SLOTS.map((slot) => [slot, outcomeOf(phaseOf(slot))])),
    speed,
    mass,
    impact,
  };
}

// `action` : la pose ou l'échange envisagé, ou null pour prévoir le triangle
// actuel.
export function forecast(state, action = null, types = MARBLE_TYPES) {
  const refusal = stageRefusal(state, "play");
  if (refusal) return failed(refusal);
  if (action !== null && !FORECASTABLE_ACTIONS.includes(action?.type)) return failed("unknownAction");

  const copy = { ...structuredClone(state), bag: [], rngState: 0 };
  const applied = action === null ? { ok: true, state: copy, events: [] } : marblesReduce(copy, action, types);
  if (!applied.ok) return failed(applied.error);
  const resolved = runResolution(applied.state, types);
  if (!resolved.ok) return failed(resolved.error);
  return readForecast(applied.events, resolved.events);
}
