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
// mass, impact, drawn, regenerations, potEffects, tally, uncertain, awakenPossible }, où :
//   flick, knockout, hit  l'effet de l'action envisagée (null : pas de tel effet),
//                  une clé par déclencheur prévu pendant une pose (forecast.line
//                  "placement" de MARBLE_TRIGGERS). Une Chiquenaude qui vide
//                  l'emplacement visé n'a ni Éjection ni Tic après elle : null ;
//   phases         par emplacement, l'effet de phase de sa bille (null : pas de
//                  phase, emplacement vide ou bille retirée avant) ;
//   cleared        par emplacement, la bille retirée AVANT sa phase (une Fêlure qui
//                  l'amène à son maximum, ou Empocher), ou null : sa phase est sautée ;
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
//   potEffects     les effets En poche à chaque résolution des billes du pot, dans
//                  l'ordre d'arrivée (celles empochées pendant la résolution
//                  comprises), chacun un effet ; [] sinon ;
//   awakenPossible vrai si un Éveil est possible (voir plus haut) ; une des
//                  raisons d'`uncertain`.
// Un effet : { marble, speed, mass, draw, operations, given, pockets?, empty? }, le
// total effectif de la bille, bonus reçu compris, et ses actions sur une bille
// (Polissage, Fêlure, Empocher). `pockets` (seulement s'il y en a) : ce que ses
// Empocher ont déplacé, dans l'ordre, chacun { marble, lost, entry } : la bille (null
// si c'est une bille piochée, inconnue), perdue faute de place ou non, et l'effet de
// son entrée au pot (En poche, à l'entrée), ou null. `empty` (seulement s'il y en
// a) : ses actions qui n'ont rien trouvé à leur cible, dans l'ordre, chacune
// { action, slot, target?, marble? } (l'évènement targetEmpty) : emplacement vide,
// main vide, bille déjà partie. Le moteur le sait aussi sûrement qu'il joue le
// coup ; une cible vidée par une pioche à l'aveugle reste vide pour de bon.

import { MARBLE_POCKET, MARBLE_TRIGGERS } from "../config/marbles-values.js";
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

// Les effets En poche joués à l'entrée au pot (leur évènement est la mise en poche)
// et ceux joués à chaque résolution (l'étape du pot).
const ENTRY_TRIGGERS = new Set(MARBLE_POCKET.moments.filter((moment) => moment.event === "pocketed").map((moment) => moment.trigger));
const POT_TRIGGERS = new Set(MARBLE_POCKET.moments.filter((moment) => moment.event === "potResolution").map((moment) => moment.trigger));

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

// Les résultats des actions sur une bille d'un journal, rattachés à l'effet qui les
// produit : l'effet `by` de l'évènement, le plus récent qui lui correspond (le même
// déclencheur, la même bille, le même emplacement).
//   pockets : ce que ses Empocher ont déplacé (pocketed, lost), avec l'effet
//             d'entrée qui suit aussitôt une mise en poche (une interruption : il
//             vient juste après), un évènement ou null ;
//   empty   : ses cibles vides (targetEmpty).
// -> Map effet -> { pockets: [{ marble, lost, entry }], empty: [{ action, slot, ... }] }.
function resultsByEffect(events) {
  const results = new Map();
  events.forEach((event, index) => {
    if (event.type !== "pocketed" && event.type !== "lost" && event.type !== "targetEmpty") return;
    const { by } = event;
    const source = events
      .slice(0, index)
      .findLast((other) => other.type === "effect" && other.trigger === by.trigger && other.marble === by.marble && (other.slot ?? null) === by.slot);
    if (source === undefined) return;
    const found = results.get(source) ?? { pockets: [], empty: [] };
    results.set(source, found);
    if (event.type === "targetEmpty") {
      const { type, by: _by, ...target } = event;
      found.empty.push(target);
      return;
    }
    const next = events[index + 1];
    const entry = event.type === "pocketed" && next?.type === "effect" && ENTRY_TRIGGERS.has(next.trigger) && next.marble === event.marble ? next : null;
    found.pockets.push({ marble: event.marble, lost: event.type === "lost", entry });
  });
  return results;
}

// La lecture d'un effet du journal `events`, ses mises en poche et ses cibles vides
// comprises (chacune seulement s'il y en a).
function outcomeReader(events) {
  const results = resultsByEffect(events);
  const outcomeOf = (event) => {
    if (event === undefined) return null;
    const outcome = { marble: event.marble, speed: event.speedDelta, mass: event.massDelta, draw: event.draw, operations: event.operations, given: event.given };
    const found = results.get(event);
    if (found === undefined) return outcome;
    return {
      ...outcome,
      ...(found.pockets.length > 0 && { pockets: found.pockets.map(({ marble, lost, entry }) => ({ marble, lost, entry: entry === null ? null : outcomeOf(entry) })) }),
      ...(found.empty.length > 0 && { empty: found.empty }),
    };
  };
  return outcomeOf;
}

// Les régénérations d'un journal, chacune avec les effets prévus qu'elle déclenche :
// une Trouvaille se règle juste après sa régénération (core/marbles.js/
// regenerateBag), avant toute autre : elle appartient à la dernière émise.
function regenerationsOf(events, outcomeOf) {
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
    // Une usure (une Fêlure) ou une mise en poche (Empocher) avant la phase.
    if (event.type === "removed" && (event.cause === "wear" || event.cause === "pocket") && !phased.has(event.slot)) cleared[event.slot] = event.marble;
  }
  return cleared;
}

// Ce que disent les journaux de l'action et de la résolution, et l'état d'après
// (`finalState`, ses valeurs de partie). Exportée pour comparer la prévision au
// résultat réel, lu de la même façon (sans `uncertain`, qui n'existe qu'à
// l'aveugle).
export function readForecast(actionEvents, resolutionEvents, finalState) {
  const all = [...actionEvents, ...resolutionEvents];
  const outcomeOf = outcomeReader(all);
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
    regenerations: regenerationsOf(all, outcomeOf),
    potEffects: resolutionEvents.filter((event) => event.type === "effect" && POT_TRIGGERS.has(event.trigger)).map(outcomeOf),
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
  const awakening = awakenPossible(state, [...applied.events, ...resolved.events], types);
  // Incertaine : un Éveil possible, ou une bille inconnue qui aurait pu réagir (une
  // bille piochée à l'aveugle puis empochée : son entrée au pot, ses effets du pot).
  const uncertain = applied.uncertain || resolved.uncertain || awakening;
  return { ...readForecast(applied.events, resolved.events, resolved.state), uncertain, awakenPossible: awakening };
}
