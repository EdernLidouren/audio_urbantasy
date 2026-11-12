// Vérifications du core — domaine « marbles-statuses ». Les STATUTS du jeu des billes
// (marbles/core/statuses.js, doc/marbles.md, « Statuts ») : la validation d'une table
// de statuts et de l'action Appliquer un statut, les instances dans l'état (cumuls,
// sauvegarde JSON, compteurs), les caractéristiques en vigueur et leurs planchers, les
// modificateurs de valeur (ordre, signe, charges, Impact, prévision), les réactions
// des statuts après celles du pot, et les durées (activation, expiration, dernier
// tour). Sur la table des statuts de test (marbles/checks/fixtures/marbles.js/
// FIXTURE_STATUSES) et des billes fabriquées. Lancées par
// core/checks/index.js/runChecks (`node tools/run-checks.js marbles-statuses`).

import { throws } from "../../lib/check.js";
import { applyStatus as gain, mass, speed } from "../content/effects.js";
import { validateMarbleStatuses } from "../core/content.js";
import { CONDITIONS } from "../core/effects.js";
import { readForecast } from "../core/forecast.js";
import { applyStatus, characteristic } from "../core/statuses.js";
import { FIXTURE_STATUSES } from "./fixtures/marbles.js";
import { caughtMessage, eventTypes, fabricatedRules, inHand, marblesPlayState, mustReduce, placed, triangleOf, validateTable } from "./helpers.js";

// Une instance de statut posée à la main dans un état fabriqué.
function instance(status, { intensity = 1, remaining = 1, pending = false } = {}) {
  return { status, holder: "game", intensity, remaining, pending, origin: null };
}

// Les billes fabriquées des vérifications de ce domaine.
const TABLE = {
  plain: {},
  // Vitesse +3 en phase ; Vitesse −3 en phase ; Masse +1 en phase.
  gainer: { base: [speed(3)], apex: [speed(3)] },
  loser: { base: [speed(-3)], apex: [speed(-3)] },
  heavy: { base: [mass(1)], apex: [mass(1)] },
  // Donnent un statut à leur Chiquenaude (pendant la phase de jeu).
  nowThrower: { flick: [gain("throws_now")] },
  nextThrower: { flick: [gain("throws_next")] },
  chargeGiver: { flick: [gain("gain_charge")] },
  cushionGiver: { flick: [gain("loss_cushion", { intensity: 2 })] },
  shortCushion: { flick: [gain("loss_cushion", { duration: 1 })] },
  reactGiver: { flick: [gain("flick_react")] },
  receivedGiver: { flick: [gain("received_react")] },
  // Une Chiquenaude sans statut, que flick_react écoute.
  flicker: { flick: [mass(1)] },
  // Donne Coup double à sa phase, et Vitesse +2.
  doubler: { base: [speed(2), gain("impact_double")], apex: [speed(2), gain("impact_double")] },
};

const rules = fabricatedRules(TABLE);
const game = (over) => marblesPlayState(rules, over);
const toApex = { type: "place", handIndex: 0, slot: "apex" };

// La prévision égale-t-elle le réel, lu de la même façon ?
function forecastMatches(state, action) {
  const real = action === null ? { state, events: [] } : mustReduce(rules, state, action);
  const resolved = mustReduce(rules, real.state, { type: "resolve" });
  const { uncertain, awakenPossible, ...predicted } = rules.forecast(state, action);
  return JSON.stringify(predicted) === JSON.stringify(readForecast(real.events, resolved.events, resolved.state));
}

export default function checkMarblesStatuses(run) {
  run.section("définitions", checkDefinitions);
  run.section("instances et cumuls", checkInstances);
  run.section("caractéristiques", checkCharacteristics);
  run.section("modificateurs", checkModifiers);
  run.section("réactions", checkReactions);
  run.section("durées", checkDurations);
}

