// JEU DES BILLES — LES CIBLES AU CHOIX du déroulé : les cibles valides de chaque zone,
// la réponse rejouée (answerOf), le refus d'une réponse (chooseRefusal), et le choix
// lui-même, cible par cible, qui suspend l'action quand le joueur doit trancher
// (chooseTargets, ChoiceSuspension). Une partie du déroulé (marbles/core/run.js) :
// chaque fonction reçoit son objet `run`. Le format d'une cible au choix : en-tête de
// marbles/core/effects.js. Simulation pure.

import { CLAUSE_ACTIONS, UNKNOWN_MARBLE, isOptionalChoice } from "./effects.js";
import { CHOICE_ZONES, SLOTS } from "./zones.js";
import { handRoom } from "./path.js";

// --- Les cibles au choix ---

// Les cibles d'une zone de choix disponible (marbles/core/effects.js/CHOICE_ZONES),
// valides à cet instant : (run, pick, bonus) -> [cible]. `bonus` : l'action est un
// bonus de Vitesse ou de Masse, qui ne vaut que pour une phase encore à venir (règle
// des cibles) : un emplacement dont la phase a commencé n'est pas éligible. Une
// bille en partance (son Final, son Éjection) n'est plus sur le triangle : jamais
// proposée.
const CHOICE_TARGETS = {
  hand: (run) => run.state.hand.map(({ marble }, index) => ({ zone: "hand", index, marble })),
  // La défausse, dans l'ordre d'arrivée : une bille en partance n'y est pas encore.
  discard: (run) => run.state.discard.map((marble, index) => ({ zone: "discard", index, marble })),
  triangle: (run, pick, bonus) =>
    SLOTS.filter(
      (slot) => (pick === "slot" || run.state.triangle[slot] !== null) && !(bonus && run.phasesStarted.has(slot))
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
// Les zones dont une cible se désigne par sa place (`index`), et non par un
// emplacement : la main, la défausse.
const INDEXED_ZONES = new Set(["hand", "discard"]);

function sameTarget(a, b) {
  return a.zone === b.zone && (INDEXED_ZONES.has(a.zone) ? a.index === b.index : a.slot === b.slot);
}

// La forme publique d'une cible, celle de l'action « choisir ».
export function targetRef(target) {
  return INDEXED_ZONES.has(target.zone) ? { zone: target.zone, index: target.index } : { zone: "triangle", slot: target.slot };
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
  if (action.done === true) return isOptionalChoice(pending) ? null : "choiceRequired";
  const target = action.target;
  if (target === null || typeof target !== "object" || !pending.eligible.some((eligible) => sameTarget(eligible, target))) return "invalidChoice";
  return null;
}

// Un choix que le joueur doit trancher : le déroulé s'arrête là (transact).
export class ChoiceSuspension {
  constructor(request) {
    this.request = request;
  }
}

// Fait choisir les cibles d'une clause au choix (marbles/core/effects.js, en-tête),
// une par une : une cible déjà choisie n'est plus éligible ; la sélection s'arrête à
// N choix, quand plus rien n'est éligible, ou sur Terminer (un choix facultatif). Aucune
// cible éligible dès le départ : rien ne s'ouvre, `targetEmpty` le note. Les réponses
// viennent du rejeu (run.answers) ; quand il n'y en a plus, le déroulé se SUSPEND
// (ChoiceSuspension), sauf à l'aveugle, où le choix reste indécis
// (`choiceUndecided`) et rien n'est choisi. -> les cibles, dans l'ordre des choix.
export function chooseTargets(run, clause, by) {
  const { zones, pick, mode } = clause.target;
  const bonus = CLAUSE_ACTIONS[clause.action].kind === "value";
  const chosen = [];
  const eligibleNow = () =>
    zones.flatMap((zone) => CHOICE_TARGETS[zone](run, pick, bonus)).filter((target) => !chosen.some((done) => sameTarget(done, target)));
  if (eligibleNow().length === 0) {
    run.emit({ type: "targetEmpty", action: clause.action, slot: null, target: "choice", by });
    return [];
  }
  // Vers la main (Ramasser) : jamais plus de choix que de places libres ; aucune
  // place, aucun choix (la cible vide le note).
  let { count } = clause.target;
  if (CLAUSE_ACTIONS[clause.action].handLimited) {
    const room = handRoom(run);
    if (room <= 0) {
      run.emit({ type: "targetEmpty", action: clause.action, slot: null, target: "handFull", by });
      return [];
    }
    count = Math.min(count, room);
  }
  const request = { action: clause.action, ...(clause.amount === undefined ? {} : { amount: clause.amount }), zones, pick, count, mode, by };
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
    // Terminer (facultatif seulement) : sans aucune cible choisie, le joueur n'a
    // rien choisi, l'action est ignorée (`declined`) ; après au moins une, la
    // sélection s'arrête là (`done`).
    if (answer.done) {
      run.emit({ type: "choiceEnded", reason: chosen.length === 0 ? "declined" : "done", chosen: chosen.length, by });
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
