// Vérifications du core — domaine « marbles-statuses ». Les STATUTS du jeu des billes
// (marbles/core/statuses.js, doc/marbles.md, « Statuts ») : la validation d'une table
// de statuts et de l'action Appliquer un statut, les instances dans l'état (cumuls,
// sauvegarde JSON, compteurs), les caractéristiques en vigueur et leurs planchers, les
// modificateurs de valeur (ordre, signe, charges, Impact, prévision), les réactions
// des statuts après celles du pot, et les durées (activation, expiration, dernier
// tour), et les modificateurs de quantité (pioche du début de tour, pioche par effet,
// Polissage, Fêlure, usure de phase). Sur la table des statuts de test (marbles/checks/fixtures/marbles.js/
// FIXTURE_STATUSES) et des billes fabriquées. Lancées par
// core/checks/index.js/runChecks (`node tools/run-checks.js marbles-statuses`).

import { throws } from "../../lib/check.js";
import { applyStatus as gain, crack, draw, mass, polish, speed } from "../content/effects.js";
import { validateMarbleStatuses } from "../core/validation.js";
import { CONDITIONS } from "../core/effects.js";
import { applyStatus, characteristic, modifyQuantity, modifyStat, ruleInstance } from "../core/statuses.js";
import { passesFilters } from "../core/effects.js";
import { LARGE, SMALL } from "../config/values.js";
import { FIXTURE_STATUSES, fixtureRules } from "./fixtures/marbles.js";
import { caughtMessage, eventTypes, fabricatedRules, withSizes, forecastMatches, inHand, marblesPlayState, mustReduce, placed, statusInstance, triangleOf, validateTable } from "./helpers.js";

// Une instance de statut posée à la main (helpers.js).
const instance = statusInstance;

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
  // Les quantités, à leur Chiquenaude : Polissage 1, Fêlure 1 à la pointe, Pioche 1.
  polisher: { flick: [polish(1, "apex")] },
  cracker: { flick: [crack(1, "apex")] },
  drawer: { flick: [draw(1)] },
  // Une bille à usure maximale 3, Vitesse +1 en phase.
  worn: { base: [speed(1)], apex: [speed(1)], maxWear: 3 },
  // Un Éveil ; un Final d'une bille usée en une phase ; une Éjection sous condition de
  // calibre relatif ; deux Empocher de la main.
  waker: { awaken: [speed(1)] },
  finisher: { final: [speed(1)], maxWear: 1 },
  sizeKnock: { knockout: [{ action: "speed", amount: 1, when: { type: "relativeSize", marble: "placed", is: "larger" } }] },
  twoPockets: { flick: [{ action: "pocket", target: "firstInHand" }, { action: "pocket", target: "firstInHand" }] },
  // Chiquenaude : Vitesse +1 si la main est pleine.
  fullWatcher: { flick: [{ action: "speed", amount: 1, when: { type: "zone", zone: "hand", state: "full" } }] },
};

const rules = fabricatedRules(TABLE);
const game = (over) => marblesPlayState(rules, over);
const toApex = { type: "place", handIndex: 0, slot: "apex" };

// « Prévision = réel » sur les règles de ce domaine (helpers.js).
const matches = (state, action) => forecastMatches(rules, state, action);

export default function checkMarblesStatuses(run) {
  run.section("définitions", checkDefinitions);
  run.section("instances et cumuls", checkInstances);
  run.section("caractéristiques", checkCharacteristics);
  run.section("modificateurs", checkModifiers);
  run.section("filtres de source et arrondi", checkSourceFilters);
  run.section("verrous", checkLocks);
  run.section("réactions", checkReactions);
  run.section("durées", checkDurations);
  run.section("quantités", checkQuantities);
  run.section("ordre des réactions", checkReactionOrder);
}