function checkDefinitions(run) {
  run("la table de test se valide", false, throws(() => validateMarbleStatuses(FIXTURE_STATUSES)));
  const refused = (definition) => caughtMessage(() => validateMarbleStatuses({ bad: definition }));
  const ok = { stacking: "intensity", duration: { kind: "turn" }, behaviors: [{ type: "stat", stat: "throws", amount: 1 }] };
  run("refus : cumul inconnu", true, refused({ ...ok, stacking: "twice" }).includes("cumul"));
  run("refus : durée inconnue", true, refused({ ...ok, duration: { kind: "forever" } }).includes("durée inconnue"));
  run("refus : durée comptée sans count", true, refused({ ...ok, duration: { kind: "turns" } }).includes("count"));
  run("refus : count sur une durée qui ne se compte pas", true, refused({ ...ok, duration: { kind: "game", count: 2 } }).includes("n'a pas de count"));
  run("refus : cumul en durée sur « ce tour »", true, refused({ ...ok, stacking: "duration" }).includes("cumul en durée"));
  run("refus : aucun comportement", true, refused({ ...ok, behaviors: [] }).includes("non vide"));
  run("refus : caractéristique inconnue", true, refused({ ...ok, behaviors: [{ type: "stat", stat: "luck", amount: 1 }] }).includes("caractéristique"));
  run("refus : montant nul", true, refused({ ...ok, behaviors: [{ type: "stat", stat: "throws", amount: 0 }] }).includes("non nul"));
  const modifier = (behavior) => refused({ ...ok, behaviors: [{ type: "modifier", point: "speedGain", operation: "add", value: 1, ...behavior }] });
  run("refus : point d'interception inconnu", true, modifier({ point: "drawGain" }).includes("point d'interception"));
  run("refus : opération inconnue", true, modifier({ operation: "power" }).includes("opération"));
  run("refus : multiplier par 1", true, modifier({ operation: "multiply", value: 1 }).includes("multiplicateur"));
  run("refus : multiplier par un négatif", true, modifier({ operation: "multiply", value: -2 }).includes("multiplicateur"));
  run("refus : ajouter 0", true, modifier({ value: 0 }).includes("ajouter 0"));
  const reaction = (behavior) => refused({ ...ok, behaviors: [{ type: "reaction", on: "flick", effect: [speed(1)], ...behavior }] });
  run("refus : réagir à une valeur qui ne s'écoute pas", true, reaction({ on: "speedGained" }).includes("écoutable"));
  run("refus : une réaction sur la bille elle-même", true, reaction({ effect: [{ action: "polish", amount: 1 }] }).includes("bille elle-même"));
  run("refus : une réaction vers un emplacement relatif", true, reaction({ effect: [{ action: "polish", amount: 1, target: "nextSlot" }] }).includes("référence"));
  run("refus : réagir à une action en la produisant", true, reaction({ on: "polish", effect: [{ action: "polish", amount: 1, target: "apex" }] }).includes("boucle"));
  run("refus : des charges sans modificateur", true, refused({ ...ok, duration: { kind: "charges", count: 1 } }).includes("charges"));
  run("une réaction vers un emplacement fixe se valide", "", reaction({ effect: [{ action: "polish", amount: 1, target: "apex" }] }));

  // L'action Appliquer un statut : un statut de la table, une intensité, une durée
  // seulement pour une durée comptée.
  const clause = (over) => caughtMessage(() => validateTable({ giver: { flick: [{ action: "applyStatus", status: "gain_charge", amount: 1, ...over }] } }));
  run("action : un statut de la table se valide", "", clause({}));
  run("action : statut inconnu refusé", true, clause({ status: "nope" }).includes("statut inconnu"));
  run("action : intensité 0 refusée", true, clause({ amount: 0 }).includes("amount"));
  run("action : une durée comptée se change", "", clause({ duration: 3 }));
  run("action : une durée qui ne se compte pas ne se change pas", true, clause({ status: "throws_next", duration: 2 }).includes("ne se compte pas"));
  run("action : sans cible", true, clause({ target: "apex" }).includes("target"));
  run("action : la forme courte, intensité 1 par défaut", JSON.stringify({ action: "applyStatus", status: "cushion", amount: 1 }), JSON.stringify(gain("cushion")));
  run("action : la forme courte, intensité et durée", JSON.stringify({ action: "applyStatus", status: "cushion", amount: 2, duration: 1 }), JSON.stringify(gain("cushion", { intensity: 2, duration: 1 })));
}

