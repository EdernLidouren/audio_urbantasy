// Jeu des billes : la PRÉVISION. Aucune logique de règle ici : elle copie l'état,
// applique l'action envisagée sur la copie, lance la vraie résolution
// (core/marbles.js/runResolution) et lit le journal produit. Elle ne peut donc
// pas diverger du moteur.
//
// Garde-fous :
// - À L'AVEUGLE : la copie (core/marbles.js/blindCopy) ne connaît du sac et de la
//   défausse que leur nombre de billes, et n'a pas le hasard de la partie ; le
//   déroulé est aveugle (options.blind). Une pioche y a lieu, avec ses arrêts
//   (main pleine, plus de billes), mais sa bille est inconnue ; une régénération
//   s'annonce sans mélange. Rien n'est révélé, rien n'avance le hasard réel ;
// - seules une pose et un échange s'envisagent, jamais une pioche de tour ;
// - l'état reçu n'est jamais modifié.
//
// Résultat : { ok: false, error } si l'action serait refusée (mêmes codes que le
// réducteur), sinon { ok: true, error: null, knockout, hit, phases, speed, mass,
// impact, drawn, regenerates, uncertain }, où :
//   knockout, hit  l'effet de l'action envisagée (null : pas de tel effet), une clé
//                  par déclencheur prévu pendant une pose (forecast.line
//                  "placement" de MARBLE_TRIGGERS) ;
//   phases         par emplacement, l'effet de phase de sa bille (null : pas de
//                  phase, emplacement vide ou bille retirée avant) ;
//   cleared        par emplacement, la bille retirée AVANT sa phase (une Fêlure qui
//                  l'amène à son maximum), ou null : sa phase est sautée ;
//   wear           les changements d'usure, dans l'ordre : [{ type, slot, marble,
//                  wear }] (usure de phase, Polissage, Fêlure) ;
//   retired        les billes retirées par usure, [{ slot, marble }], dans l'ordre ;
//   slotEffects    par emplacement, les effets des déclencheurs qui se prévoient avec
//                  lui (forecast.line "slot" : le Final d'une bille qui atteindra son
//                  usure maximale ce tour), chacun { trigger, ...effet } ; [] sinon ;
//   drawn          les billes que l'action et la résolution piocheraient ;
//   regenerates    vrai si le sac serait régénéré en chemin ;
//   uncertain      vrai si une bille piochée aurait pu réagir selon son identité,
//                  que la prévision ignore : ses chiffres ne sont alors pas sûrs.
// Un effet : { marble, speed, mass, draw, operations, given }, le total effectif de
// la bille, bonus reçu compris, et ses actions sur une bille (Polissage, Fêlure).

import { MARBLE_TRIGGERS } from "../config/marbles-values.js";
import { SLOTS, blindCopy, marblesReduce, runResolution, stageRefusal } from "./marbles.js";

// Les déclencheurs prévus pendant une pose (config/marbles-values.js) : chacun a sa
// clé dans le résultat, son effet ou null.
const PLACEMENT_TRIGGERS = MARBLE_TRIGGERS.filter((trigger) => trigger.forecast.line === "placement");
// Ceux qui se prévoient avec l'emplacement de leur bille (le Final).
const SLOT_TRIGGERS = new Set(MARBLE_TRIGGERS.filter((trigger) => trigger.forecast.line === "slot").map((trigger) => trigger.id));

const FORECASTABLE_ACTIONS = ["place", "swap"];

function outcomeOf(event) {
  if (event === undefined) return null;
  return { marble: event.marble, speed: event.speedDelta, mass: event.massDelta, draw: event.draw, operations: event.operations, given: event.given };
}

function failed(error) {
  return { ok: false, error };
}

const WEAR_EVENTS = new Set(["wear", "polished", "cracked"]);

// Par emplacement, la bille retirée par usure AVANT que sa phase ne vienne (sa phase
// est alors sautée), ou null.
function clearedBeforePhase(events) {
  const cleared = Object.fromEntries(SLOTS.map((slot) => [slot, null]));
  const phased = new Set();
  for (const event of events) {
    if (event.type === "phase" || event.type === "phaseSkipped") phased.add(event.slot);
    if (event.type === "removed" && event.cause === "wear" && !phased.has(event.slot)) cleared[event.slot] = event.marble;
  }
  return cleared;
}

// Ce que disent les journaux de l'action et de la résolution. Exportée pour
// comparer la prévision au résultat réel, lu de la même façon (sans `uncertain`,
// qui n'existe qu'à l'aveugle).
export function readForecast(actionEvents, resolutionEvents) {
  const all = [...actionEvents, ...resolutionEvents];
  const fromAction = (trigger) => actionEvents.find((event) => event.type === "effect" && event.trigger === trigger);
  const phaseOf = (slot) => resolutionEvents.find((event) => event.type === "effect" && event.trigger === "phase" && event.slot === slot);
  const { speed, mass, impact } = resolutionEvents.find((event) => event.type === "impact");
  return {
    ok: true,
    error: null,
    ...Object.fromEntries(PLACEMENT_TRIGGERS.map((trigger) => [trigger.id, outcomeOf(fromAction(trigger.id))])),
    phases: Object.fromEntries(SLOTS.map((slot) => [slot, outcomeOf(phaseOf(slot))])),
    slotEffects: Object.fromEntries(
      SLOTS.map((slot) => [
        slot,
        all
          .filter((event) => event.type === "effect" && SLOT_TRIGGERS.has(event.trigger) && event.slot === slot)
          .map((event) => ({ trigger: event.trigger, ...outcomeOf(event) })),
      ])
    ),
    speed,
    mass,
    impact,
    cleared: clearedBeforePhase(all),
    wear: all.filter((event) => WEAR_EVENTS.has(event.type)).map(({ type, slot, marble, wear }) => ({ type, slot, marble, wear })),
    retired: all.filter((event) => event.type === "removed" && event.cause === "wear").map(({ slot, marble }) => ({ slot, marble })),
    drawn: all.filter((event) => event.type === "draw").length,
    regenerates: all.some((event) => event.type === "bagRegenerated"),
  };
}

// `action` : la pose ou l'échange envisagé, ou null pour prévoir le triangle
// actuel. `types` : la table des billes (core/marbles.js, en-tête).
export function forecast(state, action, types) {
  const refusal = stageRefusal(state, "play");
  if (refusal) return failed(refusal);
  if (action !== null && !FORECASTABLE_ACTIONS.includes(action?.type)) return failed("unknownAction");

  const copy = blindCopy(state);
  const applied = action === null ? { ok: true, state: copy, events: [], uncertain: false } : marblesReduce(copy, action, types, { blind: true });
  if (!applied.ok) return failed(applied.error);
  const resolved = runResolution(applied.state, types, { blind: true });
  if (!resolved.ok) return failed(resolved.error);
  return { ...readForecast(applied.events, resolved.events), uncertain: applied.uncertain || resolved.uncertain };
}