// UNE SEULE RÈGLE D'ORDRE : la bille concernée joue d'abord son propre effet, puis
// les réactions (le pot, les statuts) ; la pioche du tour comme celle d'un effet, un
// retrait à l'étape des retraits comme par une Fêlure, une perte comme une entrée.
function checkReactionOrder(run) {
  const order = (events) => events.filter((event) => ["draw", "awaken", "removed", "final", "lost", "statusReaction"].includes(event.type) || (event.type === "effect" && event.trigger !== "flick")).map((event) => (event.type === "effect" ? `effect:${event.trigger}` : event.type));
  const drawReact = [instance("draw_react", { remaining: null })];
  const turnDraw = mustReduce(rules, { ...game({ stage: "draw", bag: ["waker"] }), statuses: drawReact }, { type: "draw" });
  run.same("pioche du tour : la pioche, l'Éveil, puis la réaction", ["draw", "awaken", "effect:awaken", "statusReaction", "effect:statusReaction"], order(turnDraw.events));
  const effectDraw = mustReduce(rules, { ...game({ hand: inHand(["drawer"]), bag: ["waker"] }), statuses: drawReact }, toApex);
  run.same("Pioche d'un effet : le même ordre", ["draw", "awaken", "effect:awaken", "statusReaction", "effect:statusReaction"], order(effectDraw.events));

  const wornReact = [instance("worn_react", { remaining: null })];
  const retired = mustReduce(rules, { ...game({ triangle: triangleOf(null, placed("finisher"), null) }), statuses: wornReact }, { type: "resolve" });
  const tail = (events) => order(events).filter((entry) => entry !== "effect:phase");
  run.same("retrait par usure : le départ, le Final, puis la réaction", ["removed", "final", "effect:final", "statusReaction", "effect:statusReaction"], tail(retired.events));
  const crackedOut = mustReduce(rules, { ...game({ hand: inHand(["cracker"]), triangle: triangleOf(null, null, placed("finisher")) }), statuses: wornReact }, toApex);
  run.same("retrait par une Fêlure : le même ordre", ["removed", "final", "effect:final", "statusReaction", "effect:statusReaction"], tail(crackedOut.events));

  const lostReact = [instance("lost_react", { remaining: null })];
  const lost = mustReduce(rules, { ...game({ hand: inHand(["twoPockets", "plain", "plain"]), pot: ["plain", "plain", "plain"] }), statuses: lostReact }, toApex);
  run.same("perte au pot plein : chaque perte, puis sa réaction, avant la suivante", ["lost", "statusReaction", "effect:statusReaction", "lost", "statusReaction", "effect:statusReaction"], order(lost.events));

  // Un statut qui éjecte n'est pas une bille : la condition de calibre relatif de
  // l'éjectée est fausse, rien ne plante, au réel comme en prévision.
  const ejecting = { ...game({ hand: inHand(["plain"]), triangle: triangleOf(null, null, placed("sizeKnock")) }), statuses: [instance("throw_eject", { remaining: null })] };
  const knocked = mustReduce(rules, ejecting, { type: "place", handIndex: 0, slot: "leftBase" });
  run("statut qui éjecte : l'Éjection joue, sa condition de calibre fausse", 0, knocked.events.find((event) => event.type === "effect" && event.trigger === "knockout")?.speedDelta ?? 0);
  run("statut qui éjecte : la prévision aussi", true, rules.forecast(ejecting, { type: "place", handIndex: 0, slot: "leftBase" }).ok);
}