function checkInstances(run) {
  const add = (instances, id, application = { intensity: 1 }) => applyStatus(instances, FIXTURE_STATUSES, id, application);

  // Une instance neuve : sa durée d'après sa définition, ou d'après la clause.
  const fresh = add([], "loss_cushion");
  run.same("neuve : reçue, 3 tours, en vigueur", { outcome: "gained", instance: instance("loss_cushion", { remaining: 3 }) }, { outcome: fresh.outcome, instance: fresh.instance });
  run("neuve : la durée de la clause remplace celle de la définition", 1, add([], "loss_cushion", { intensity: 1, count: 1 }).instance.remaining);
  run.same("neuve : le prochain tour, en attente", { pending: true, remaining: 1 }, (({ pending, remaining }) => ({ pending, remaining }))(add([], "throws_next").instance));
  run("neuve : toute la partie, rien à compter", null, add([], "pot_game").instance.remaining);

  // Les trois cumuls : jamais une seconde instance.
  const twice = add(fresh.instances, "loss_cushion", { intensity: 2, count: 1 });
  run.same("en intensité : l'intensité s'ajoute, la durée la plus longue reste", { outcome: "strengthened", intensity: 3, remaining: 3, count: 1 }, { outcome: twice.outcome, intensity: twice.instance.intensity, remaining: twice.instance.remaining, count: twice.instances.length });
  const charged = add(add([], "gain_charge").instances, "gain_charge");
  run.same("en durée : les charges s'ajoutent", { outcome: "strengthened", remaining: 2, intensity: 1 }, { outcome: charged.outcome, remaining: charged.instance.remaining, intensity: charged.instance.intensity });
  const unique = add(add([], "impact_double").instances, "impact_double");
  run.same("unique : sans effet, l'instance inchangée", { outcome: "unchanged", count: 1 }, { outcome: unique.outcome, count: unique.instances.length });
  // « Le prochain tour » reçu de nouveau : fusionné, en attente ou en vigueur.
  const pending = add(add([], "throws_next").instances, "throws_next");
  run.same("le prochain tour, en attente : l'intensité s'ajoute, toujours en attente", { intensity: 2, remaining: 1, pending: true }, (({ intensity, remaining, pending }) => ({ intensity, remaining, pending }))(pending.instance));
  const acting = add([instance("throws_next", { remaining: 1 })], "throws_next");
  run.same("le prochain tour, en vigueur : l'intensité s'ajoute aussitôt, il couvre aussi le prochain tour", { intensity: 2, remaining: 2, pending: false }, (({ intensity, remaining, pending }) => ({ intensity, remaining, pending }))(acting.instance));
  // L'ordre d'acquisition : un renforcement garde sa place, un nouveau s'ajoute à la fin.
  const ordered = add(add(add([], "loss_cushion").instances, "pot_game").instances, "loss_cushion");
  run.same("ordre d'acquisition : renforcé en place", ["loss_cushion", "pot_game"], ordered.instances.map((one) => one.status));

  // Par le réducteur : l'évènement, l'origine, les compteurs.
  const given = mustReduce(rules, game({ hand: inHand(["cushionGiver"]) }), toApex);
  const gained = given.events.find((event) => event.type === "statusGained");
  run.same(
    "réducteur : statusGained, avec l'effet qui le donne",
    { status: "loss_cushion", intensity: 2, remaining: 3, pending: false, by: { trigger: "flick", slot: "apex", marble: "cushionGiver" } },
    { status: gained.status, intensity: gained.intensity, remaining: gained.remaining, pending: gained.pending, by: gained.by }
  );
  run.same("réducteur : l'instance garde son origine", { trigger: "flick", slot: "apex", marble: "cushionGiver" }, given.state.statuses[0].origin);
  run("réducteur : l'effet le dit dans ses actions", "applyStatus", given.events.find((event) => event.type === "effect" && event.trigger === "flick").operations[0].action);
  const again = mustReduce(rules, { ...given.state, hand: inHand(["cushionGiver"]) }, { type: "place", handIndex: 0, slot: "leftBase" });
  run.same("réducteur : renforcé, statusStrengthened", ["statusStrengthened", 4], [again.events.find((event) => event.type.startsWith("status")).type, again.state.statuses[0].intensity]);
  run.same(
    "compteurs : reçu, renforcé, et le mot-clé Appliquer un statut",
    { statusesReceived: 1, statusesStrengthened: 1, applyStatus: 2 },
    { statusesReceived: again.state.tally.statusesReceived.game, statusesStrengthened: again.state.tally.statusesStrengthened.game, applyStatus: again.state.tally.applyStatus.game }
  );
  const ignored = mustReduce(rules, game({ hand: inHand(["reactGiver"]), statuses: [instance("flick_react", { remaining: 2 })] }), toApex);
  run("réducteur : unique déjà là, statusUnchanged", true, ignored.events.some((event) => event.type === "statusUnchanged" && event.status === "flick_react"));

  // La sauvegarde : un état avec statuts passe par JSON et rejoue à l'identique.
  const saved = JSON.parse(JSON.stringify(given.state));
  run.same("JSON : les statuts survivent", given.state.statuses, saved.statuses);
  run(
    "JSON : la résolution rejouée depuis la copie est identique",
    JSON.stringify(mustReduce(rules, given.state, { type: "resolve" })),
    JSON.stringify(mustReduce(rules, saved, { type: "resolve" }))
  );
}

