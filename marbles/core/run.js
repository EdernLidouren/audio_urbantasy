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
// toujours dans cet ordre : base gauche, base droite, pointe, puis la main de
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
  CHOICE_ZONES,
  CLAUSE_ACTIONS,
  FIRST_IN_HAND,
  HOLDER_ZONES,
  SLOTS,
  addValues,
  effectAt,
  evaluateEffect,
  isAll,
  isChoice,
  passesFilters,
} from "./effects.js";
import { recordTally } from "./tally.js";
import { REACTION_KEYS, REACTIVE_MOMENT, TALLY_COUNTERS, maxWearOf, pocketClauses, reactionClauses } from "./content.js";

// Une bille dont l'identité est cachée : au sac ou en défausse dans la copie de la
// prévision, ou piochée à l'aveugle (drawOne). Jamais dans une vraie partie.
export const UNKNOWN_MARBLE = null;

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

// Les billes qui écoutent le bus, dans leur ordre fixe : base gauche, base
// droite, pointe, puis la main de la première à la dernière. Une liste relue à
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
//   clauses(event, listener, types).
// La phase est écrite ici ; les autres viennent de MARBLE_TRIGGERS.
const ON_SLOT = ["triangle"];

// La bille que nomme l'évènement, hors du triangle, par valeur `marble` du
// déclencheur ; sa zone est celle de marbles/core/effects.js/HOLDER_ZONES.
const NAMED_MARBLE = {
  // En main, sans emplacement : seul Empocher l'y prend (HOLDER_ZONES, selfZones).
  drawn: (event) => ({ slot: null, marble: event.marble, turnsInHand: 0 }),
  removed: (event) => ({ slot: event.slot, marble: event.marble }),
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
  if (Object.hasOwn(NAMED_MARBLE, trigger.marble)) {
    return {
      id: trigger.id,
      zones: [],
      listeners: (event) => [{ zone: HOLDER_ZONES[trigger.marble].zone, ...NAMED_MARBLE[trigger.marble](event) }],
      clauses: (event, listener, types) => clausesOf(listener, types),
    };
  }
  return {
    id: trigger.id,
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
        listeners: (event) => [{ zone: HOLDER_ZONES.pot.zone, slot: null, index: potPlaceOf(event), marble: event.marble }],
        clauses: (event, listener, types) =>
          moment.reactive ? reactionClauses(types[listener.marble], event.counter) : pocketClauses(types[listener.marble], moment),
      },
    ])
  ),
};

// LES RÉACTIONS d'un évènement qui vient d'être compté (En poche, à chaque
// (occurrence)) : pour chaque compteur écoutable qu'il a augmenté, chaque bille du
// pot qui l'écoute, dans l'ordre d'arrivée, une fois par incrément. `before` : le
// registre d'avant l'évènement (la portée « cette partie », qui ne revient jamais à
// zéro, donne l'incrément). Lu à l'émission, sur le pot de ce moment : une bille
// entrée plus tard ne réagit pas à ce qui l'a précédée, et celle qui entre au pot par
// cet évènement (`pocketed`, la dernière arrivée) ne réagit pas à sa propre mise en
// poche (elle a pour cela son moment « à l'entrée »). Les réactions sont émises après
// le traitement de l'évènement (handleEvent) : la bille concernée joue d'abord son
// propre effet. -> [{ index, marble, counter }].
function pocketReactionsOf(run, event, before) {
  if (REACTION_KEYS.length === 0 || run.state.pot.length === 0) return [];
  const after = run.state.tally;
  const heard = REACTION_KEYS.map((id) => [id, after[id].game - before[id].game]).filter(([, count]) => count > 0);
  if (heard.length === 0) return [];
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
      for (let time = 0; time < count; time++) reactions.push({ index, marble, counter });
    }
  });
  return reactions;
}

// --- Les cibles au choix ---