// LES QUANTITÉS : chaque point modifie sa quantité, plancher 0, avant les limites
// habituelles ; les compteurs de quantité réelle disent ce qui s'est passé.
function checkQuantities(run) {
  const drawnOf = (result) => result.events.filter((event) => event.type === "draw").length;
  const effectOf = (result, trigger) => result.events.find((event) => event.type === "effect" && event.trigger === trigger);

  // La pioche du début de tour, à part de la pioche par effet.
  const turnState = (statuses, hand = []) => ({ ...game({ stage: "draw", hand: inHand(hand), bag: Array(6).fill("plain") }), statuses });
  // La pioche du prochain début de tour, telle que la touche S la dit : les statuts
  // comme ils seront alors, rien de consommé.
  const next = (statuses, over = {}) => rules.nextTurnDraw({ ...game(over), statuses });
  run.same(
    "prochain début de tour : avec le statut, qui expire, qui s'active, avant la pioche du tour",
    [2, 1, 2, 3],
    [
      next([instance("turn_draw_more", { remaining: 2 })]),
      next([instance("turn_draw_more", { remaining: 1 })]),
      next([instance("turn_draw_more", { remaining: 1, pending: true })]),
      next([instance("turn_draw_more", { intensity: 2, remaining: 1 })], { stage: "draw" }),
    ]
  );
  run("pioche du tour : 1 + 2 (intensité 2)", 3, drawnOf(mustReduce(rules, turnState([instance("turn_draw_more", { intensity: 2, remaining: 2 })]), { type: "draw" })));
  const limited = mustReduce(rules, turnState([instance("turn_draw_more", { intensity: 2, remaining: 2 })], ["plain", "plain", "plain"]), { type: "draw" });
  run.same("pioche du tour : la main pleine arrête ensuite, comptée juste", [2, 2, "handFull"], [drawnOf(limited), limited.state.tally.drawnMarbles.turn, limited.events.find((event) => event.type === "drawSkipped")?.reason]);
  const notByEffect = mustReduce(rules, turnState([instance("effect_draw_charge")]), { type: "draw" });
  run.same("pioche du tour : une pioche par effet n'y touche pas, sa charge reste", [1, 1], [drawnOf(notByEffect), notByEffect.state.statuses[0].remaining]);
  const effectBag = (statuses) => ({ ...game({ hand: inHand(["drawer"]), bag: Array(6).fill("plain") }), statuses });
  const byEffect = mustReduce(rules, effectBag([instance("effect_draw_charge")]), toApex);
  run.same("pioche par effet : 1 + 1, l'effet dit 2, la charge consommée", [2, 2, 0], [drawnOf(byEffect), effectOf(byEffect, "flick").draw, byEffect.state.statuses.length]);
  run("pioche par effet : la pioche du tour n'y touche pas", 1, drawnOf(mustReduce(rules, effectBag([instance("turn_draw_more", { remaining: 2 })]), toApex)));
  run("pioche par effet : sans Pioche, la charge reste", 1, mustReduce(rules, { ...game({ hand: inHand(["plain"]) }), statuses: [instance("effect_draw_charge")] }, toApex).state.statuses[0].remaining);

  // Le Polissage : la quantité modifiée, puis le plancher d'usure.
  const polished = (wear, statuses) => mustReduce(rules, { ...game({ hand: inHand(["polisher"]), triangle: triangleOf(null, null, placed("worn", wear)) }), statuses }, toApex);
  const more = polished(2, [instance("polish_more", { remaining: null })]);
  run.same("Polissage : 1 + 1, l'effet dit 2, usure 2 → 0", [2, 0], [effectOf(more, "flick").operations[0].amount, more.events.find((event) => event.type === "polished").wear]);
  const floored = polished(1, [instance("polish_more", { remaining: null })]);
  run.same("Polissage : le plancher d'usure ensuite, la quantité réelle 1", [0, 2, 1], [floored.events.find((event) => event.type === "polished").wear, floored.events.find((event) => event.type === "polished").amount, floored.state.tally.polishQuantity.turn]);
  const none = polished(2, [instance("polish_less", { remaining: null })]);
  run.same(
    "Polissage ramené à 0 : rien ne se joue, ni évènement, ni déclenchement, l'effet ne le dit plus",
    [false, 0, []],
    [none.events.some((event) => event.type === "polished"), none.state.tally.polish.turn, effectOf(none, "flick").operations]
  );
  run("Polissage −2 : plancher 0, jamais une Fêlure", false, polished(2, [instance("polish_less", { intensity: 2, remaining: null })]).events.some((event) => event.type === "cracked"));

  // La Fêlure : augmentée jusqu'au maximum, la bille part aussitôt.
  const cracked = mustReduce(rules, { ...game({ hand: inHand(["cracker"]), triangle: triangleOf(null, null, placed("worn", 1)) }), statuses: [instance("crack_more", { remaining: 3 })] }, toApex);
  const crackIndex = cracked.events.findIndex((event) => event.type === "cracked");
  run.same("Fêlure : 1 + 1, usure 1 → 3, retirée aussitôt", [3, "removed", "wear"], [cracked.events[crackIndex].wear, cracked.events[crackIndex + 1].type, cracked.events[crackIndex + 1].cause]);
  run("Fêlure : sa quantité réelle, 2", 2, cracked.state.tally.crackQuantity.turn);

  // L'usure de phase : ×0, la phase jouée sans usure ; +1, retrait à l'étape des
  // retraits ; plafonnée au maximum.
  const resolved = (wear, statuses) => mustReduce(rules, { ...game({ triangle: triangleOf(null, placed("worn", wear), null) }), statuses }, { type: "resolve" });
  const rested = resolved(0, [instance("wear_none")]);
  run.same("usure de phase ×0 : la phase jouée, l'usure inchangée", [1, 0], [effectOf(rested, "phase").speedDelta, rested.events.find((event) => event.type === "wear").wear]);
  const worn = resolved(1, [instance("wear_more")]);
  const wearIndex = worn.events.findIndex((event) => event.type === "wear");
  const removedIndex = worn.events.findIndex((event) => event.type === "removed");
  run.same("usure de phase +1 : 1 → 3, retirée à l'étape des retraits, après les phases", [3, true], [worn.events[wearIndex].wear, removedIndex > worn.events.findIndex((event) => event.type === "phaseSkipped" && event.slot === "apex")]);
  run("usure de phase +2 : plafonnée au maximum", 3, resolved(2, [instance("wear_more", { intensity: 2 })]).events.find((event) => event.type === "wear").wear);
  run("usure de phase : une charge de Pioche n'y est pas consommée", 1, resolved(0, [instance("effect_draw_charge")]).state.statuses[0].remaining);

  // La prévision égale le réel, usure et quantités comprises.
  run("prévision = réel : usure de phase +1 et retrait", true, matches({ ...game({ triangle: triangleOf(placed("worn", 1), placed("worn", 0), null) }), statuses: [instance("wear_more")] }, null));
  run("prévision = réel : Polissage augmenté à la pose", true, matches({ ...game({ hand: inHand(["polisher"]), triangle: triangleOf(placed("worn", 1), null, placed("worn", 2)) }), statuses: [instance("polish_more", { remaining: null })] }, toApex));
  run("prévision = réel : Fêlure augmentée à la pose", true, matches({ ...game({ hand: inHand(["cracker"]), triangle: triangleOf(null, null, placed("worn", 1)) }), statuses: [instance("crack_more", { remaining: 3 })] }, toApex));
  run("prévision : l'usure prévue est celle d'après les statuts", 0, rules.forecast({ ...game({ triangle: triangleOf(null, placed("worn", 0), null) }), statuses: [instance("wear_none")] }).wear[0].wear);
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
  run("refus : ajouter 0", true, modifier({ value: 0 }).includes("entier non nul"));
  run("refus : ajouter une fraction", true, modifier({ value: 0.5 }).includes("entier non nul"));
  run("multiplier par 0,5 permis", "", modifier({ operation: "multiply", value: 0.5 }));
  run("filtre de source permis sur un gain", "", modifier({ filters: [{ type: "size", size: LARGE }] }));
  run("refus : filtre de source sur l'Impact (jamais de source)", true, modifier({ point: "impact", filters: [{ type: "size", size: LARGE }] }).includes("source"));
  run("refus : filtre inconnu", true, modifier({ filters: [{ type: "matter" }] }).includes("filtre"));
  run("refus : filtres vides", true, modifier({ filters: [] }).includes("filters"));
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
  // La main pleine se lit à la taille en vigueur : 3 sur 5, réduite à 3, pleine.
  const watched = (statuses) => mustReduce(rules, { ...game({ hand: inHand(["fullWatcher", "plain", "plain", "plain"]) }), statuses }, toApex).events.find((event) => event.type === "effect").speedDelta;
  run.same("main pleine : à la taille en vigueur, réduite par un statut", [0, 1], [watched([]), watched([instance("hand_shrink")])]);
  // La main réduite : la pioche s'arrête plus tôt.
  const drawer = fabricatedRules({ ...TABLE, drawer: { flick: [{ action: "draw", amount: 2 }] } });
  const shrunk = mustReduce(drawer, { ...game({ hand: inHand(["drawer", "plain", "plain", "plain"]), bag: ["plain", "plain"] }), statuses: [instance("hand_shrink")] }, toApex);
  run("main réduite à 3 : pleine à 3, la pioche est sautée", "handFull", shrunk.events.find((event) => event.type === "drawSkipped")?.reason);
}