function checkCharacteristics(run) {
  const value = (key, statuses, over = {}) => characteristic({ ...game(over), statuses }, key, FIXTURE_STATUSES);
  run("lancers : les réglages sans statut", 5, value("throws", []));
  run("lancers : +1 par intensité", 7, value("throws", [instance("throws_next", { intensity: 2 })]));
  run("lancers : un statut en attente ne compte pas", 5, value("throws", [instance("throws_next", { pending: true })]));
  run("lancers : plancher 0", 0, value("throws", [instance("throws_minus", { intensity: 9 })]));
  run("main : plancher 1", 1, value("handSize", [instance("hand_shrink", { intensity: 3 })]));
  run("pot : +1", 4, value("potCapacity", [instance("pot_game", { remaining: null })]));
  run("une table absente : un statut inconnu lève, jamais en silence", true, throws(() => characteristic({ ...game(), statuses: [instance("pot_game")] }, "potCapacity")));

  // Les lancers : un statut reçu pendant le tour s'ajoute aussitôt.
  const spent = game({ hand: inHand(["nowThrower", "plain"]), throwsUsed: 4 });
  const thrown = mustReduce(rules, spent, toApex);
  run.same("lancers : le dernier lancer en donne un de plus, ce tour", [1, null], [rules.throwsLeft(thrown.state), rules.throwRefusal(thrown.state)]);
  run("lancers : sans statut, le refus", "noThrowsLeft", rules.placeRefusal({ ...thrown.state, statuses: [] }, 0, "leftBase"));
  run("lancers : les actions légales le suivent", true, rules.legalActions(thrown.state).some((action) => action.type === "place"));

  // Les zones lisent la capacité en vigueur ; au-delà, pleines, rien n'en sort.
  const potState = (pot, statuses) => ({ ...game({ pot }), statuses });
  const full = (state) => CONDITIONS.zone.test({ type: "zone", zone: "pot", state: "full" }, { state, statuses: FIXTURE_STATUSES });
  run.same("pot plein : 3 sur 3 ; agrandi, 3 sur 4 ne l'est plus", [true, false], [full(potState(["plain", "plain", "plain"], [])), full(potState(["plain", "plain", "plain"], [instance("pot_game", { remaining: null })]))]);
  run("pot au-delà de sa capacité : plein", true, full(potState(["plain", "plain", "plain", "plain"], [])));
  const pocketer = fabricatedRules({ ...TABLE, pocketer: { flick: [{ action: "pocket", target: "firstInHand" }] } });
  const over = mustReduce(pocketer, { ...game({ hand: inHand(["pocketer", "plain"]), pot: ["plain", "plain", "plain", "plain"] }), statuses: [] }, toApex);
  run.same("pot au-delà : la bille empochée est perdue, aucune n'en sort", [4, 1], [over.state.pot.length, over.state.lost.length]);
  const roomy = mustReduce(pocketer, { ...game({ hand: inHand(["pocketer", "plain"]), pot: ["plain", "plain", "plain"] }), statuses: [instance("pot_game", { remaining: null })] }, toApex);
  run("pot agrandi : la bille entre", 4, roomy.state.pot.length);
  // La main réduite : la pioche s'arrête plus tôt.
  const drawer = fabricatedRules({ ...TABLE, drawer: { flick: [{ action: "draw", amount: 2 }] } });
  const shrunk = mustReduce(drawer, { ...game({ hand: inHand(["drawer", "plain", "plain", "plain"]), bag: ["plain", "plain"] }), statuses: [instance("hand_shrink")] }, toApex);
  run("main réduite à 3 : pleine à 3, la pioche est sautée", "handFull", shrunk.events.find((event) => event.type === "drawSkipped")?.reason);
}