// Les cibles d'une zone de choix disponible (marbles/core/effects.js/CHOICE_ZONES),
// valides à cet instant : (run, pick, bonus) -> [cible]. `bonus` : l'action est un
// bonus de Vitesse ou de Masse, qui ne vaut que pour une phase encore à venir (règle
// des cibles) : un emplacement dont la phase a commencé n'est pas éligible. Un
// emplacement dont l'Éjection est en cours (`run.knockingOut`) ne l'est jamais : sa
// bille part, une action sur elle ne ferait rien et un bonus s'y perdrait.
const CHOICE_TARGETS = {
  hand: (run) => run.state.hand.map(({ marble }, index) => ({ zone: "hand", index, marble })),
  triangle: (run, pick, bonus) =>
    SLOTS.filter(
      (slot) => (pick === "slot" || run.state.triangle[slot] !== null) && !(bonus && run.phasesStarted.has(slot)) && !run.knockingOut.has(slot)
    ).map((slot) => ({
      zone: "triangle",
      slot,
      marble: run.state.triangle[slot]?.marble ?? null,
    })),
};
for (const [zone, { available }] of Object.entries(CHOICE_ZONES)) {
  if (available && !Object.hasOwn(CHOICE_TARGETS, zone)) throw new Error(`marbles : la zone de choix "${zone}" n'a pas ses cibles (CHOICE_TARGETS).`);
}

// Deux cibles désignent-elles la même chose ?
function sameTarget(a, b) {
  return a.zone === b.zone && (a.zone === "hand" ? a.index === b.index : a.slot === b.slot);
}

// La forme publique d'une cible, celle de l'action « choisir ».
export function targetRef(target) {
  return target.zone === "hand" ? { zone: "hand", index: target.index } : { zone: "triangle", slot: target.slot };
}

// La réponse que porte une action « choisir » au choix en attente `pending` (déjà
// permise, chooseRefusal), telle que le rejeu la consomme : Terminer, ou la cible
// éligible qu'elle désigne, AVEC SA BILLE. La bille sert au rejeu à l'aveugle (la
// prévision d'une réponse) : son chemin peut diverger du vrai, et la même place y
// désigner une autre bille (chooseTargets, isOtherMarble).
export function answerOf(pending, action) {
  if (action.done === true) return { done: true };
  const target = pending.eligible.find((eligible) => sameTarget(eligible, action.target));
  return { target: { ...targetRef(target), marble: target.marble } };
}

// La cible rejouée désigne-t-elle une AUTRE bille que celle de la réponse ? Seulement
// quand les deux sont connues : une bille piochée à l'aveugle (UNKNOWN_MARBLE) peut
// être celle-là, rien ne permet de le dire.
function isOtherMarble(target, answered) {
  return target.marble !== UNKNOWN_MARBLE && answered.marble !== UNKNOWN_MARBLE && target.marble !== answered.marble;
}

// Cette réponse au choix en attente est-elle permise ? Le code du refus, ou null.
// Exportée pour l'interface et la prévision, qui suivent la même règle.
export function chooseRefusal(state, action) {
  const pending = state.pendingChoice;
  if (!pending) return "noChoicePending";
  if (action.done === true) return pending.upTo ? null : "choiceRequired";
  const target = action.target;
  if (target === null || typeof target !== "object" || !pending.eligible.some((eligible) => sameTarget(eligible, target))) return "invalidChoice";
  return null;
}

// Un choix que le joueur doit trancher : le déroulé s'arrête là (transact).
class ChoiceSuspension {
  constructor(request) {
    this.request = request;
  }
}

