// Jeu des billes : la PRÉVISION. Aucune logique de règle ici : elle copie l'état,
// applique l'action envisagée sur la copie, lance la vraie résolution
// (marbles/core/marbles.js/runResolution) et lit le journal produit. Elle ne peut donc
// pas diverger du moteur.
//
// Garde-fous :
// - À L'AVEUGLE : la copie (blindCopy, plus bas) ne connaît du sac que son nombre de
//   billes (la défausse, que le joueur connaît, reste telle quelle ; un mélange à
//   l'aveugle la cache), et n'a pas le hasard de la partie ; le
//   déroulé est aveugle (options.blind). Une pioche y a lieu, avec ses arrêts
//   (main pleine, plus de billes), mais sa bille est inconnue ; une régénération
//   s'annonce sans mélange. Rien n'est révélé, rien n'avance le hasard réel ;
// - seules une pose et un échange s'envisagent, jamais une pioche de tour ;
// - l'état reçu n'est jamais modifié, ses valeurs de partie comprises : la copie
//   porte le registre (marbles/core/tally.js), qui y évolue comme dans la partie.
//
// L'EXCEPTION DE L'ÉVEIL : un déclencheur dont la bille concernée est la bille
// piochée (MARBLE_TRIGGERS, `marble: "drawn"`) ne se prévoit jamais, puisque la
// bille piochée est inconnue. Ses effets ne sont jamais dans les valeurs prévues ;
// la prévision se dit « incertaine » (`uncertain`) dès qu'elle pioche au moins une
// bille et qu'une bille qu'elle pourrait piocher a un tel effet. La propriété
// « prévision = résultat réel » vaut pour tout ce qui ne dépend pas d'un Éveil :
// pour tout résultat réel où aucun Éveil n'a joué.
//
// L'EXCEPTION DU CHOIX : la prévision ne devine jamais le choix du joueur. Une cible
// au choix (marbles/core/effects.js, en-tête) y reste INDÉCISE : son action n'est pas
// appliquée, l'effet qui la porte le dit (`undecided`, « selon votre choix »), et
// `choiceDependent` est vrai : ce qui en dépend n'est pas calculé. Une cible au
// choix sans aucune cible éligible, elle, se prévoit (`empty`). La propriété
// « prévision = résultat réel » vaut donc pour tout ce qui ne dépend ni d'un Éveil ni
// d'un choix.
//
// PRÉVOIR UNE RÉPONSE : avec un choix en attente, `forecast(state, { type: "choose",
// ... })` rejoue l'action suspendue À L'AVEUGLE depuis son état de départ
// (marbles/core/marbles.js/replayAction), les réponses déjà données plus celle-ci, puis la
// résolution si l'action n'en était pas une : l'Impact prévu du tour avec ce choix,
// les choix suivants restant indécis. Ce que le joueur a vu piocher depuis le début
// de l'action y redevient inconnu : un rejeu qui en dépendrait diverge, et le choix
// concerné reste indécis. Une réponse s'y repère par sa cible ET sa bille
// (marbles/core/choices.js/answerOf) : si le rejeu a mis une autre bille connue à cette place
// (un Éveil inconnu n'y a pas empoché la première de la main, par exemple), le
// choix reste indécis plutôt que de prévoir une autre bille.
//
// Résultat : { ok: false, error } si l'action serait refusée (mêmes codes que le
// réducteur), sinon { ok: true, error: null, flick, knockout, hit, phases, speed,
// mass, impact, drawn, regenerations, potEffects, potReactions, interrupted, tally,
// uncertain, awakenPossible }, où :
//   flick, knockout, hit  l'effet de l'action envisagée (null : pas de tel effet),
//                  une clé par déclencheur prévu pendant une pose (forecast.line
//                  "placement" de MARBLE_TRIGGERS). Une Chiquenaude qui vide
//                  l'emplacement visé n'a ni Éjection ni Tic après elle : null.
//                  Une Éjection provoquée par l'action Éjecter n'est pas celle de la
//                  pose : elle se lit chez l'effet qui éjecte (`ejected`) ;
//   phases         par emplacement, l'effet de phase de sa bille (null : pas de
//                  phase, emplacement vide ou bille retirée avant) ;
//   cleared        par emplacement, la bille retirée AVANT sa phase (une Fêlure qui
//                  l'amène à son maximum, Empocher ou Éjecter), ou null : sa phase est
//                  sautée ;
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
//   potEffects     ce que chaque bille du pot produirait PENDANT LA RÉSOLUTION, son
//                  effet à chaque résolution et ses réactions (En poche, à chaque
//                  (occurrence)) regroupés en un effet (valeurs additionnées, actions
//                  et résultats à la suite), dans l'ordre d'arrivée (celles empochées
//                  pendant la résolution comprises) ; une bille qui ne joue rien n'y
//                  est pas ; [] sinon ;
//   potReactions   de même, les réactions du pot PENDANT L'ACTION envisagée (la pose) ;
//   statusEffects  ce que chaque statut produirait par ses réactions PENDANT LA
//                  RÉSOLUTION, regroupé en un effet par statut (`status`), dans l'ordre
//                  de leur première réaction ; [] sinon ;
//   statusReactions de même, PENDANT L'ACTION envisagée ;
//   interrupted    vrai si la limite de sécurité du bus arrêterait la chaîne
//                  (chainInterrupted) : une anomalie, que R et la confirmation disent ;
//   choiceDependent vrai si un choix du joueur est resté indécis (plus haut) ;
//   awakenPossible vrai si un Éveil est possible (voir plus haut) ; une des
//                  raisons d'`uncertain` ;
//   hiddenRead     vrai si un montant ou une condition a lu l'identité d'une bille
//                  cachée (un filtre, une famille, sur une bille piochée à l'aveugle
//                  ou au sac) : ce qu'elle aurait compté n'est pas sûr ; une des
//                  raisons d'`uncertain`.
// Un effet : { marble, status?, speed, mass, draw, operations, given, pockets?, empty?,
// undecided?, ejected?, discards? } (`status` : la réaction d'un statut, sans bille), le
// total effectif de la bille, bonus reçu compris, et ses actions sur une bille
// (Polissage, Fêlure, Empocher). `pockets` (seulement s'il y en a) : ce que ses
// Empocher ont déplacé, dans l'ordre, chacun { marble, lost, entry } : la bille (null
// si c'est une bille piochée, inconnue), perdue faute de place ou non, et l'effet de
// son entrée au pot (En poche, à l'entrée), ou null. `empty` (seulement s'il y en
// a) : ses actions qui n'ont rien trouvé à leur cible, dans l'ordre, chacune
// { action, slot, target?, marble? } (l'évènement targetEmpty) : emplacement vide,
// main vide, bille déjà partie, aucune cible à choisir. `undecided` (seulement s'il y
// en a) : ses actions au choix restées indécises, chacune { action }. `ejected`
// (seulement s'il y en a) : les billes que ses Éjecter ont chassées, dans l'ordre,
// chacune { marble, slot, knockout } : la bille, son emplacement, et l'effet de son
// Éjection ainsi provoquée, ou null. Le moteur le sait aussi sûrement qu'il joue le
// coup ; une cible vidée par une pioche à l'aveugle reste vide pour de bon.