function checkModifiers(run) {
  const resolved = (triangle, statuses) => mustReduce(rules, { ...game({ triangle }), statuses }, { type: "resolve" });
  const phaseOf = (result, slot) => result.events.find((event) => event.type === "effect" && event.trigger === "phase" && event.slot === slot);

  // Une charge : le prochain gain doublé, puis la fin, à sa place.
  const charged = resolved(triangleOf(placed("gainer"), placed("gainer"), null), [instance("gain_charge")]);
  run.same("charge : le premier gain doublé, le second non", [6, 3], [phaseOf(charged, "rightBase").speedDelta, phaseOf(charged, "leftBase").speedDelta]);
  const afterFirst = charged.events.slice(charged.events.indexOf(phaseOf(charged, "rightBase")));
  run.same("charge : l'effet, sa modification, la charge, la fin", ["effect", "valueModified", "statusCharge", "statusExpired"], eventTypes(afterFirst.slice(0, 4)));
  run.same(
    "charge : la modification, pas à pas",
    { point: "speedGain", before: 3, after: 6, contributions: [{ status: "gain_charge", before: 3, after: 6 }] },
    (({ point, before, after, contributions }) => ({ point, before, after, contributions }))(afterFirst[1])
  );
  run("charge : consommée, le statut a pris fin", 0, charged.state.statuses.length);
  run.same("compteurs : les valeurs finales, la charge, la fin", [9, 1, 1], [charged.state.tally.speedGained.turn, charged.state.tally.statusChargesUsed.turn, charged.state.tally.statusesExpired.turn]);

  // L'ordre : les additions d'abord, puis les multiplications, quel que soit l'ordre
  // d'acquisition.
  const both = (order) => phaseOf(resolved(triangleOf(null, placed("gainer"), null), order.map((id) => instance(id, { remaining: 2 }))), "rightBase").speedDelta;
  run.same("ordre : (3 + 1) × 2, dans les deux ordres d'acquisition", [8, 8], [both(["gain_charge", "gain_add"]), both(["gain_add", "gain_charge"])]);

  // Les pertes : sur la grandeur, le signe jamais inversé.
  const loss = (intensity) => phaseOf(resolved(triangleOf(null, placed("loser"), null), [instance("loss_cushion", { intensity, remaining: 3 })]), "rightBase").speedDelta;
  run.same("pertes : −3 amorti de 1, de 2, de 5 : −2, −1, 0 (jamais positif)", [-2, -1, 0], [loss(1), loss(2), loss(5)]);
  run("pertes : un gain n'est pas une perte", 3, phaseOf(resolved(triangleOf(null, placed("gainer"), null), [instance("loss_cushion", { remaining: 3 })]), "rightBase").speedDelta);
  // La Masse : gains et pertes, une charge par vrai changement.
  const heavy = resolved(triangleOf(placed("heavy"), placed("heavy"), placed("heavy")), [instance("mass_double", { remaining: 2 })]);
  run.same("Masse : deux charges, deux gains doublés, puis rien", [2, 2, 1], ["rightBase", "leftBase", "apex"].map((slot) => phaseOf(heavy, slot).massDelta));
  run("Masse : sans valeur, rien n'est intercepté ni consommé", 2, resolved(triangleOf(null, placed("plain"), null), [instance("mass_double", { remaining: 2 })]).state.statuses[0].remaining);

  // L'Impact : après son calcul habituel, plancher 0.
  const impact = (statuses, triangle = triangleOf(null, placed("gainer"), null)) => resolved(triangle, statuses).events.find((event) => event.type === "impact").impact;
  run.same("Impact : 3, doublé 6, taxé 0 (plancher)", [3, 6, 0], [impact([]), impact([instance("impact_double")]), impact([instance("impact_tax", { remaining: null })])]);
  const taxed = resolved(triangleOf(null, placed("gainer"), null), [instance("impact_tax", { remaining: null }), instance("impact_double")]);
  run.same(
    "Impact : additions puis multiplications, plancher à la fin, l'évènement modifié après l'Impact",
    { impact: 0, next: "valueModified", contributions: [{ status: "impact_tax", before: 3, after: -2 }, { status: "impact_double", before: -2, after: -4 }] },
    (() => {
      const index = taxed.events.findIndex((event) => event.type === "impact");
      return { impact: taxed.events[index].impact, next: taxed.events[index + 1].type, contributions: taxed.events[index + 1].contributions };
    })()
  );
  run("Impact : Coup double reçu en résolution compte ce tour", 4, impact([], triangleOf(null, placed("doubler"), null)));

  // La prévision : les statuts agissent sur la copie, jamais sur l'état.
  const state = { ...game({ triangle: triangleOf(placed("gainer"), placed("gainer"), null) }), statuses: [instance("gain_charge")] };
  run("prévision : la charge comptée", 9, rules.forecast(state).speed);
  run("prévision : la charge reste dans l'état", 1, state.statuses[0].remaining);
  run("prévision = réel : une charge", true, forecastMatches(state, null));
  run("prévision = réel : un statut reçu à la pose, puis la résolution", true, forecastMatches(game({ hand: inHand(["chargeGiver"]), triangle: triangleOf(placed("gainer"), null, null) }), toApex));
  run("prévision = réel : Coup double reçu en résolution", true, forecastMatches(game({ triangle: triangleOf(null, placed("doubler"), placed("gainer")) }), null));
}

