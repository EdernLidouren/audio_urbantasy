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
// - l'état reçu n'est jamais modifié, ses valeurs de partie comprises : la copie
//   porte le registre (core/marbles-tally.js), qui y évolue comme dans la partie.
//
// L'EXCEPTION DE L'ÉVEIL : un déclencheur dont la bille concernée est la bille
// piochée (MARBLE_TRIGGERS, `marble: "drawn"`) ne se prévoit jamais, puisque la
// bille piochée est inconnue. Ses effets ne sont jamais dans les valeurs prévues ;
// la prévision se dit « incertaine » (`uncertain`) dès qu'elle pioche au moins une
// bille et qu'une bille qu'elle pourrait piocher a un tel effet. La propriété
// « prévision = résultat réel » vaut pour tout ce qui ne dépend pas d'un Éveil :
// pour tout résultat réel où aucun Éveil n'a joué.
//
// Résultat : { ok: false, error } si l'action serait refusée (mêmes codes que le
// réducteur), sinon { ok: true, error: null, flick, knockout, hit, phases, speed,
// mass, impact, drawn, regenerations, tally, uncertain }, où :
//   flick, knockout, hit  l'effet de l'action envisagée (null : pas de tel effet),
//                  une clé par déclencheur prévu pendant une pose (forecast.line
//                  "placement" de MARBLE_TRIGGERS). Une Chiquenaude qui vide
//                  l'emplacement visé n'a ni Éjection ni Tic après elle : null ;
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
//   regenerations  les régénérations du sac en chemin, dans l'ordre, chacune
//                  { effects } : les effets des déclencheurs prévus avec elle
//                  (forecast.line "regeneration" : les Trouvailles des billes
//                  actives, qui sont connues), dans l'ordre, chacun { trigger, slot,
//                  ...effet } ; seule l'identité des billes piochées reste cachée ;
//                  [] si le sac ne serait pas régénéré ;
//   drawn          les billes que l'action et la résolution piocheraient ;
//   tally          les valeurs de partie à la fin de la résolution ;
//   uncertain      vrai si une bille piochée aurait pu réagir selon son identité,
//                  que la prévision ignore : ses chiffres ne sont alors pas sûrs.
//                  Aujourd'hui, l'Éveil : une bille est piochée, et une bille qui
//                  pourrait l'être en a un (le sac ; avec une régénération en
//                  chemin, aussi la défausse et ce qui y part pendant l'action et la
//                  résolution).
// Un effet : { marble, speed, mass, draw, operations, given }, le total effectif de
// la bille, bonus reçu compris, et ses actions sur une bille (Polissage, Fêlure).

import { MARBLE_TRIGGERS } from "../config/marbles-values.js";
import { SLOTS, UNKNOWN_MARBLE, blindCopy, marblesReduce, runResolution, stageRefusal } from "./marbles.js";

// Les déclencheurs prévus pendant une pose (config/marbles-values.js) : chacun a sa
// clé dans le résultat, son effet ou null.
const PLACEMENT_TRIGGERS = MARBLE_TRIGGERS.filter((trigger) => trigger.forecast.line === "placement");
// Ceux qui se prévoient avec l'emplacement de leur bille (le Final), et ceux qui se
// prévoient avec une régénération (la Trouvaille).
const triggerIds = (line) => new Set(MARBLE_TRIGGERS.filter((trigger) => trigger.forecast.line === line).map((trigger) => trigger.id));
const SLOT_TRIGGERS = triggerIds("slot");
const REGENERATION_TRIGGERS = triggerIds("regeneration");

const FORECASTABLE_ACTIONS = ["place", "swap"];

// Les déclencheurs de la bille piochée (l'Éveil), qui ne se prévoient jamais.
const DRAWN_TRIGGERS = MARBLE_TRIGGERS.filter((trigger) => trigger.marble === "drawn");

// Un Éveil est-il possible ? Une bille piochée, et, parmi celles qui pouvaient
// l'être, une qui a un effet d'un déclencheur de la bille piochée. Les billes qui
// pouvaient l'être : le sac ; s'il est régénéré en chemin, toutes celles qui ont pu
// passer par la défausse (la défausse d'avant, et chaque bille défaussée pendant
// l'action et la résolution, que le journal nomme). Rien n'est révélé : la
// composition du sac et de la défausse est déjà connue du joueur, pas leur ordre.
function awakenPossible(state, events, types) {
  if (!events.some((event) => event.type === "draw")) return false;
  const pool = [...state.bag];
  if (events.some((event) => event.type === "bagRegenerated")) {
    pool.push(...state.discard, ...events.filter((event) => event.type === "discarded").map((event) => event.marble));
  }
  // Une bille déjà inconnue (une vue où le sac est caché, celle des joueurs
  // automatiques) pourrait en avoir un.
  const mayAwaken = (marble) => marble === UNKNOWN_MARBLE || DRAWN_TRIGGERS.some((trigger) => (types[marble][trigger.field]?.length ?? 0) > 0);
  return pool.some(mayAwaken);
}

function outcomeOf(event) {
  if (event === undefined) return null;
  return { marble: event.marble, speed: event.speedDelta, mass: event.massDelta, draw: event.draw, operations: event.operations, given: event.given };
}

// Les régénérations d'un journal, chacune avec les effets prévus qu'elle déclenche :
// une Trouvaille se règle juste après sa régénération (core/marbles.js/
// regenerateBag), avant toute autre : elle appartient à la dernière émise.
function regenerationsOf(events) {
  const regenerations = [];
  for (const event of events) {
    if (event.type === "bagRegenerated") regenerations.push({ effects: [] });
    if (event.type === "effect" && REGENERATION_TRIGGERS.has(event.trigger)) {
      regenerations.at(-1).effects.push({ trigger: event.trigger, slot: event.slot, ...outcomeOf(event) });
    }
  }
  return regenerations;
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

// Ce que disent les journaux de l'action et de la résolution, et l'état d'après
// (`finalState`, ses valeurs de partie). Exportée pour comparer la prévision au
// résultat réel, lu de la même façon (sans `uncertain`, qui n'existe qu'à
// l'aveugle).
export function readForecast(actionEvents, resolutionEvents, finalState) {
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
    regenerations: regenerationsOf(all),
    speed,
    mass,
    impact,
    cleared: clearedBeforePhase(all),
    wear: all.filter((event) => WEAR_EVENTS.has(event.type)).map(({ type, slot, marble, wear }) => ({ type, slot, marble, wear })),
    retired: all.filter((event) => event.type === "removed" && event.cause === "wear").map(({ slot, marble }) => ({ slot, marble })),
    drawn: all.filter((event) => event.type === "draw").length,
    tally: finalState.tally,
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
  const uncertain = applied.uncertain || resolved.uncertain || awakenPossible(state, [...applied.events, ...resolved.events], types);
  return { ...readForecast(applied.events, resolved.events, resolved.state), uncertain };
}