// LES FILTRES SUR LA SOURCE : un modificateur filtré ne touche que les valeurs
// produites par une bille qui passe ses filtres ; jamais une valeur sans source.
// L'ARRONDI : vers zéro, à la fin.
function checkSourceFilters(run) {
  const statuses = {
    gravel: {
      stacking: "unique",
      duration: { kind: "game" },
      behaviors: [
        { type: "modifier", point: "speedGain", operation: "multiply", value: 0.5, filters: [{ type: "size", size: LARGE }] },
        { type: "modifier", point: "massGain", operation: "multiply", value: 0.5, filters: [{ type: "size", size: LARGE }] },
      ],
    },
    halfDraw: { stacking: "unique", duration: { kind: "game" }, behaviors: [{ type: "modifier", point: "turnDraw", operation: "multiply", value: 0.5 }] },
    halfCharge: { stacking: "duration", duration: { kind: "charges", count: 2 }, behaviors: [{ type: "modifier", point: "speedGain", operation: "multiply", value: 0.5 }] },
    thrownBoost: { stacking: "unique", duration: { kind: "game" }, behaviors: [{ type: "reaction", on: "thrownMarbles", effect: [speed(3)] }] },
  };
  const types = withSizes({ big: { size: LARGE, base: [speed(3), mass(3)], apex: [speed(3), mass(3)] }, small: { size: SMALL, base: [speed(3), mass(3)], apex: [speed(3), mass(3)] }, plain: {} });
  const source = (marble) => ({ marble, matches: (filters) => passesFilters(marble, filters, types) });
  const gravel = [instance("gravel", { remaining: null })];
  run("filtre : la bille filtrée, modifiée (3 × 0,5 arrondi vers zéro)", 1, modifyStat(gravel, statuses, "speed", 3, source("big")).value);
  run("filtre : une autre bille, intacte", 3, modifyStat(gravel, statuses, "speed", 3, source("small")).value);
  run("filtre : sans source, intacte", 3, modifyStat(gravel, statuses, "speed", 3).value);
  run("filtre : une perte n'est pas un gain", -3, modifyStat(gravel, statuses, "speed", -3, source("big")).value);
  run("arrondi : 1 × 0,5 donne 0", 0, modifyStat(gravel, statuses, "speed", 1, source("big")).value);
  run("arrondi : 5 × 0,5 donne 2", 2, modifyStat(gravel, statuses, "mass", 5, source("big")).value);
  run("arrondi : jamais −0", true, Object.is(modifyStat(gravel, statuses, "speed", 1, source("big")).value, 0));
  run("arrondi : une quantité aussi, 5 × 0,5 donne 2", 2, modifyQuantity([instance("halfDraw", { remaining: null })], statuses, "turnDraw", 5).value);
  // Une charge ne se consomme que si la valeur ARRONDIE change : 1 × 0,5 donne 0, elle
  // change ; aucun changement, aucune charge.
  run.same("arrondi : un pas qui change la valeur arrondie compte", ["halfCharge"], modifyStat([instance("halfCharge", { remaining: 2 })], statuses, "speed", 1).changed);
  // En partie : la Vitesse et la Masse de la grosse bille divisées, pas celles de la petite.
  const made = fixtureRules(types, statuses);
  const resolved = (marble) =>
    mustReduce(made, marblesPlayState(made, { triangle: triangleOf(placed(marble), null, null), statuses: gravel }), { type: "resolve" }).events.find((event) => event.type === "effect");
  run.same("en partie : le calot filtré, Vitesse et Masse divisées", [1, 1], ((effect) => [effect.speedDelta, effect.massDelta])(resolved("big")));
  run.same("en partie : l'autre bille, intacte", [3, 3], ((effect) => [effect.speedDelta, effect.massDelta])(resolved("small")));
  // Une valeur produite par un statut (sa réaction) n'a pas de bille source.
  const reacted = mustReduce(made, marblesPlayState(made, { hand: inHand(["big"]), statuses: [...gravel, instance("thrownBoost", { remaining: null })] }), toApex);
  run("en partie : la réaction d'un statut, sans source, intacte", 3, reacted.events.find((event) => event.type === "effect" && event.trigger === "statusReaction").speedDelta);
}