// Fait choisir les cibles d'une clause au choix (marbles/core/effects.js, en-tête),
// une par une : une cible déjà choisie n'est plus éligible ; la sélection s'arrête à
// N choix, quand plus rien n'est éligible, ou sur Terminer (« jusqu'à N »). Aucune
// cible éligible dès le départ : rien ne s'ouvre, `targetEmpty` le note. Les réponses
// viennent du rejeu (run.answers) ; quand il n'y en a plus, le déroulé se SUSPEND
// (ChoiceSuspension), sauf à l'aveugle, où le choix reste indécis
// (`choiceUndecided`) et rien n'est choisi. -> les cibles, dans l'ordre des choix.
function chooseTargets(run, clause, by) {
  const { zones, pick, count, upTo = false } = clause.target;
  const bonus = CLAUSE_ACTIONS[clause.action].kind === "value";
  const chosen = [];
  const eligibleNow = () =>
    zones.flatMap((zone) => CHOICE_TARGETS[zone](run, pick, bonus)).filter((target) => !chosen.some((done) => sameTarget(done, target)));
  if (eligibleNow().length === 0) {
    run.emit({ type: "targetEmpty", action: clause.action, slot: null, target: "choice", by });
    return [];
  }
  const request = { action: clause.action, ...(clause.amount === undefined ? {} : { amount: clause.amount }), zones, pick, count, upTo, by };
  run.emit({ type: "choice", ...request });
  while (chosen.length < count) {
    const eligible = eligibleNow();
    if (eligible.length === 0) {
      run.emit({ type: "choiceEnded", reason: "exhausted", chosen: chosen.length, by });
      return chosen;
    }
    const answer = run.answers[run.answerIndex];
    if (answer === undefined) {
      if (!run.blind) throw new ChoiceSuspension({ ...request, eligible, chosen: [...chosen], remaining: count - chosen.length });
      run.choiceDependent = true;
      run.emit({ type: "choiceUndecided", action: clause.action, by });
      return chosen;
    }
    run.answerIndex += 1;
    if (answer.done) {
      run.emit({ type: "choiceEnded", reason: "done", chosen: chosen.length, by });
      return chosen;
    }
    const target = eligible.find((candidate) => sameTarget(candidate, answer.target));
    if (target === undefined || isOtherMarble(target, answer.target)) {
      // Un rejeu réel refait le même chemin : une réponse qui ne colle pas (place
      // absente, ou une autre bille à cette place) est une faute de programmation. À
      // l'aveugle (la prévision d'un choix), le chemin peut diverger (billes piochées
      // inconnues, et ce qu'elles auraient fait) : le choix reste indécis.
      if (!run.blind) throw new Error(`marbles : réponse rejouée hors des cibles éligibles, ${JSON.stringify(answer)}.`);
      run.choiceDependent = true;
      run.emit({ type: "choiceUndecided", action: clause.action, by });
      return chosen;
    }
    chosen.push(target);
    run.emit({ type: "chosen", ...target, by });
  }
  run.emit({ type: "choiceEnded", reason: "count", chosen: chosen.length, by });
  return chosen;
}

// Applique une action sur une bille à chacune des cibles choisies, dans l'ordre des
// choix : sur le triangle, comme sur tout emplacement (actOnSlot) ; dans la main
// (Empocher), au pot. Une bille de la main se suit par son entrée (la main change
// quand l'une d'elles part au pot) ; une cible partie entre-temps : sans effet, noté.
function applyToChosen(run, operation, targets, by) {
  const held = targets.map((target) => (target.zone === "hand" ? run.state.hand[target.index] : null));
  targets.forEach((target, order) => {
    if (target.zone === "triangle") {
      actOnSlot(run, operation.action, operation.amount, target.slot, by);
      return;
    }
    const index = run.state.hand.indexOf(held[order]);
    if (index < 0) {
      run.emit({ type: "targetEmpty", action: operation.action, slot: null, target: "choice", by });
      return;
    }
    pocketFromHand(run, index, by);
  });
}

// --- Le déroulé d'une action ---