function checkReactions(run) {
  // Ferveur : à chaque Chiquenaude, après l'effet de la bille concernée.
  const reacted = mustReduce(rules, { ...game({ hand: inHand(["flicker"]) }), statuses: [instance("flick_react", { remaining: 2 })] }, toApex);
  const types = eventTypes(reacted.events);
  run.same("réaction : la Chiquenaude, son effet, puis la réaction", ["flick", "effect", "statusReaction", "effect"], types.slice(0, 4));
  const effect = reacted.events[3];
  run.same("réaction : l'effet du statut, sans bille", { trigger: "statusReaction", status: "flick_react", slot: null, marble: null, speedDelta: 2 }, (({ trigger, status, slot, marble, speedDelta }) => ({ trigger, status, slot, marble, speedDelta }))(effect));
  run("réaction : un statut en attente ne réagit pas", false, mustReduce(rules, { ...game({ hand: inHand(["flicker"]) }), statuses: [instance("flick_react", { remaining: 2, pending: true })] }, toApex).events.some((event) => event.type === "statusReaction"));

  // L'ordre des sources : le pot (all_rounder écoute la Chiquenaude), puis les statuts.
  const potAndStatus = fabricatedRules({ ...TABLE, potFlick: { pocketed: { flick: [speed(5)] } } });
  const both = mustReduce(potAndStatus, { ...game({ hand: inHand(["flicker"]), pot: ["potFlick"] }), statuses: [instance("flick_react", { remaining: 2 })] }, toApex);
  run.same("réaction : le pot d'abord, puis les statuts", ["pocketReaction", "statusReaction"], eventTypes(both.events).filter((type) => type === "pocketReaction" || type === "statusReaction"));
  // Plusieurs statuts : l'ordre d'acquisition.
  const two = mustReduce(rules, { ...game({ hand: inHand(["flicker"]) }), statuses: [instance("throw_react", { remaining: null }), instance("flick_react", { remaining: 2 })] }, toApex);
  run.same("réaction : les statuts dans l'ordre d'acquisition", ["throw_react", "flick_react"], two.events.filter((event) => event.type === "statusReaction").map((event) => event.status));

  // Jamais à sa propre acquisition ; à celle d'un autre statut, oui.
  const self = mustReduce(rules, game({ hand: inHand(["receivedGiver"]) }), toApex);
  run("réaction : pas à sa propre réception", false, self.events.some((event) => event.type === "statusReaction"));
  const other = mustReduce(rules, { ...game({ hand: inHand(["chargeGiver"]) }), statuses: [instance("received_react", { remaining: null })] }, toApex);
  run("réaction : à la réception d'un autre", true, other.events.some((event) => event.type === "statusReaction" && event.status === "received_react"));
}