import { MARBLE_POCKET, MARBLE_TRIGGERS } from "../config/values.js";
import { SLOTS, marblesReduce, replayAction, runResolution, stageRefusal } from "./marbles.js";
import { UNKNOWN_MARBLE } from "./effects.js";
import { answerOf, chooseRefusal } from "./choices.js";

// Une copie À L'AVEUGLE d'un état, celle de la prévision : le sac n'y garde que son
// nombre de billes, jamais leur identité ni leur ordre, et le hasard de la partie
// en est retiré (null : un tirage y échouerait). La défausse, que le joueur connaît
// dans l'ordre d'arrivée, reste telle quelle (Ramasser la lit) ; un mélange à
// l'aveugle la cache (regenerateBag). Un déroulé à
// l'aveugle (options.blind) n'en a jamais besoin.
function blindCopy(state) {
  const hidden = (list) => list.map(() => UNKNOWN_MARBLE);
  return { ...structuredClone(state), bag: hidden(state.bag), rngState: null };
}

// Les déclencheurs prévus pendant une pose (marbles/config/values.js) : chacun a sa
// clé dans le résultat, son effet ou null.
const PLACEMENT_TRIGGERS = MARBLE_TRIGGERS.filter((trigger) => trigger.forecast.line === "placement");
// Ceux qui se prévoient avec l'emplacement de leur bille (le Final), et ceux qui se
// prévoient avec une régénération (la Trouvaille).
const triggerIds = (line) => new Set(MARBLE_TRIGGERS.filter((trigger) => trigger.forecast.line === line).map((trigger) => trigger.id));
const SLOT_TRIGGERS = triggerIds("slot");
const REGENERATION_TRIGGERS = triggerIds("regeneration");