export function update(run, changes) {
  run.state = { ...run.state, ...changes };
}

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
  };
  const { self, gifts: printedGifts, operations } = evaluateEffect(clauses, situation, run.types);
  const by = { trigger, slot: slot ?? null, marble };
  // Un bonus au choix : le joueur choisit d'abord ses billes, puis chacune le reçoit.
  const gifts = printedGifts.flatMap(({ choice, action, amount, ...gift }) =>
    choice === undefined ? [gift] : chooseTargets(run, { action, amount, target: choice }, by).map((target) => ({ ...gift, slot: target.slot }))
  );
  const bonus = trigger === "phase" ? run.state.triangle[slot].bonus : undefined;
  const { speed: speedDelta, mass: massDelta } = bonus ? addValues(self, bonus) : self;

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
  update(run, { triangle, speed, mass });
  // La Pioche : l'effet s'annonce, puis ses billes se piochent (drawMarbles), à
  // tout moment du tour. Une bille du pot porte sa place d'arrivée (`potIndex`).
  const { draw } = self;
  const place = listener.zone === "pot" ? { potIndex: listener.index } : {};
  // L'Éjection provoquée par l'action Éjecter, et non par une pose : elle le porte.
  const provoked = event.type === "knockout" && event.by !== undefined ? { ejectedBy: event.by } : {};
  run.emit({ type: "effect", trigger, slot, marble, speedDelta, massDelta, draw, operations, given, lost, speed, mass, ...place, ...provoked });
  if (draw > 0) drawMarbles(run, draw, "effect");
  // Les actions sur une bille, après la pioche, dans l'ordre des clauses.
  for (const operation of operations) applyOperation(run, operation, listener, by);
}

// --- Les actions sur une bille ---

// Une action sur une bille (CLAUSE_ACTIONS de kind "marble" : Polissage, Fêlure,
// Empocher, Éjecter) appliquée à sa cible (marbles/core/effects.js, en-tête) : le
// seul aiguillage par forme de cible. `holder` : la bille qui joue l'effet (un
// écouteur, sa zone : marbles/core/effects.js/HOLDER_ZONES) ; `by` : l'effet, que
// portent les évènements produits.
//   au choix : les cibles choisies d'abord, puis chacune (applyToChosen) ;
//   aucune : la bille elle-même, là où elle est (actOnSelf) ;
//   FIRST_IN_HAND (Empocher) : la première bille de la main, s'il y en a une ;
//   « toutes » (Éjecter) : les billes actives filtrées (actOnAll) ;
//   un emplacement : sa bille (actOnSlot).
// Sans bille à prendre : sans effet, noté au journal (targetEmpty).
function applyOperation(run, operation, holder, by) {
  const { action, amount, target } = operation;
  if (isChoice(target)) applyToChosen(run, operation, chooseTargets(run, operation, by), by);
  else if (target === undefined) actOnSelf(run, action, amount, holder, by);
  else if (target === FIRST_IN_HAND) {
    if (run.state.hand.length === 0) run.emit({ type: "targetEmpty", action, slot: null, target, by });
    else pocketFromHand(run, 0, by);
  } else if (isAll(target)) actOnAll(run, action, amount, target, by);
  else actOnSlot(run, action, amount, target, by);
}

// Une action sur la bille de `slot`, selon sa nature : le seul aiguillage par nature
// d'action. Empocher la déplace au pot, Éjecter la chasse, Polissage et Fêlure
// changent son usure. Emplacement vide : chacune le note.
function actOnSlot(run, action, amount, slot, by) {
  const rule = CLAUSE_ACTIONS[action];
  if (rule.moves === "pot") pocketFromSlot(run, slot, by);
  else if (rule.ejects) ejectFromSlot(run, slot, by);
  else wearOnSlot(run, action, amount, slot, by);
}

// LA BILLE ELLE-MÊME, là où elle est (`holder.zone` ; la validation refuse les zones
// où l'action ne la prend pas, CLAUSE_ACTIONS/selfZones) :
//   sur le triangle : une action sur l'usure vise son emplacement (vide, c'est lui
//   qui est noté) ; Empocher et Éjecter, la bille, si elle y est encore ;
//   en main (Empocher, à son Éveil) : une entrée à 0 tour en main, toutes
//   identiques ;
//   à la défausse (Empocher, à son Final) : elle y est déjà, la dernière arrivée de
//   ce nom.
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
      pocketFromHand(run, index, by);
      return;
    }
  } else if (holder.zone === "removed") {
    const index = run.state.discard.lastIndexOf(holder.marble);
    if (index >= 0) {
      update(run, { discard: run.state.discard.filter((_, other) => other !== index) });
      sendToPot(run, holder.marble, { from: "discard" }, by);
      return;
    }
  }
  run.emit({ type: "targetEmpty", action, slot: null, target: "self", marble: holder.marble, by });
}

