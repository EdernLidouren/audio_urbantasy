// JEU DES BILLES — le DÉROULÉ d'une action : son bus, ses écouteurs, les effets des
// billes, les choix, les actions sur une bille, la pioche et les retraits, le
// journal et les valeurs de partie qu'il tient (transact). Simulation pure, sans
// DOM, sans son, sans aléa non seedé. Le réducteur (marbles/core/marbles.js) n'y passe que
// ses actions (pioche du tour, échange, pose, résolution) ; le contenu
// (marbles/core/content.js) lui dit ce que déclarent les billes et décrit le
// journal.
//
// BUS ET ÉCOUTEURS — chaque action passe ses évènements par un bus
// (marbles/core/bus.js) : chacun entre au journal, puis les billes l'écoutent,
// toujours dans cet ordre : l'ordre horaire (base droite, base gauche, pointe), puis la main de
// la première à la dernière (marbleListeners). EVENT_TRIGGERS dit quels
// évènements déclenchent un effet de bille ; les autres passent au journal sans
// effet associé, prêts à servir.
//
// `types` (paramètre OBLIGATOIRE des fonctions qui lisent une bille) : la table
// des billes, un registre de contenu (marbles/content/types/index.js) que ce module
// n'importe jamais (CLAUDE.md) : la vue, les outils et les vérifications le lui
// passent. Les vérifications y passent aussi des tables fabriquées, qui testent
// ce qu'aucune bille actuelle ne produit (une Masse négative).

import { MARBLE_POCKET, MARBLE_TRIGGERS } from "../config/values.js";
import { nextRandom } from "../../lib/rng.js";
import { createEventBus } from "./bus.js";
import {
  CLAUSE_ACTIONS,
  FIRST_IN_HAND,
  KNOCKED_OUT,
  LAST_DISCARDED,
  NO_REFERENCE,
  UNKNOWN_MARBLE,
  addValues,
  effectAt,
  evaluateEffect,
  isAll,
  isBag,
  isChoice,
  passesFilters,
  resolveClauses,
} from "./effects.js";
import { HOLDER_ZONES, SLOTS } from "./zones.js";
import { recordTally } from "./tally.js";
import { ChoiceSuspension, chooseTargets } from "./choices.js";
import { ejectFromSlot, handRoom, moveBy, moveFromBag, moveFromDiscard, moveFromHand, moveFromSlot, redirect, retireMarble, travel } from "./path.js";
import { LISTENABLE_KEYS, REACTION_KEYS, REACTIVE_MOMENT, TALLY_COUNTERS, maxWearOf, pocketClauses, reactionClauses } from "./content.js";
import { NO_SOURCE, NO_STATUSES, applyStatus, definitionOf, isLocked, modifyActionAmount, modifyStat, statusReactionClauses, statusReactionsOf, useCharges } from "./statuses.js";


// --- Hasard ---