const FORECASTABLE_ACTIONS = ["place", "swap"];

// Les effets En poche joués à l'entrée au pot (leur évènement est la mise en poche),
// dits chez l'effet qui empoche ; les autres (à chaque résolution, les réactions)
// se regroupent par bille du pot (`potIndex` de l'effet).
const ENTRY_TRIGGERS = new Set(MARBLE_POCKET.moments.filter((moment) => moment.event === "pocketed").map((moment) => moment.trigger));
const POT_TRIGGERS = new Set(MARBLE_POCKET.moments.filter((moment) => moment.event !== "pocketed").map((moment) => moment.trigger));

// Les déclencheurs de la bille piochée (l'Éveil), qui ne se prévoient jamais.
const DRAWN_TRIGGERS = MARBLE_TRIGGERS.filter((trigger) => trigger.marble === "drawn");

// Un Éveil est-il possible ? Une bille piochée, et, parmi celles qui pouvaient
// l'être, une qui a un effet d'un déclencheur de la bille piochée. Les billes qui
// pouvaient l'être : le sac ; s'il est régénéré en chemin, toutes celles qui ont pu
// passer par la défausse avant le dernier mélange (la défausse d'avant, et chaque
// bille arrivée à la défausse pendant l'action et la résolution avant ce mélange,
// que le journal nomme) : une bille arrivée après, en partance pendant son Final
// par exemple, ne peut plus être piochée. Rien n'est révélé : la composition du sac
// et de la défausse est déjà connue du joueur, pas leur ordre.
function awakenPossible(state, events, types) {
  if (!events.some((event) => event.type === "draw")) return false;
  const pool = [...state.bag];
  const lastShuffle = events.findLastIndex((event) => event.type === "bagRegenerated");
  if (lastShuffle >= 0) {
    pool.push(...state.discard, ...events.slice(0, lastShuffle).filter((event) => event.type === "discarded").map((event) => event.marble));
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
//   empty   : ses cibles vides (targetEmpty) ;
//   undecided : ses choix indécis (choiceUndecided) ;
//   ejected : les billes que ses Éjecter ont chassées (eject), avec l'effet de leur
//             Éjection, l'effet `knockout` qui porte `ejectedBy` sur leur emplacement
//             avant leur départ (une interruption : il vient juste après), ou null.
// -> Map effet -> { pockets: [{ marble, lost, entry }], empty: [{ action, slot, ... }],
//    undecided: [{ action }], ejected: [{ marble, slot, knockout }] }.
//   discards : les billes que ses Défausser ont envoyées à la défausse depuis la
//             main ou le sac (`discarded` qui porte `by`), avec l'effet de leur Chute,
//             qui suit aussitôt (une interruption), ou null ; une bille défaussée
//             depuis le triangle se dit sur son emplacement (retirée, puis sa Chute).
const RESULT_EVENTS = new Set(["pocketed", "lost", "targetEmpty", "choiceUndecided", "eject", "discarded"]);

// Les arrivées d'une bille au bout de son trajet (marbles/core/path.js/travel).
const ARRIVALS = new Set(["discarded", "pocketed", "lost"]);

// L'effet de l'Éjection provoquée par l'évènement `eject` à `index`, ou null : le
// premier `effect` d'Éjection provoquée sur son emplacement, pendant qu'elle est en
// partance, avant son arrivée.
function provokedKnockout(events, index) {
  const { slot, marble } = events[index];
  for (const event of events.slice(index + 1)) {
    if (ARRIVALS.has(event.type) && event.marble === marble) return null;
    if (event.type === "effect" && event.trigger === "knockout" && event.ejectedBy !== undefined && event.slot === slot && event.marble === marble) return event;
  }
  return null;
}

function resultsByEffect(events) {
  const results = new Map();
  events.forEach((event, index) => {
    if (!RESULT_EVENTS.has(event.type)) return;
    const { by } = event;
    // Une arrivée à la défausse sans effet qui l'y envoie (usure, éjection), ou
    // depuis le triangle (dite sur son emplacement) : pas un résultat d'effet.
    if (by === undefined || (event.type === "discarded" && event.from === "triangle")) return;
    const source = events
      .slice(0, index)
      .findLast(
        (other) => other.type === "effect" && other.trigger === by.trigger && other.marble === by.marble && (other.slot ?? null) === by.slot && other.status === by.status
      );
    if (source === undefined) return;
    const found = results.get(source) ?? { pockets: [], empty: [], undecided: [], ejected: [], discards: [] };
    results.set(source, found);
    if (event.type === "eject") {
      found.ejected.push({ marble: event.marble, slot: event.slot, knockout: provokedKnockout(events, index) });
      return;
    }
    if (event.type === "choiceUndecided") {
      found.undecided.push({ action: event.action });
      return;
    }
    if (event.type === "targetEmpty") {
      const { type, by: _by, ...target } = event;
      found.empty.push(target);
      return;
    }
    const next = events[index + 1];
    if (event.type === "discarded") {
      const drop = next?.type === "effect" && next.trigger === "drop" && next.marble === event.marble ? next : null;
      found.discards.push({ marble: event.marble, drop });
      return;
    }
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
    // Celui d'un statut le nomme.
    if (event.status !== undefined) outcome.status = event.status;
    const found = results.get(event);
    if (found === undefined) return outcome;
    return {
      ...outcome,
      ...(found.pockets.length > 0 && { pockets: found.pockets.map(({ marble, lost, entry }) => ({ marble, lost, entry: entry === null ? null : outcomeOf(entry) })) }),
      ...(found.empty.length > 0 && { empty: found.empty }),
      ...(found.undecided.length > 0 && { undecided: found.undecided }),
      ...(found.ejected.length > 0 && {
        ejected: found.ejected.map(({ marble, slot, knockout }) => ({ marble, slot, knockout: knockout === null ? null : outcomeOf(knockout) })),
      }),
      ...(found.discards.length > 0 && { discards: found.discards.map(({ marble, drop }) => ({ marble, drop: drop === null ? null : outcomeOf(drop) })) }),
    };
  };
  return outcomeOf;
}

// Plusieurs effets prévus d'une même bille en un : valeurs additionnées, actions,
// dons et résultats (mises en poche, cibles vides) à la suite, dans l'ordre.
function combinedOutcome(outcomes) {
  const all = (key) => outcomes.flatMap((outcome) => outcome[key] ?? []);
  const sum = (key) => outcomes.reduce((total, outcome) => total + outcome[key], 0);
  const combined = { marble: outcomes[0].marble, speed: sum("speed"), mass: sum("mass"), draw: sum("draw"), operations: all("operations"), given: all("given") };
  if (outcomes[0].status !== undefined) combined.status = outcomes[0].status;
  if (all("pockets").length > 0) combined.pockets = all("pockets");
  if (all("empty").length > 0) combined.empty = all("empty");
  if (all("undecided").length > 0) combined.undecided = all("undecided");
  if (all("ejected").length > 0) combined.ejected = all("ejected");
  if (all("discards").length > 0) combined.discards = all("discards");
  return combined;
}

// Ce que chaque bille du pot joue dans ces évènements (sauf ses entrées), regroupé
// par place d'arrivée, dans cet ordre.
function potOutcomes(events, outcomeOf) {
  const byPlace = new Map();
  for (const event of events) {
    if (event.type !== "effect" || !POT_TRIGGERS.has(event.trigger)) continue;
    byPlace.set(event.potIndex, [...(byPlace.get(event.potIndex) ?? []), outcomeOf(event)]);
  }
  return [...byPlace.entries()].sort(([a], [b]) => a - b).map(([, outcomes]) => combinedOutcome(outcomes));
}

// Ce que chaque statut joue par ses réactions dans ces évènements, regroupé par
// statut, dans l'ordre de sa première réaction.
function statusOutcomes(events, outcomeOf) {
  const byStatus = new Map();
  for (const event of events) {
    if (event.type !== "effect" || event.trigger !== "statusReaction") continue;
    byStatus.set(event.status, [...(byStatus.get(event.status) ?? []), outcomeOf(event)]);
  }
  return [...byStatus.values()].map(combinedOutcome);
}

// Les régénérations d'un journal, chacune avec les effets prévus qu'elle déclenche :
// une Trouvaille se règle juste après sa régénération (marbles/core/run.js/
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

const BEFORE_PHASE_CAUSES = new Set(["wear", "pocket", "eject", "discard", "bounce"]);

// Par emplacement, la bille retirée AVANT que sa phase ne vienne (sa phase
// est alors sautée), ou null.
function clearedBeforePhase(events) {
  const cleared = Object.fromEntries(SLOTS.map((slot) => [slot, null]));
  const phased = new Set();
  for (const event of events) {
    if (event.type === "phase" || event.type === "phaseSkipped") phased.add(event.slot);
    // Une usure (une Fêlure), une mise en poche (Empocher), une éjection (Éjecter),
    // une défausse (Défausser) ou un rebond (Rebond) avant la phase.
    if (event.type === "removed" && BEFORE_PHASE_CAUSES.has(event.cause) && !phased.has(event.slot)) cleared[event.slot] = event.marble;
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
  // L'effet d'un déclencheur de la pose ; une Éjection provoquée par Éjecter n'en est pas.
  const fromAction = (trigger) => actionEvents.find((event) => event.type === "effect" && event.trigger === trigger && event.ejectedBy === undefined);
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
    potEffects: potOutcomes(resolutionEvents, outcomeOf),
    potReactions: potOutcomes(actionEvents, outcomeOf),
    statusEffects: statusOutcomes(resolutionEvents, outcomeOf),
    statusReactions: statusOutcomes(actionEvents, outcomeOf),
    interrupted: all.some((event) => event.type === "chainInterrupted"),
    choiceDependent: all.some((event) => event.type === "choiceUndecided"),
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
// actuel, ou, un choix en attente, une réponse (`choose`). `types`, `statuses` : la
// table des billes et celle des statuts (marbles/core/marbles.js, en-tête). Les
// STATUTS sont dans l'état, donc dans la copie : ils y agissent, s'y renforcent et
// y consomment leurs charges, sur la copie seulement.
export function forecast(state, action, types, statuses) {
  if (action?.type === "choose") return forecastAnswer(state, action, types, statuses);
  const refusal = stageRefusal(state, "play");
  if (refusal) return failed(refusal);
  if (action !== null && !FORECASTABLE_ACTIONS.includes(action?.type)) return failed("unknownAction");

  const copy = blindCopy(state);
  const applied = action === null ? { ok: true, state: copy, events: [], uncertain: false } : marblesReduce(copy, action, types, { blind: true, statuses });
  if (!applied.ok) return failed(applied.error);
  const resolved = runResolution(applied.state, types, { blind: true, statuses });
  if (!resolved.ok) return failed(resolved.error);
  const awakening = awakenPossible(state, [...applied.events, ...resolved.events], types);
  // Incertaine : un Éveil possible, ou une bille inconnue qui aurait pu réagir (une
  // bille piochée à l'aveugle puis empochée : son entrée au pot, ses effets du pot).
  const uncertain = applied.uncertain || resolved.uncertain || awakening;
  const hiddenRead = applied.hiddenRead === true || resolved.hiddenRead === true;
  return { ...readForecast(applied.events, resolved.events, resolved.state), uncertain, awakenPossible: awakening, hiddenRead };
}

// Une réponse au choix en attente, prévue (en-tête, « prévoir une réponse ») :
// l'action suspendue rejouée à l'aveugle avec cette réponse, puis la résolution si
// elle n'en était pas une. Ses journaux sont entiers, depuis le début de l'action.
function forecastAnswer(state, action, types, statuses) {
  const refusal = chooseRefusal(state, action);
  if (refusal) return failed(refusal);
  const { from, action: suspended, answers } = state.pendingChoice.resume;
  const options = { blind: true, statuses, answers: [...answers, answerOf(state.pendingChoice, action)] };
  const copy = blindCopy(from);
  const isResolution = suspended.type === "resolve";
  const applied = isResolution ? { ok: true, state: copy, events: [], uncertain: false } : replayAction(copy, suspended, types, options);
  const resolved = isResolution ? replayAction(copy, suspended, types, options) : runResolution(applied.state, types, { blind: true, statuses });
  const awakening = awakenPossible(from, [...applied.events, ...resolved.events], types);
  const uncertain = applied.uncertain || resolved.uncertain || awakening;
  const hiddenRead = applied.hiddenRead === true || resolved.hiddenRead === true;
  return { ...readForecast(applied.events, resolved.events, resolved.state), uncertain, awakenPossible: awakening, hiddenRead };
}