// « Toutes les billes actives » (Éjecter), filtrées : relevées au déclenchement, dans
// l'ordre des phases ; une bille partie entre-temps (chassée par l'Éjection d'une
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

// La bille de la main à `index` quitte la main pour le pot (sendToPot).
function pocketFromHand(run, index, by) {
  const { marble } = run.state.hand[index];
  update(run, { hand: run.state.hand.filter((_, other) => other !== index) });
  sendToPot(run, marble, { from: "hand", index }, by);
}

// La bille d'un emplacement quitte le triangle pour le pot : ni usure ni éjection,
// donc ni Final ni Éjection ; une phase qui n'avait pas eu lieu est sautée (la
// résolution relit l'emplacement). Son bonus part avec elle.
function pocketFromSlot(run, slot, by) {
  const placed = run.state.triangle[slot];
  if (placed === null) {
    run.emit({ type: "targetEmpty", action: "pocket", slot, by });
    return;
  }
  update(run, { triangle: { ...run.state.triangle, [slot]: null } });
  run.emit({ type: "removed", slot, marble: placed.marble, cause: "pocket" });
  sendToPot(run, placed.marble, { from: "triangle", slot }, by);
}

// Une bille, sortie de sa zone, va au pot ; plein, elle est perdue. Elle n'y passe
// qu'une fois : sa zone d'origine l'a déjà rendue. Au pot, ses effets d'entrée se
// règlent aussitôt (une interruption : run.settle), avant la suite.
function sendToPot(run, marble, origin, by) {
  if (run.state.pot.length < run.state.potCapacity) {
    update(run, { pot: [...run.state.pot, marble] });
    run.settle({ type: "pocketed", marble, ...origin, potIndex: run.state.pot.length - 1, by });
    return;
  }
  update(run, { lost: [...run.state.lost, marble] });
  run.emit({ type: "lost", marble, ...origin, by });
}

// La bille de `slot` est CHASSÉE par l'effet `by`, dans cet ordre : `eject` ; son
// Éjection, une interruption (run.settle) réglée jusqu'au bout avant la suite, dont
// les conditions de calibre comparent la bille chassée à celle qui éjecte (le
// remplacement { placed, ejected }) ; puis elle quitte son emplacement et rejoint la
// défausse (cause "eject"). Ni Tic ni Final. Pendant la résolution, sa phase, si
// elle n'avait pas eu lieu, est sautée (la résolution relit l'emplacement). Son
// Éjection a pu la retirer déjà (une Fêlure sur elle-même) : elle ne part pas une
// seconde fois. Une bille déjà en train d'être chassée (`run.knockingOut` : son
// Éjection est en cours, et vise à son tour son emplacement) ne l'est pas deux fois :
// sans effet, noté, plutôt qu'une boucle.
function ejectFromSlot(run, slot, by) {
  const placed = run.state.triangle[slot];
  if (placed === null || run.knockingOut.has(slot)) {
    run.emit({ type: "targetEmpty", action: "eject", slot, by });
    return;
  }
  const { marble } = placed;
  run.emit({ type: "eject", slot, marble, by });
  run.knockingOut.add(slot);
  try {
    run.settle({ type: "knockout", slot, marble, replacement: { placed: by.marble, ejected: marble }, by });
  } finally {
    run.knockingOut.delete(slot);
  }
  if (run.state.triangle[slot] === null) return;
  discardFromSlot(run, slot, marble, "eject");
}