function checkDurations(run) {
  // Le prochain tour : en attente, activé en silence au début du tour suivant, fini à sa fin.
  const given = mustReduce(rules, game({ hand: inHand(["nextThrower"]) }), toApex);
  run.same("prochain tour : reçu en attente, sans effet ce tour", [true, 4], [given.state.statuses[0].pending, rules.throwsLeft(given.state)]);
  const ended = mustReduce(rules, given.state, { type: "resolve" });
  run("prochain tour : la fin du tour ne le compte pas", 1, ended.state.statuses.length);
  const drawn = mustReduce(rules, ended.state, { type: "draw" });
  run.same("prochain tour : activé juste après le début du tour", ["turnStarted", "statusActivated"], eventTypes(drawn.events).slice(0, 2));
  run("prochain tour : un lancer de plus", 6, rules.throwsLeft(drawn.state));
  const after = mustReduce(rules, drawn.state, { type: "resolve" });
  run.same("prochain tour : fini après la rotation, avant la fin du tour", ["rotation", "statusExpired", "turnEnded"], eventTypes(after.events).slice(-3));
  run("prochain tour : plus de statut", 0, after.state.statuses.length);

  // N tours : celui en cours compte.
  const cushion = mustReduce(rules, game({ hand: inHand(["shortCushion"]) }), toApex);
  run.same("1 tour (durée de la clause) : fini à la fin de ce tour", ["statusExpired"], eventTypes(mustReduce(rules, cushion.state, { type: "resolve" }).events).filter((type) => type === "statusExpired"));
  let state = mustReduce(rules, game({ hand: inHand(["cushionGiver"]) }), toApex).state;
  const remaining = [];
  for (let turn = 0; turn < 3; turn++) {
    state = mustReduce(rules, state, { type: "resolve" }).state;
    remaining.push(state.statuses.length === 0 ? 0 : state.statuses[0].remaining);
    state = mustReduce(rules, state, { type: "draw" }).state;
  }
  run.same("3 tours : 2, 1, fini", [2, 1, 0], remaining);

  // Toute la partie : jamais fini ; ce tour : fini ce tour.
  const kept = mustReduce(rules, { ...game(), statuses: [instance("pot_game", { remaining: null }), instance("impact_double")] }, { type: "resolve" });
  run.same("toute la partie reste, ce tour finit", ["pot_game"], kept.state.statuses.map((one) => one.status));

  // Le dernier tour : aucune fin dite, la partie s'arrête.
  const last = mustReduce(rules, { ...game({ turn: 10 }), statuses: [instance("impact_double")] }, { type: "resolve" });
  run.same("dernier tour : aucune fin de statut, la fin de partie", [false, "over"], [last.events.some((event) => event.type === "statusExpired"), last.state.stage]);
}