// LES VERROUS : une action du joueur refusée, avec son statut ; un déclencheur ou le
// pot réduits au silence, leurs compteurs immobiles ; jamais proposés aux joueurs
// automatiques ; la prévision en tient compte.
function checkLocks(run) {
  const refusedBehavior = (behavior) => caughtMessage(() => validateMarbleStatuses({ x: { stacking: "unique", duration: { kind: "game" }, behaviors: [behavior] } }));
  run("validation : verrou inconnu", true, refusedBehavior({ type: "lock", lock: "eject" }).includes("verrou inconnu"));
  run("validation : déclencheur inconnu", true, refusedBehavior({ type: "lock", lock: "trigger", trigger: "nope" }).includes("déclencheur inconnu"));
  run("validation : champ en trop", true, refusedBehavior({ type: "lock", lock: "swap", trigger: "flick" }) !== "");
  run("validation : un verrou de déclencheur valide", "", refusedBehavior({ type: "lock", lock: "trigger", trigger: "final" }));

  const made = fixtureRules();
  const play = (over, statuses) => ({ ...marblesPlayState(made, over), statuses });
  const lockedBy = (status) => [statusInstance(status, { remaining: status === "no_swap" ? 1 : null })];

  // L'échange.
  const swapState = play({ triangle: triangleOf(placed("aging_flick"), null, null) }, lockedBy("no_swap"));
  run("échange : refusé par le verrou", "swapLocked", made.swapRefusal(swapState));
  const swapped = made.reduce(swapState, { type: "swap", a: "leftBase", b: "apex" });
  run.same("échange : le réducteur refuse et nomme le statut", { ok: false, error: "swapLocked", lockedBy: { status: "no_swap", rule: false } }, { ok: swapped.ok, error: swapped.error, lockedBy: swapped.lockedBy });
  run("échange : jamais proposé", false, made.legalActions(swapState).some((action) => action.type === "swap"));
  const asRule = { ...swapState, statuses: [ruleInstance("no_replacement"), statusInstance("no_swap", { remaining: 1 })] };
  run("échange : un autre verrou ne l'interdit pas", "swapLocked", made.swapRefusal(asRule));
  run("échange : sans verrou, permis", null, made.swapRefusal({ ...swapState, statuses: [] }));

  // Le remplacement.
  const placeState = play({ hand: inHand(["hit_polish"]), triangle: triangleOf(placed("aging_flick"), null, null) }, [ruleInstance("no_replacement")]);
  run("remplacement : refusé sur un emplacement occupé", "replacementLocked", made.placeRefusal(placeState, 0, "leftBase"));
  run("remplacement : une pose sur un vide permise", null, made.placeRefusal(placeState, 0, "apex"));
  run.same("remplacement : le refus nomme la règle", { status: "no_replacement", rule: true }, made.reduce(placeState, { type: "place", handIndex: 0, slot: "leftBase" }).lockedBy);
  run("remplacement : jamais proposé", false, made.legalActions(placeState).some((action) => action.type === "place" && action.slot === "leftBase"));
  run("un autre refus ne nomme aucun statut", undefined, made.reduce(placeState, { type: "draw" }).lockedBy);

  // Un déclencheur désactivé : l'évènement réel a lieu, l'effet ne joue pas, son
  // compteur ne bouge pas, rien n'y réagit (la bille du pot qui écoute les chiquenaudes).
  const flickState = play({ hand: inHand(["fragile"]), pot: ["all_rounder"] }, lockedBy("no_flick"));
  const thrown = mustReduce(made, flickState, toApex);
  run("déclencheur désactivé : la bille est lancée", true, thrown.events.some((event) => event.type === "flick"));
  run("déclencheur désactivé : son effet ne joue pas", false, thrown.events.some((event) => event.type === "effect" && event.trigger === "flick"));
  run("déclencheur désactivé : son compteur immobile", 0, thrown.state.tally.flick.game);
  run("déclencheur désactivé : les billes lancées comptent", 1, thrown.state.tally.thrownMarbles.game);
  run("déclencheur désactivé : rien n'y réagit", false, thrown.events.some((event) => event.type === "pocketReaction"));
  const free = mustReduce(made, { ...flickState, statuses: [] }, toApex);
  run("sans verrou : l'effet joue et le pot réagit", true, free.events.some((event) => event.type === "effect" && event.trigger === "flick") && free.events.some((event) => event.type === "pocketReaction"));
  run("prévision : le déclencheur désactivé compris", true, forecastMatches(made, flickState, toApex));

  // Le pot inactif : ni étape du pot, ni entrée, ni réaction ; les billes y entrent.
  const potState = play({ triangle: triangleOf(placed("aging_flick"), null, null), pot: ["final_pocket", "base_pocket"] }, lockedBy("no_pot"));
  const resolved = mustReduce(made, potState, { type: "resolve" });
  run("pot inactif : aucune étape du pot", false, resolved.events.some((event) => event.type === "potResolution"));
  run("pot inactif : aucun compteur", 0, resolved.state.tally.pocketResolution.game);
  run("pot actif : son étape", true, mustReduce(made, { ...potState, statuses: [] }, { type: "resolve" }).events.some((event) => event.type === "potResolution"));
  const pocketing = fixtureRules(withSizes({ pocketer: { flick: [{ action: "pocket", target: "firstInHand" }] }, entrant: { pocketed: { entry: [speed(5)] } } }));
  const enteringState = { ...marblesPlayState(pocketing, { hand: inHand(["pocketer", "entrant"]) }), statuses: lockedBy("no_pot") };
  const entering = mustReduce(pocketing, enteringState, toApex);
  run("pot inactif : la bille y entre", true, entering.state.pot.includes("entrant"));
  run("pot actif : son effet à l'entrée", true, mustReduce(pocketing, { ...enteringState, statuses: [] }, toApex).events.some((event) => event.type === "effect" && event.trigger === "pocketEntry"));
  run("pot inactif : pas d'effet à l'entrée", false, entering.events.some((event) => event.type === "effect" && event.trigger === "pocketEntry"));
  run("prévision : le pot inactif compris", true, forecastMatches(made, potState, null));
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
    "Impact : additions puis multiplications, plancher à la fin ; un pas qui ne change rien, plancher compris, ne se dit pas",
    { impact: 0, next: "valueModified", contributions: [{ status: "impact_tax", before: 3, after: 0 }] },
    (() => {
      const index = taxed.events.findIndex((event) => event.type === "impact");
      return { impact: taxed.events[index].impact, next: taxed.events[index + 1].type, contributions: taxed.events[index + 1].contributions };
    })()
  );
  const charged0 = resolved(triangleOf(null, placed("gainer"), null), [instance("impact_tax", { remaining: null }), instance("impact_charge")]);
  run("charge : ×2 sur un Impact déjà ramené à 0 ne change rien, la charge reste", 1, charged0.state.statuses.find((one) => one.status === "impact_charge").remaining);
  run("Impact : Coup double reçu en résolution compte ce tour", 4, impact([], triangleOf(null, placed("doubler"), null)));

  // La prévision : les statuts agissent sur la copie, jamais sur l'état.
  const state = { ...game({ triangle: triangleOf(placed("gainer"), placed("gainer"), null) }), statuses: [instance("gain_charge")] };
  run("prévision : la charge comptée", 9, rules.forecast(state).speed);
  run("prévision : la charge reste dans l'état", 1, state.statuses[0].remaining);
  run("prévision = réel : une charge", true, matches(state, null));
  run("prévision = réel : un statut reçu à la pose, puis la résolution", true, matches(game({ hand: inHand(["chargeGiver"]), triangle: triangleOf(placed("gainer"), null, null) }), toApex));
  run("prévision = réel : Coup double reçu en résolution", true, matches(game({ triangle: triangleOf(null, placed("doubler"), placed("gainer")) }), null));
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