// LE départ d'une bille du triangle pour la défausse, le seul : elle quitte son
// emplacement (`removed`), puis rejoint la défausse (`discarded`), de `cause`
// "replacement" (délogée par une pose), "wear" (usée) ou "eject" (chassée par
// Éjecter). Empocher, lui, l'envoie au pot (pocketFromSlot).
export function discardFromSlot(run, slot, marble, cause) {
  const leaving = { slot, marble, cause };
  update(run, { triangle: { ...run.state.triangle, [slot]: null } });
  run.emit({ type: "removed", ...leaving });
  update(run, { discard: [...run.state.discard, marble] });
  run.emit({ type: "discarded", ...leaving });
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
  update(run, { triangle: { ...run.state.triangle, [slot]: { ...placed, wear } } });
  run.emit({ type: rule.event, slot, marble: placed.marble, amount, applied: Math.abs(wear - placed.wear), wear, maxWear });
  if (rule.retires && wear >= maxWear) retireMarble(run, slot);
}

// Le traitement d'un évènement par le bus (il est déjà au journal) : les effets des
// billes concernées, puis
// les réactions des billes du pot (pocketReactionsOf, relevées à son émission),
// émises dans la file : pas de récursion.
function handleEvent(run, event) {
  const trigger = EVENT_TRIGGERS[event.type];
  const listeners = !trigger ? [] : trigger.listeners ? trigger.listeners(event) : marbleListeners(run.state);
  for (const listener of listeners) {
    // Une bille inconnue (piochée à l'aveugle) que ce déclencheur pourrait
    // concerner : sa réaction dépend de son identité, la prévision ne peut pas la
    // dire et se déclare incertaine. Elle ne réagit pas.
    if (listener.marble === UNKNOWN_MARBLE) {
      if (trigger.zones.includes(listener.zone)) run.uncertain = true;
      continue;
    }
    const clauses = trigger.clauses(event, listener, run.types);
    if (clauses !== null) fireEffect(run, trigger.id, listener, clauses, event);
  }
  const reactions = run.reactions.get(event);
  if (reactions === undefined) return;
  run.reactions.delete(event);
  for (const reaction of reactions) run.emit({ type: REACTIVE_MOMENT.event, ...reaction });
}

// Les réactions du pot relevées pour `event`, réglées tout de suite, chacune jusqu'au
// bout (des interruptions) : celles d'un évènement qui ne passe pas par la file (le
// mélange, regenerateBag).
function settleReactions(run, event) {
  const reactions = run.reactions.get(event);
  if (reactions === undefined) return;
  run.reactions.delete(event);
  for (const reaction of reactions) run.settle({ type: REACTIVE_MOMENT.event, ...reaction });
}