// Fisher-Yates sur une copie : toujours length - 1 pas de PRNG.
export function shuffled(list, rngState) {
  const result = [...list];
  let state = rngState;
  for (let i = result.length - 1; i > 0; i--) {
    const draw = nextRandom(state);
    state = draw.state;
    const j = Math.floor(draw.value * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return { list: result, rngState: state };
}

// --- Écouteurs ---

// Les billes qui écoutent le bus, dans leur ordre fixe : l'ordre horaire (base
// droite, base gauche, pointe), puis la main de la première à la dernière. Une liste relue à
// chaque évènement : elle suit le triangle tel qu'il est à cet instant.
export function marbleListeners(state) {
  const onTriangle = SLOTS.filter((slot) => state.triangle[slot] !== null).map((slot) => ({
    zone: "triangle",
    slot,
    marble: state.triangle[slot].marble,
  }));
  // Une bille en cours de lancer n'est plus en main, ni encore sur le triangle.
  const inHand = state.hand.map(({ marble, turnsInHand }, index) => ({ zone: "hand", index, marble, turnsInHand }));
  return [...onTriangle, ...inHand];
}

function isOnEventSlot(event, listener) {
  return listener.zone === "triangle" && listener.slot === event.slot;
}

// Quels évènements déclenchent un effet, et chez quelle bille : les clauses à
// jouer, ou null. Une bille sans le champ d'un déclencheur ne réagit pas du tout :
// pas d'évènement `effect`, à la différence d'une phase, qui en a toujours un.
// Une entrée, par type d'évènement :
//   id         l'identifiant du déclencheur (`trigger` de l'évènement `effect`) ;
//   zones      où sont les billes qu'il peut concerner ("triangle", "hand") : une
//              bille piochée à l'aveugle dans l'une d'elles rend la prévision
//              incertaine (handleEvent) ;
//   listeners  (facultatif) les billes concernées, quand ce ne sont pas les
//              écouteurs (marbleListeners) : une bille déjà retirée, ou en cours de
//              lancer, toujours connue ;
//   clauses(event, listener, types, statuses) (`statuses` : la table des statuts) ;
//   lock       (facultatif) le verrou qui le fait taire, { lock, trigger? }
//              (marbles/core/statuses.js/LOCKS) : rien ne joue tant qu'il agit.
// La phase est écrite ici ; les autres viennent de MARBLE_TRIGGERS.
const ON_SLOT = ["triangle"];

// La bille que nomme l'évènement, hors du triangle, par valeur `marble` du
// déclencheur ; sa zone est celle de marbles/core/effects.js/HOLDER_ZONES.
const NAMED_MARBLE = {
  // En main, sans emplacement : seul Empocher l'y prend (HOLDER_ZONES, selfZones).
  drawn: (event) => ({ slot: null, marble: event.marble, turnsInHand: 0 }),
  leaving: (event) => ({ slot: event.slot, marble: event.marble }),
  // À la défausse : l'emplacement qu'elle a quitté, si elle vient du triangle (sa
  // Chute se prévoit avec lui), sinon aucun.
  dropped: (event) => ({ slot: event.from === "triangle" ? event.slot : null, marble: event.marble }),
  thrown: (event) => ({ slot: event.slot, marble: event.marble, turnsInHand: event.turnsInHand }),
};
// Chaque valeur `marble` d'un déclencheur a sa zone ; chaque bille nommée hors du
// triangle, sa façon de se lire dans l'évènement.
for (const trigger of MARBLE_TRIGGERS) {
  if (!Object.hasOwn(HOLDER_ZONES, trigger.marble)) throw new Error(`marbles : la bille "${trigger.marble}" du déclencheur "${trigger.id}" n'a pas de zone (HOLDER_ZONES).`);
  if (HOLDER_ZONES[trigger.marble].zone !== "triangle" && !Object.hasOwn(NAMED_MARBLE, trigger.marble)) {
    throw new Error(`marbles : la bille "${trigger.marble}" du déclencheur "${trigger.id}" n'a pas de lecture (NAMED_MARBLE).`);
  }
}

function eventTrigger(trigger) {
  const clausesOf = (listener, types) => types[listener.marble][trigger.field] ?? null;
  // Un déclencheur verrouillé ne joue plus (marbles/core/statuses.js/LOCKS).
  const lock = { lock: "trigger", trigger: trigger.id };
  if (Object.hasOwn(NAMED_MARBLE, trigger.marble)) {
    // Une bille nommée inconnue (défaussée du sac à l'aveugle) rend la prévision
    // incertaine, sauf pour un déclencheur qui ne se prévoit jamais (l'Éveil, que
    // la prévision traite à part : marbles/core/forecast.js).
    const zone = HOLDER_ZONES[trigger.marble].zone;
    return {
      id: trigger.id,
      lock,
      zones: trigger.forecast.line === "none" ? [] : [zone],
      listeners: (event) => [{ zone: HOLDER_ZONES[trigger.marble].zone, ...NAMED_MARBLE[trigger.marble](event) }],
      clauses: (event, listener, types) => clausesOf(listener, types),
    };
  }
  return {
    id: trigger.id,
    lock,
    zones: ON_SLOT,
    clauses: (event, listener, types) => (isOnEventSlot(event, listener) ? clausesOf(listener, types) : null),
  };
}

// La place d'arrivée au pot de la bille que nomme un évènement d'un moment En poche :
// `potIndex` pour l'entrée (son `index` est sa place d'ORIGINE, dans la main), `index`
// pour l'étape du pot et les réactions.
function potPlaceOf(event) {
  return event.type === "pocketed" ? event.potIndex : event.index;
}

const EVENT_TRIGGERS = {
  phase: {
    id: "phase",
    zones: ON_SLOT,
    clauses: (event, listener, types) => (isOnEventSlot(event, listener) ? effectAt(listener.marble, listener.slot, types) : null),
  },
  ...Object.fromEntries(MARBLE_TRIGGERS.map((trigger) => [trigger.event, eventTrigger(trigger)])),
  // Les moments En poche : la bille du pot que nomme l'évènement, à sa place
  // d'arrivée (potPlaceOf). Une bille du pot inconnue (empochée à l'aveugle) rend la
  // prévision incertaine.
  ...Object.fromEntries(
    MARBLE_POCKET.moments.map((moment) => [
      moment.event,
      {
        id: moment.trigger,
        zones: ["pot"],
        // Un pot verrouillé : ses billes n'agissent plus.
        lock: { lock: "pot" },
        listeners: (event) => [{ zone: HOLDER_ZONES.pot.zone, slot: null, index: potPlaceOf(event), marble: event.marble }],
        clauses: (event, listener, types) =>
          moment.reactive ? reactionClauses(types[listener.marble], event.counter) : pocketClauses(types[listener.marble], moment),
      },
    ])
  ),
  // La RÉACTION D'UN STATUT (marbles/core/statuses.js) : aucune bille ne la joue, le
  // statut que nomme l'évènement (zone "status") ; ses clauses, celles de sa
  // définition pour ce compteur.
  statusReaction: {
    id: "statusReaction",
    zones: [],
    listeners: (event) => [{ zone: HOLDER_ZONES.status.zone, slot: null, marble: null, status: event.status }],
    clauses: (event, listener, types, statuses) => statusReactionClauses(definitionOf(statuses, event.status), event.counter),
  },
};

// LES RÉACTIONS d'un évènement qui vient d'être compté, ses SOURCES RÉACTIVES dans cet
// ordre : les billes du pot (En poche, à chaque (occurrence)), dans l'ordre
// d'arrivée, puis les statuts qui agissent (marbles/core/statuses.js), dans l'ordre
// d'acquisition ; chacune une fois par incrément de chaque compteur écoutable qu'elle
// écoute. `before` : le registre d'avant l'évènement (la portée « cette partie », qui
// ne revient jamais à zéro, donne l'incrément). Lues à l'émission, sur le pot et les
// statuts de ce moment : une source arrivée plus tard ne réagit pas à ce qui l'a
// précédée, ni à sa propre arrivée (une bille à sa mise en poche, qui a son moment
// « à l'entrée » ; un statut à sa réception ou à son renforcement). Elles sont
// émises après le traitement de l'évènement (handleEvent) : la bille concernée joue
// d'abord son propre effet ; pendant les phases de la résolution, retenues jusqu'à
// l'étape du pot (holdReactions). -> les évènements des réactions, dans l'ordre.
function reactionsOf(run, event, before) {
  const potListens = REACTION_KEYS.length > 0 && run.state.pot.length > 0 && !isLocked(run.state.statuses, run.statuses, "pot");
  const statusesListen = run.state.statuses.length > 0;
  if (!potListens && !statusesListen) return [];
  const after = run.state.tally;
  const heard = LISTENABLE_KEYS.map((id) => [id, after[id].game - before[id].game]).filter(([, count]) => count > 0);
  if (heard.length === 0) return [];
  // Un moment réactif déclaré, le pot écoute tous les compteurs écoutables.
  const pot = potListens ? pocketReactionsOf(run, event, heard) : [];
  const statuses = statusesListen ? statusReactionsOf(run.state.statuses, run.statuses, heard, event).map((reaction) => ({ type: "statusReaction", ...reaction })) : [];
  return [...pot, ...statuses];
}

// Les réactions des billes du pot (reactionsOf), `heard` les compteurs qu'elles
// peuvent écouter et leur incrément. -> leurs évènements, { type, index, marble,
// counter }.
function pocketReactionsOf(run, event, heard) {
  const entering = event.type === "pocketed" ? event.potIndex : -1;
  const reactions = [];
  run.state.pot.forEach((marble, index) => {
    if (index === entering) return;
    // Une bille du pot inconnue (piochée à l'aveugle, puis empochée) aurait pu
    // écouter : la prévision ne peut pas le dire.
    if (marble === UNKNOWN_MARBLE) {
      run.uncertain = true;
      return;
    }
    for (const [counter, count] of heard) {
      if ((reactionClauses(run.types[marble], counter)?.length ?? 0) === 0) continue;
      for (let time = 0; time < count; time++) reactions.push({ type: REACTIVE_MOMENT.event, index, marble, counter });
    }
  });
  return reactions;
}


// Applique une action sur une bille à chacune des cibles choisies, dans l'ordre des
// choix : sur le triangle, comme sur tout emplacement (actOnSlot) ; dans la main
// (Empocher), au pot. Une bille de la main se suit par son entrée (la main change
// quand l'une d'elles part au pot) ; une cible partie entre-temps : sans effet, noté.
function applyToChosen(run, operation, targets, by) {
  const held = targets.map((target) => (target.zone === "hand" ? run.state.hand[target.index] : null));
  // La défausse n'a que des ids : une bille choisie s'y suit par sa place, décalée
  // des billes choisies avant elle et déjà parties, qui la précédaient.
  const left = [];
  targets.forEach((target, order) => {
    if (target.zone === "triangle") {
      actOnSlot(run, operation.action, operation.amount, target.slot, by);
      return;
    }
    if (target.zone === "discard") {
      const index = target.index - left.filter((gone) => gone < target.index).length;
      if (run.state.discard[index] !== target.marble) {
        run.emit({ type: "targetEmpty", action: operation.action, slot: null, target: "choice", by });
        return;
      }
      // Seule une bille vraiment partie décale les suivantes.
      if (moveFromDiscard(run, index, operation.action, by)) left.push(target.index);
      return;
    }
    const index = run.state.hand.indexOf(held[order]);
    if (index < 0) {
      run.emit({ type: "targetEmpty", action: operation.action, slot: null, target: "choice", by });
      return;
    }
    moveFromHand(run, index, operation.action, by);
  });
}

// --- Le déroulé d'une action ---

// Joue un effet de bille : les compteurs du tour d'abord, ce qui va aux autres
// emplacements ensuite (un cadeau à un emplacement vide est perdu), le bonus
// reçu compté au moment de la phase de la bille. `event` : l'évènement qui le
// déclenche, d'où vient le remplacement en cours (Tic, Éjection).
function fireEffect(run, trigger, listener, clauses, event) {
  const { slot, marble } = listener;
  const situation = {
    triangle: run.state.triangle,
    holder: { marble, zone: listener.zone, turnsInHand: listener.turnsInHand ?? 0 },
    replacement: event.replacement ?? null,
    tally: run.state.tally,
    state: run.state,
    statuses: run.statuses,
  };
  // Les cibles relatives, depuis l'emplacement d'où la bille agit (resolveClauses).
  const { self, gifts: printedGifts, operations: printedOperations } = evaluateEffect(resolveClauses(clauses, slot ?? null), situation, run.types);
  // L'effet, tel que le portent ses suites ; celui d'un statut le nomme.
  const by = { trigger, slot: slot ?? null, marble, ...(listener.status === undefined ? {} : { status: listener.status }) };
  // Un bonus au choix : le joueur choisit d'abord ses billes, puis chacune le reçoit.
  const gifts = printedGifts.flatMap(({ choice, action, amount, ...gift }) =>
    choice === undefined ? [gift] : chooseTargets(run, { action, amount, target: choice }, by).map((target) => ({ ...gift, slot: target.slot }))
  );
  const bonus = trigger === "phase" ? run.state.triangle[slot].bonus : undefined;
  const applied = bonus ? addValues(self, bonus) : self;
  // LES STATUTS : la Vitesse puis la Masse que l'effet applique (bonus reçu compris)
  // passent par leurs modificateurs (marbles/core/statuses.js/modifyStat), les
  // charges se consommant à mesure ; l'effet porte les valeurs finales, ce qu'ont
  // fait les statuts se dit après lui (noteModification).
  // La source de ces valeurs : la bille qui joue l'effet (aucune pour un statut).
  const source = sourceOf(run, listener.status === undefined ? marble : null);
  const speedChange = intercept(run, modifyStat, "speed", applied.speed, source);
  const massChange = intercept(run, modifyStat, "mass", applied.mass, source);
  const speedDelta = speedChange.value;
  const massDelta = massChange.value;
  const { drawChange, amountChanges, operations } = interceptQuantities(run, self.draw, printedOperations, source);

  // Un bonus ne vaut que si la phase de sa cible peut encore avoir lieu ce tour :
  // sinon (emplacement vide, phase déjà passée ou en cours), il est perdu, et
  // l'évènement le note dans `lost`, { slot, reason, ...valeurs }.
  let { triangle } = run.state;
  const given = [];
  const lost = [];
  for (const { slot: target, ...gift } of gifts) {
    const placed = triangle[target];
    if (placed === null || run.phasesStarted.has(target)) {
      lost.push({ slot: target, reason: placed === null ? "emptySlot" : "phasePassed", ...gift });
      continue;
    }
    triangle = { ...triangle, [target]: { ...placed, bonus: placed.bonus ? addValues(placed.bonus, gift) : gift } };
    given.push({ slot: target, marble: placed.marble, ...gift });
  }

  const speed = run.state.speed + speedDelta;
  const mass = run.state.mass + massDelta;
  run.update({ triangle, speed, mass });
  // La Pioche : l'effet s'annonce, puis ses billes se piochent (drawMarbles), à
  // tout moment du tour. Une bille du pot porte sa place d'arrivée (`potIndex`).
  const draw = drawChange.value;
  const place = listener.zone === "pot" ? { potIndex: listener.index } : {};
  // L'Éjection provoquée par l'action Éjecter, et non par une pose : elle le porte.
  const provoked = event.type === "knockout" && event.by !== undefined ? { ejectedBy: event.by } : {};
  const ofStatus = listener.status === undefined ? {} : { status: listener.status };
  // Une clause sans référence ne se dit pas parmi ce que l'effet produit : elle se
  // note à sa place, sans effet (applyOperation).
  const said = operations.filter((operation) => operation.target !== NO_REFERENCE);
  run.emit({ type: "effect", trigger, slot, marble, speedDelta, massDelta, draw, operations: said, given, lost, speed, mass, ...place, ...provoked, ...ofStatus });
  for (const change of [speedChange, massChange, drawChange, ...amountChanges]) noteModification(run, change, by);
  if (draw > 0) drawMarbles(run, draw, "effect");
  // Les actions sur une bille, après la pioche, dans l'ordre des clauses.
  for (const operation of operations) applyOperation(run, operation, listener, by, situation.replacement);
}

// Les QUANTITÉS d'un effet passées par les statuts, dans l'ordre des clauses : le total
// de ses Pioches (effectDraw), puis le montant de chaque action sur une bille qui a son
// point (Polissage, Fêlure), une fois par clause, pour toutes ses cibles ; une clause
// sans référence n'a rien à modifier. Une quantité ramenée à 0 : l'action ne se joue
// pas. -> { drawChange, amountChanges, operations } : `operations`, celles qui se
// jouent, avec leurs quantités finales.
function interceptQuantities(run, draw, printedOperations, source) {
  const drawChange = intercept(run, modifyActionAmount, "draw", draw, source);
  const amountChanges = [];
  const operations = [];
  for (const operation of printedOperations) {
    if (operation.amount === undefined || operation.target === NO_REFERENCE || CLAUSE_ACTIONS[operation.action].kind !== "marble") {
      operations.push(operation);
      continue;
    }
    const change = intercept(run, modifyActionAmount, operation.action, operation.amount, source);
    amountChanges.push(change);
    if (change.value > 0) operations.push({ ...operation, amount: change.value });
  }
  return { drawChange, amountChanges, operations };
}

// --- Les statuts ---

// APPLIQUER UN STATUT (marbles/core/statuses.js/applyStatus) à la partie : une
// instance neuve, ou la fusion avec celle qui est là, dite par son évènement, avec
// l'effet qui la donne (son origine).
function gainStatus(run, { status, amount, duration, stacking }, by) {
  const { instances, outcome, instance } = applyStatus(run.state.statuses, run.statuses, status, { intensity: amount, count: duration.count }, by);
  run.update({ statuses: instances });
  // Déjà là sans effet : un statut unique, ou une règle (verrouillée, `locked`).
  if (outcome === "unchanged" || outcome === "locked") {
    run.emit({ type: "statusUnchanged", status, by, ...(outcome === "locked" ? { locked: true } : {}) });
    return;
  }
  // La sorte de durée et le cumul (l'application, statusApplication), pour dire ce qui reste.
  const { intensity, remaining, pending } = instance;
  run.emit({ type: outcome === "gained" ? "statusGained" : "statusStrengthened", status, intensity, remaining, pending, kind: duration.kind, stacking, by });
}

// UNE VALEUR PASSÉE PAR LES STATUTS, la seule façon de le faire : `modify`, une
// modification de marbles/core/statuses.js (modifyStat, modifyQuantity,
// modifyActionAmount), sur les statuts de la partie, puis les charges des statuts qui
// l'ont VRAIMENT changée, consommées aussitôt dans l'état (une charge ne sert qu'une
// fois, même à la Masse du même effet). -> le changement, avec `used` et `expired`, que
// noteModification dira APRÈS l'évènement qui porte la valeur finale.
export function intercept(run, modify, ...args) {
  return consumeCharges(run, modify(run.state.statuses, run.statuses, ...args));
}

// LA SOURCE d'une valeur (marbles/core/statuses.js, en-tête) : la bille `marble`, avec
// le test de ses filtres sur la table des billes ; null, ou une bille inconnue (piochée
// à l'aveugle), aucune source.
export function sourceOf(run, marble) {
  if (marble === null || marble === undefined || !Object.hasOwn(run.types, marble)) return NO_SOURCE;
  return { marble, matches: (filters) => passesFilters(marble, filters, run.types) };
}

// Les charges d'un changement (intercept).
function consumeCharges(run, change) {
  if (change.changed.length === 0) return { ...change, used: [], expired: [] };
  const { instances, used, expired } = useCharges(run.state.statuses, run.statuses, change.changed);
  run.update({ statuses: instances });
  return { ...change, used, expired };
}

// Ce que les statuts ont changé à une valeur (consumeCharges), dit APRÈS l'évènement
// qui porte la valeur finale (l'effet, l'Impact) : la modification, pas à pas
// (silencieuse, pour l'historique), puis chaque charge consommée et chaque fin, à
// leur place chronologique. `by` : l'effet, ou null pour l'Impact.
export function noteModification(run, change, by) {
  if (change.contributions.length === 0) return;
  run.emit({ type: "valueModified", point: change.point, before: change.before, after: change.value, contributions: change.contributions, ...(by === null ? {} : { by }) });
  for (const { status, remaining } of change.used) run.emit({ type: "statusCharge", status, remaining });
  for (const status of change.expired) run.emit({ type: "statusExpired", status });
}

// --- Les actions sur une bille ---

// Une action sur une bille (CLAUSE_ACTIONS de kind "marble" : Polissage, Fêlure,
// Empocher, Défausser, Rebond, Ramasser, Éjecter) appliquée à sa cible (marbles/core/effects.js,
// en-tête) : le seul aiguillage par forme de cible. `holder` : la bille qui joue
// l'effet (un écouteur, sa zone : marbles/core/effects.js/HOLDER_ZONES) ; `by` :
// l'effet, que portent les évènements produits.
//   au choix : les cibles choisies d'abord, puis chacune (applyToChosen) ;
//   aucune : la bille elle-même, là où elle est (actOnSelf) ;
//   FIRST_IN_HAND (Empocher, Défausser) : la première bille de la main, s'il y en a
//   une ;
//   « toutes » (Éjecter, Défausser) : les billes actives filtrées (actOnAll) ;
//   le sac (Défausser) : les N prochaines billes du sac (moveFromBag) ;
//   LAST_DISCARDED (Ramasser) : la dernière bille arrivée à la défausse ;
//   KNOCKED_OUT (Empocher, Rebond, dans un Tic) : la bille éjectée de `replacement`,
//   le remplacement en cours, en partance : redirigée (marbles/core/path.js/redirect) ;
//   un emplacement : sa bille (actOnSlot).
// Sans bille à prendre : sans effet, noté au journal (targetEmpty).
function applyOperation(run, operation, holder, by, replacement = null) {
  const { action, amount, target } = operation;
  // Une cible relative sans emplacement de référence (une Chute depuis la main) : sans
  // effet, noté au journal, à sa place parmi les clauses.
  if (target === NO_REFERENCE) run.emit({ type: "targetEmpty", action, slot: null, target: NO_REFERENCE, by });
  else if (CLAUSE_ACTIONS[action].kind === "status") gainStatus(run, operation, by);
  else if (isChoice(target)) applyToChosen(run, operation, chooseTargets(run, operation, by), by);
  else if (target === undefined) actOnSelf(run, action, amount, holder, by);
  else if (target === FIRST_IN_HAND) {
    if (run.state.hand.length === 0) run.emit({ type: "targetEmpty", action, slot: null, target, by });
    else moveFromHand(run, 0, action, by);
  } else if (target === KNOCKED_OUT) {
    // Toujours en partance pendant le Tic ; introuvable (aucun remplacement), noté.
    const ejected = replacement?.ejected;
    if (ejected === undefined || !redirect(run, ejected, CLAUSE_ACTIONS[action].moves, action, by)) run.emit({ type: "targetEmpty", action, slot: null, target, by });
  } else if (target === LAST_DISCARDED) {
    if (run.state.discard.length === 0) run.emit({ type: "targetEmpty", action, slot: null, target, by });
    else moveFromDiscard(run, run.state.discard.length - 1, action, by);
  } else if (isAll(target)) actOnAll(run, action, amount, target, by);
  else if (isBag(target)) moveFromBag(run, target.count, action, by);
  else actOnSlot(run, action, amount, target, by);
}

// Une action sur la bille de `slot`, selon sa nature : le seul aiguillage par nature
// d'action. Une action qui DÉPLACE (`moves` : Empocher vers le pot, Défausser vers la
// défausse, Rebond vers la main) la fait voyager, Éjecter la chasse, Polissage et Fêlure changent son
// usure. Emplacement vide : chacune le note.
function actOnSlot(run, action, amount, slot, by) {
  const rule = CLAUSE_ACTIONS[action];
  if (rule.moves !== undefined) moveFromSlot(run, slot, action, by);
  else if (rule.ejects) ejectFromSlot(run, slot, by);
  else wearOnSlot(run, action, amount, slot, by);
}

// LA BILLE ELLE-MÊME, là où elle est (`holder.zone` ; la validation refuse les zones
// où l'action ne la prend pas, CLAUSE_ACTIONS/selfZones) :
//   sur le triangle : une action sur l'usure vise son emplacement (vide, c'est lui
//   qui est noté) ; Empocher et Éjecter, la bille, si elle y est encore ;
//   en main (Empocher, à son Éveil) : une entrée à 0 tour en main, toutes
//   identiques ;
//   EN PARTANCE (son Final, son Éjection) : son départ est acquis, l'action
//   REDIRIGE sa destination (Empocher : le pot), voir travel ;
//   à la défausse (Empocher, à sa Chute) : la dernière arrivée de ce nom, elle-même.
// Sans bille à prendre : sans effet, noté (targetEmpty, `target` "self").
function actOnSelf(run, action, amount, holder, by) {
  if (holder.zone === "triangle") {
    if (CLAUSE_ACTIONS[action].wear !== undefined || run.state.triangle[holder.slot]?.marble === holder.marble) {
      actOnSlot(run, action, amount, holder.slot, by);
      return;
    }
  } else if (holder.zone === "hand") {
    const index = run.state.hand.findLastIndex((held) => held.marble === holder.marble && held.turnsInHand === 0);
    if (index >= 0) {
      moveFromHand(run, index, action, by);
      return;
    }
  } else if (holder.zone === "leaving") {
    if (redirect(run, holder.marble, CLAUSE_ACTIONS[action].moves, action, by)) return;
  } else if (holder.zone === "discard") {
    const index = run.state.discard.lastIndexOf(holder.marble);
    if (index >= 0) {
      moveBy(run, holder.marble, { zone: "discard", index }, action, by);
      return;
    }
  }
  run.emit({ type: "targetEmpty", action, slot: null, target: "self", marble: holder.marble, by });
}

// « Toutes les billes actives » (Éjecter), filtrées : relevées au déclenchement, dans
// l'ordre horaire ; une bille partie entre-temps (chassée par l'Éjection d'une
// précédente) n'est plus visée. Aucune : sans effet, noté.
function actOnAll(run, action, amount, target, by) {
  const aimed = SLOTS.filter((slot) => run.state.triangle[slot] !== null && passesFilters(run.state.triangle[slot].marble, target.filters, run.types)).map((slot) => ({
    slot,
    marble: run.state.triangle[slot].marble,
  }));
  if (aimed.length === 0) {
    run.emit({ type: "targetEmpty", action, slot: null, target: "all", by });
    return;
  }
  for (const { slot, marble } of aimed) {
    if (run.state.triangle[slot]?.marble === marble) actOnSlot(run, action, amount, slot, by);
  }
}

// Une action sur l'usure (Polissage, Fêlure : CLAUSE_ACTIONS), appliquée à la bille
// de `slot`. Emplacement vide : sans effet, noté au journal (avec `by`, l'effet qui
// la produit). Une Fêlure qui amène la bille à son maximum la retire aussitôt
// (retireMarble) : en résolution, une phase qui n'avait pas eu lieu est alors
// sautée ; en phase de jeu, l'emplacement vide peut recevoir une pose, sans Tic.
function wearOnSlot(run, action, amount, slot, by) {
  const placed = run.state.triangle[slot];
  if (placed === null) {
    run.emit({ type: "targetEmpty", action, slot, by });
    return;
  }
  const rule = CLAUSE_ACTIONS[action];
  const maxWear = maxWearOf(placed.marble, run.types);
  const wear = rule.wear(placed.wear, amount, maxWear);
  run.update({ triangle: { ...run.state.triangle, [slot]: { ...placed, wear } } });
  // `retires` : la Fêlure l'amène à son maximum, elle part aussitôt (la vue l'entend
  // sans refaire la règle).
  const retires = rule.retires && wear >= maxWear;
  run.emit({ type: rule.event, slot, marble: placed.marble, amount, applied: Math.abs(wear - placed.wear), wear, maxWear, retires });
  if (retires) retireMarble(run, slot);
}

// Le traitement d'un évènement par le bus (il est déjà au journal) : les effets des
// billes concernées, puis
// les réactions du pot et des statuts (reactionsOf, relevées à son émission),
// émises dans la file : pas de récursion.
function handleEvent(run, event) {
  const trigger = EVENT_TRIGGERS[event.type];
  const silenced = trigger?.lock !== undefined && isLocked(run.state.statuses, run.statuses, trigger.lock.lock, trigger.lock.trigger ?? null);
  const listeners = !trigger || silenced ? [] : trigger.listeners ? trigger.listeners(event) : marbleListeners(run.state);
  for (const listener of listeners) {
    // Une bille inconnue (piochée à l'aveugle) que ce déclencheur pourrait
    // concerner : sa réaction dépend de son identité, la prévision ne peut pas la
    // dire et se déclare incertaine. Elle ne réagit pas.
    if (listener.zone !== HOLDER_ZONES.status.zone && listener.marble === UNKNOWN_MARBLE) {
      if (trigger.zones.includes(listener.zone)) run.uncertain = true;
      continue;
    }
    const clauses = trigger.clauses(event, listener, run.types, run.statuses);
    if (clauses !== null) fireEffect(run, trigger.id, listener, clauses, event);
  }
  releaseReactions(run, event, run.emit);
}

// Les réactions relevées pour `event`, réglées tout de suite, chacune jusqu'au
// bout (des interruptions) : celles d'un évènement qui ne passe pas par la file (le
// mélange, regenerateBag).
function settleReactions(run, event) {
  releaseReactions(run, event, run.settle);
}

// LE seul point où partent les réactions relevées pour `event` (reactionsOf) : jouées
// par `play` (run.emit, dans la file ; run.settle, en interruption), ou, pendant une
// RETENUE (holdReactions), mises de côté, celles du pot d'un côté, celles des
// statuts de l'autre, chacune à sa place.
function releaseReactions(run, event, play) {
  const reactions = run.reactions.get(event);
  if (reactions === undefined) return;
  run.reactions.delete(event);
  if (run.held !== null) {
    for (const reaction of reactions) (reaction.type === "statusReaction" ? run.held.statuses : run.held.pot).push(reaction);
    return;
  }
  for (const reaction of reactions) play(reaction);
}

// LA RETENUE DES RÉACTIONS : pendant `body`, les réactions du pot et des statuts sont
// relevées et comptées comme d'habitude, mais ne jouent pas ; le déroulé les rend,
// dans l'ordre où elles sont survenues, à qui les jouera à sa place. Sert aux trois
// phases de la résolution : le triangle d'abord, en entier, puis le pot
// (marbles/core/marbles.js/resolvePot), puis les statuts. -> { pot, statuses } : les
// évènements des réactions retenues, pocketReaction et statusReaction.
export function holdReactions(run, body) {
  const held = { pot: [], statuses: [] };
  run.held = held;
  try {
    body();
  } finally {
    run.held = null;
  }
  return held;
}

// Déroule une action sur un état de travail, avec son bus et son journal. Une
// boucle d'évènements est arrêtée par la limite du bus : cette chaîne-là est coupée,
// le journal le note (chainInterrupted), et l'action reprend normalement ensuite
// (la résolution joue ses phases suivantes, ses retraits, son Impact). `options` : { eventLimit, blind, answers,
// seen, statuses } (voir marblesReduce) ; `answers` : les réponses aux choix à rejouer ;
// `seen` : les évènements déjà rendus (un rejeu ne rend que les suivants). `action` :
// l'action déroulée, gardée pour la reprise. Un choix sans réponse SUSPEND l'action :
// le résultat porte l'état du déroulé à cet instant, avec son `pendingChoice` (en-tête
// de marbles/core/marbles.js),
// et les évènements jusque-là. À l'aveugle, le résultat porte aussi `uncertain` (une
// bille inconnue aurait pu réagir : handleEvent, reactionsOf) et
// `choiceDependent` (un choix est resté indécis).
export function transact(state, types, { eventLimit, blind = false, answers = [], seen = 0, statuses = NO_STATUSES } = {}, body, action) {
  // `phasesStarted` : les emplacements dont la phase a commencé (ou a été sautée)
  // pendant cette action ; un bonus qui les vise est perdu (fireEffect). `reactions` :
  // par évènement émis, les réactions du pot à émettre après son traitement.
  const run = {
    state,
    types,
    // La table des statuts (marbles/core/statuses.js), celle des règles.
    statuses,
    blind,
    uncertain: false,
    choiceDependent: false,
    phasesStarted: new Set(),
    journal: [],
    reactions: new Map(),
    // Les réactions retenues (holdReactions), ou null hors d'une retenue.
    held: null,
    answers,
    answerIndex: 0,
    // Les billes EN TRANSIT : sorties d'une zone, pas encore arrivées dans la
    // suivante ({ kind, marble, slot, ... }). Dans aucune zone, donc jamais une
    // cible ni un écouteur ; un choix qui s'ouvre pendant leur trajet les emporte,
    // pour information (pendingChoice.inTransit). Deux natures : "thrown", en cours
    // de lancer (marbles/core/marbles.js/placeMarble), vers l'emplacement `slot` ;
    // "leaving", en partance (travel), depuis l'emplacement `slot` ou null.
    inTransit: [],
  };
  const bus = createEventBus((event) => handleEvent(run, event), eventLimit, () => record({ type: "chainInterrupted" }));
  // Le journal s'écrit À L'ÉMISSION, dans l'ordre où l'état change : la file du bus
  // étant premier entré, premier sorti, c'est aussi l'ordre de traitement, sauf
  // pour une interruption (settle), réglée avant ce qui attendait, mais émise après.
  // Les valeurs de partie aussi : un évènement compte dès qu'il est émis, avant que
  // les billes n'y réagissent (marbles/core/tally.js).
  // Les réactions du pot s'y relèvent aussi, sur l'incrément des compteurs.
  function record(event) {
    const before = run.state.tally;
    run.update({ tally: recordTally(before, event, { state: run.state, types, statuses: run.statuses }, TALLY_COUNTERS) });
    run.journal.push(event);
    const reactions = reactionsOf(run, event, before);
    if (reactions.length > 0) run.reactions.set(event, reactions);
  }
  // L'état de travail change par là, et par là seulement.
  run.update = (changes) => {
    run.state = { ...run.state, ...changes };
  };
  run.emit = (event) => {
    record(event);
    bus.emit(event);
  };
  run.settle = (event) => {
    record(event);
    bus.settle(event);
  };
  // Au journal et aux valeurs de partie, sans passer par la file : un évènement dont
  // les suites se règlent à la main (le mélange, regenerateBag).
  run.record = record;
  // Les réactions relevées pour un évènement inscrit par run.record, réglées tout de
  // suite (marbles/core/path.js : le départ d'une bille, après sa sortie).
  run.settleReactions = (event) => settleReactions(run, event);
  try {
    body(run);
  } catch (error) {
    if (!(error instanceof ChoiceSuspension)) throw error;
    const resume = { from: state, action, answers, seen: run.journal.length, ...(eventLimit === undefined ? {} : { eventLimit }) };
    const inTransit = run.inTransit.map(({ kind, marble, slot }) => ({ kind, marble, slot }));
    const pendingChoice = { ...error.request, inTransit, resume };
    return { ok: true, state: { ...run.state, pendingChoice }, events: run.journal.slice(seen), error: null };
  }
  const result = { ok: true, state: run.state, events: run.journal.slice(seen), error: null };
  return blind ? { ...result, uncertain: run.uncertain, choiceDependent: run.choiceDependent } : result;
}


// --- Actions ---

// La défausse devient le sac : mélangée par le hasard de la partie, ou, à
// l'aveugle, sans mélange ni hasard, ses billes devenant inconnues (la prévision
// annonce la régénération sans rien en révéler). Puis la TROUVAILLE de chaque bille
// active, dans l'ordre horaire : une INTERRUPTION (run.settle), réglée jusqu'au
// bout, ce qu'elle déclenche compris (Pioche, Fêlure et Final), avant la bille
// suivante et avant que la pioche interrompue ne reprenne. L'emplacement se relit
// à chaque bille : une bille retirée par une Trouvaille précédente n'a pas la
// sienne. Une bille en main, au sac, en défausse ou en cours de lancer n'en a pas.
// Puis, comme elles, les RÉACTIONS DU POT au mélange (En poche, à chaque mélange),
// des interruptions aussi, juste après les Trouvailles : la bille concernée joue
// d'abord son effet (les billes actives, leur Trouvaille), puis le pot réagit, avant
// que la pioche ne reprenne. Le mélange entre donc au journal sans passer par la file
// (run.record) : rien n'y réagit d'autre, et ses réactions se règlent ici.
function regenerateBag(run) {
  const { discard } = run.state;
  if (run.blind) {
    run.update({ bag: discard.map(() => UNKNOWN_MARBLE), discard: [] });
  } else {
    const shuffle = shuffled(discard, run.state.rngState);
    run.update({ rngState: shuffle.rngState, bag: shuffle.list, discard: [] });
  }
  const regenerated = { type: "bagRegenerated", size: run.state.bag.length };
  run.record(regenerated);
  for (const slot of SLOTS) {
    const placed = run.state.triangle[slot];
    if (placed !== null) run.settle({ type: "windfall", slot, marble: placed.marble });
  }
  settleReactions(run, regenerated);
}

// LA pioche d'une bille, la seule : celle du début de tour comme celle d'un effet,
// à tout moment du tour. Dans l'ordre :
//   1. main pleine : la bille reste au sac, sans régénération ;
//   2. sinon, le sac a une bille : on la pioche ;
//   3. sinon, la défausse n'est pas vide : elle devient le sac, puis on pioche ;
//   4. sinon (sac et défausse vides) : rien à piocher.
// À l'aveugle, la bille piochée est inconnue. -> "drawn", ou ce qui arrête la
// pioche : "handFull", "noMarbles". La fin de partie n'est pas son affaire.
// Après une régénération, la pioche reprend en relisant ses conditions : les
// Trouvailles ont pu remplir la main, vider le sac ou remplir la défausse.
// `cause` : ce qui fait piocher, "turn" ou "effect", porté par l'évènement `draw`.
function drawOne(run, cause) {
  if (handRoom(run) <= 0) return "handFull";
  if (run.state.bag.length === 0) {
    if (run.state.discard.length === 0) return "noMarbles";
    regenerateBag(run);
    return drawOne(run, cause);
  }
  const [top, ...bag] = run.state.bag;
  const marble = run.blind ? UNKNOWN_MARBLE : top;
  run.update({ bag, hand: [...run.state.hand, { marble, turnsInHand: 0 }] });
  // La pioche entre au journal sans passer par la file (rien n'y réagit d'autre) ;
  // l'ÉVEIL de la bille piochée, une interruption (run.settle), se règle jusqu'au bout,
  // ce qu'il déclenche compris, puis les réactions à la pioche (le pot, les statuts),
  // avant que la pioche ne passe à la bille suivante. Le même ordre partout : la
  // pioche du tour comme celle d'un effet.
  const drawn = { type: "draw", marble, cause };
  run.record(drawn);
  run.settle({ type: "awaken", marble });
  settleReactions(run, drawn);
  return "drawn";
}

// Pioche `count` billes une par une, jusqu'au premier arrêt, qui se dit
// (drawSkipped) : les billes restantes ne sont pas piochées. -> { drawn, stopped },
// `stopped` null si tout a été pioché.
export function drawMarbles(run, count, cause) {
  for (let drawn = 0; drawn < count; drawn++) {
    const outcome = drawOne(run, cause);
    if (outcome !== "drawn") {
      run.emit({ type: "drawSkipped", reason: outcome });
      return { drawn, stopped: outcome };
    }
  }
  return { drawn: count, stopped: null };
}