// Déroule une action sur un état de travail, avec son bus et son journal. Une
// boucle d'évènements est arrêtée par la limite du bus : cette chaîne-là est coupée,
// le journal le note (chainInterrupted), et l'action reprend normalement ensuite
// (la résolution joue ses phases suivantes, ses retraits, son Impact). `options` : { eventLimit, blind, answers,
// seen } (voir marblesReduce) ; `answers` : les réponses aux choix à rejouer ;
// `seen` : les évènements déjà rendus (un rejeu ne rend que les suivants). `action` :
// l'action déroulée, gardée pour la reprise. Un choix sans réponse SUSPEND l'action :
// le résultat porte l'état du déroulé à cet instant, avec son `pendingChoice` (en-tête
// de marbles/core/marbles.js),
// et les évènements jusque-là. À l'aveugle, le résultat porte aussi `uncertain` (une
// bille inconnue aurait pu réagir : handleEvent, pocketReactionsOf) et
// `choiceDependent` (un choix est resté indécis).
export function transact(state, types, { eventLimit, blind = false, answers = [], seen = 0 } = {}, body, action) {
  // `phasesStarted` : les emplacements dont la phase a commencé (ou a été sautée)
  // pendant cette action ; un bonus qui les vise est perdu (fireEffect). `reactions` :
  // par évènement émis, les réactions du pot à émettre après son traitement.
  // `knockingOut` : les emplacements dont l'Éjection est en cours (une pose, Éjecter) :
  // Éjecter ne les vise pas une seconde fois (ejectFromSlot).
  const run = {
    state,
    types,
    blind,
    uncertain: false,
    choiceDependent: false,
    phasesStarted: new Set(),
    knockingOut: new Set(),
    journal: [],
    reactions: new Map(),
    answers,
    answerIndex: 0,
    // Les billes EN TRANSIT : sorties d'une zone, pas encore arrivées dans la
    // suivante ({ kind, marble, slot }). Dans aucune zone, donc jamais une cible ni
    // un écouteur ; un choix qui s'ouvre pendant leur trajet les emporte, pour
    // information (pendingChoice.inTransit). Seule nature aujourd'hui : "thrown",
    // en cours de lancer (marbles/core/marbles.js/placeMarble).
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
    update(run, { tally: recordTally(before, event, { state: run.state, types }, TALLY_COUNTERS) });
    run.journal.push(event);
    const reactions = pocketReactionsOf(run, event, before);
    if (reactions.length > 0) run.reactions.set(event, reactions);
  }
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
  try {
    body(run);
  } catch (error) {
    if (!(error instanceof ChoiceSuspension)) throw error;
    const resume = { from: state, action, answers, seen: run.journal.length, ...(eventLimit === undefined ? {} : { eventLimit }) };
    const pendingChoice = { ...error.request, inTransit: run.inTransit, resume };
    return { ok: true, state: { ...run.state, pendingChoice }, events: run.journal.slice(seen), error: null };
  }
  const result = { ok: true, state: run.state, events: run.journal.slice(seen), error: null };
  return blind ? { ...result, uncertain: run.uncertain, choiceDependent: run.choiceDependent } : result;
}

// Une copie À L'AVEUGLE d'un état, celle de la prévision : le sac et la défausse
// n'y gardent que leur nombre de billes, jamais leur identité ni leur ordre, et le
// hasard de la partie en est retiré (null : un tirage y échouerait). Un déroulé à
// l'aveugle (options.blind) n'en a jamais besoin.
export function blindCopy(state) {
  const hidden = (list) => list.map(() => UNKNOWN_MARBLE);
  return { ...structuredClone(state), bag: hidden(state.bag), discard: hidden(state.discard), rngState: null };
}

// --- Actions ---

// La défausse devient le sac : mélangée par le hasard de la partie, ou, à
// l'aveugle, sans mélange ni hasard, ses billes devenant inconnues (la prévision
// annonce la régénération sans rien en révéler). Puis la TROUVAILLE de chaque bille
// active, dans l'ordre des phases : une INTERRUPTION (run.settle), réglée jusqu'au
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
    update(run, { bag: discard.map(() => UNKNOWN_MARBLE), discard: [] });
  } else {
    const shuffle = shuffled(discard, run.state.rngState);
    update(run, { rngState: shuffle.rngState, bag: shuffle.list, discard: [] });
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
  if (run.state.hand.length >= run.state.maxHandSize) return "handFull";
  if (run.state.bag.length === 0) {
    if (run.state.discard.length === 0) return "noMarbles";
    regenerateBag(run);
    return drawOne(run, cause);
  }
  const [top, ...bag] = run.state.bag;
  const marble = run.blind ? UNKNOWN_MARBLE : top;
  update(run, { bag, hand: [...run.state.hand, { marble, turnsInHand: 0 }] });
  run.emit({ type: "draw", marble, cause });
  // L'ÉVEIL de la bille piochée : une interruption (run.settle), réglée jusqu'au bout,
  // ce qu'il déclenche compris (une Pioche qui pioche à son tour), avant que la pioche
  // ne passe à la bille suivante.
  run.settle({ type: "awaken", marble });
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

// LE retrait par usure d'une bille, le seul : à l'étape des retraits, ou aussitôt
// quand une Fêlure l'amène à son maximum. Elle quitte son emplacement, rejoint la
// défausse, puis son Final se déclenche.
export function retireMarble(run, slot) {
  const { marble } = run.state.triangle[slot];
  discardFromSlot(run, slot, marble, "wear");
  run.emit({ type: "final", slot, marble });
}
