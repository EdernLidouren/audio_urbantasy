// Vérifications du core — domaine « marbles-choice ». Les CIBLES AU CHOIX du jeu
// des billes (marbles/core/marbles.js, marbles/core/effects.js, doc/marbles.md) : choix
// simple et multiple, éligibilité, suspension et reprise par rejeu, refus pendant
// l'attente, sérialisation, validation ; et l'action Éjecter. Sur la table de billes
// des vérifications (marbles/checks/fixtures/marbles.js). Lancées par
// core/checks/index.js/runChecks (`node tools/run-checks.js marbles-choice`).

import { throws } from "../../lib/check.js";
import { legalActions } from "../core/marbles.js";
import { LARGE, MEDIUM, SMALL } from "../config/values.js";
import { printedStat } from "../core/effects.js";
import { CHOICELESS_TYPES, fixtureRules } from "./fixtures/marbles.js";
import { caughtMessage, deepFreeze, fabricatedRules, handIds, inHand, marblesPlayState, mustReduce, placed, triangleOf, validateTable } from "./helpers.js";

// Les règles de la table des vérifications (marbles/checks/fixtures/marbles.js).
const rules = fixtureRules();
// La même table sans cible au choix ni Éjecter.
const fixedRules = fixtureRules(CHOICELESS_TYPES);

// Partie en cours de tour : le tour 2 par défaut, sac vide. `over` remplace ce que
// le test veut fixer.
function playState(over = {}) {
  return marblesPlayState(rules, over);
}

// Applique une action qui doit passer (helpers.js/mustReduce). `marbles` : les
// règles à appliquer, celles de la table des vérifications par défaut ; ou une table
// fabriquée, dont on fait les règles.
function apply(state, action, marbles = rules) {
  return mustReduce(typeof marbles.reduce === "function" ? marbles : fabricatedRules(marbles), state, action);
}

export default function checkMarblesChoice(run) {
  run.section("cibles au choix", checkChoices);
  run.section("Éjecter", checkEject);
}

// CIBLES AU CHOIX : choix simple et multiple, modes, éligibilité, suspension et
// reprise par rejeu, refus pendant l'attente, sérialisation, validation. Billes
// fabriquées pour isoler chaque règle, puis les billes de test.
function checkChoices(run) {
  const choose = (zones, extra = {}) => ({ type: "choice", zones, pick: "marble", count: 1, ...extra });
  const table = {
    plain: { apex: [{ action: "speed", amount: 1 }] },
    sturdy: { maxWear: 9 },
    // Tic : Polissage 1 à 2 billes actives au choix, obligatoire.
    twoPolish: { hit: [{ action: "polish", amount: 1, target: choose(["triangle"], { count: 2 }) }] },
    // Tic : Polissage 1 à 3 billes actives au choix (jamais assez de cibles ici).
    threePolish: { hit: [{ action: "polish", amount: 1, target: choose(["triangle"], { count: 3 }) }] },
    // Tic : Polissage 1, jusqu'à 2 billes actives au choix.
    upToPolish: { hit: [{ action: "polish", amount: 1, target: choose(["triangle"], { count: 2, upTo: true }) }] },
    // Tic : Empocher une bille, de la main ou active, au choix.
    anyPocket: { hit: [{ action: "pocket", target: choose(["hand", "triangle"]) }] },
    // Base : Vitesse +2 à une bille active au choix (un bonus de phase).
    booster: { base: [{ action: "speed", amount: 2, target: choose(["triangle"]) }] },
    // Final : Polissage 1 à une bille active au choix, et la même, cible fixe.
    finalChooser: { maxWear: 1, final: [{ action: "polish", amount: 1, target: choose(["triangle"]) }] },
    finalFixed: { maxWear: 1, final: [{ action: "polish", amount: 1, target: "rightBase" }] },
    // En poche, à chaque chiquenaude : Fêlure 1 au choix, et la même, cible fixe.
    potChooser: { pocketed: { flick: [{ action: "crack", amount: 1, target: choose(["triangle"]) }] } },
    potFixed: { pocketed: { flick: [{ action: "crack", amount: 1, target: "leftBase" }] } },
    flicker: { flick: [{ action: "speed", amount: 1 }] },
  };
  const made = fabricatedRules(table);
  const reduce = (state, action) => made.reduce(state, action);
  const answer = (state, slot) => reduce(state, { type: "choose", target: { zone: "triangle", slot } });
  const slots = (pending) => pending.eligible.map((target) => target.slot ?? `main${target.index}`);
  const types = (events) => events.map((event) => event.type);

  // Choix multiple obligatoire : une cible choisie n'est plus éligible ; l'action
  // s'applique ensuite, dans l'ordre des choix ; arrêt à N.
  const triple = playState({ hand: inHand(["twoPolish"]), triangle: triangleOf(placed("sturdy", 3), placed("sturdy", 3), placed("plain")) });
  const opened = reduce(triple, { type: "place", handIndex: 0, slot: "apex" });
  run("choix : la pose s'arrête sur le choix", true, opened.ok && opened.state.pendingChoice !== null);
  run.same("choix : les billes actives dans l'ordre horaire, la posée comprise", ["rightBase", "leftBase", "apex"], slots(opened.state.pendingChoice));
  run.same(
    "choix : la question en attente",
    { action: "polish", amount: 1, zones: ["triangle"], pick: "marble", count: 2, upTo: false, remaining: 2, chosen: [] },
    (({ action, amount, zones, pick, count, upTo, remaining, chosen }) => ({ action, amount, zones, pick, count, upTo, remaining, chosen }))(opened.state.pendingChoice)
  );
  run("choix : le journal s'arrête au choix ouvert", "choice", opened.events.at(-1).type);
  const first = answer(opened.state, "rightBase");
  run.same("choix : la cible choisie n'est plus éligible", ["leftBase", "apex"], slots(first.state.pendingChoice));
  run("choix : encore une", 1, first.state.pendingChoice.remaining);
  run.same("choix : chaque réponse rend la suite du journal seulement", ["chosen"], types(first.events));
  const second = answer(first.state, "leftBase");
  run("choix : fini à N choix, plus rien n'attend", null, second.state.pendingChoice);
  run.same(
    "choix : appliqué dans l'ordre des choix",
    ["rightBase", "leftBase"],
    second.events.filter((event) => event.type === "polished").map((event) => event.slot)
  );
  run.same("choix : la fin de la sélection notée", { reason: "count", chosen: 2 }, (({ reason, chosen }) => ({ reason, chosen }))(second.events.find((event) => event.type === "choiceEnded")));
  run("choix : les lancers comptés une seule fois", 1, second.state.throwsUsed);

  // Pas assez de cibles : arrêt quand plus rien n'est éligible.
  const few = reduce(playState({ hand: inHand(["threePolish"]), triangle: triangleOf(placed("sturdy", 3), null, placed("plain")) }), { type: "place", handIndex: 0, slot: "apex" });
  const fewDone = answer(answer(few.state, "leftBase").state, "apex");
  run("choix, pas assez de cibles : arrêt quand plus rien n'est éligible", null, fewDone.state.pendingChoice);
  run("choix, pas assez de cibles : noté", "exhausted", fewDone.events.find((event) => event.type === "choiceEnded").reason);

  // Aucune cible dès le départ : rien ne s'ouvre, le journal le note.
  const none = reduce(playState({ hand: inHand(["anyPocket"]), triangle: triangleOf(null, null, placed("plain")) }), { type: "place", handIndex: 0, slot: "apex" });
  run("choix, aucune cible… : la posée elle-même est éligible", true, none.state.pendingChoice !== null);
  const empty = reduce(playState({ hand: inHand(["finalChooser"]), bag: ["plain"], triangle: triangleOf(null, null, placed("finalChooser")) }), { type: "resolve" });
  run("choix, aucune cible : aucune attente", null, empty.state.pendingChoice);
  run("choix, aucune cible : noté au journal", true, empty.events.some((event) => event.type === "targetEmpty" && event.target === "choice"));
  run("choix, aucune cible : aucun choix ouvert", false, empty.events.some((event) => event.type === "choice"));

  // « Jusqu'à N » : Terminer, à zéro choix ou après un ; refusé en mode obligatoire.
  const upTo = reduce(playState({ hand: inHand(["upToPolish"]), triangle: triangleOf(placed("sturdy", 3), null, placed("plain")) }), { type: "place", handIndex: 0, slot: "apex" });
  const zero = reduce(upTo.state, { type: "choose", done: true });
  run("jusqu'à N : Terminer à zéro choix", null, zero.state.pendingChoice);
  run("jusqu'à N : rien poli", false, zero.events.some((event) => event.type === "polished"));
  run("jusqu'à N : terminé, noté", "done", zero.events.find((event) => event.type === "choiceEnded").reason);
  const one = reduce(answer(upTo.state, "leftBase").state, { type: "choose", done: true });
  run.same("jusqu'à N : Terminer après un choix", ["leftBase"], one.events.filter((event) => event.type === "polished").map((event) => event.slot));
  run("obligatoire : Terminer refusé", "choiceRequired", reduce(opened.state, { type: "choose", done: true }).error);
  run.same("jusqu'à N : Terminer parmi les actions légales", { type: "choose", done: true }, legalActions(upTo.state).at(-1));
  run.same("obligatoire : seulement les cibles", ["choose", "choose", "choose"], legalActions(opened.state).map((action) => action.type));

  // Pendant l'attente : toute autre action refusée ; une cible non éligible refusée ;
  // « choisir » sans choix en attente refusé.
  for (const action of [{ type: "resolve" }, { type: "draw" }, { type: "place", handIndex: 0, slot: "leftBase" }, { type: "swap", a: "leftBase", b: "apex" }]) {
    run(`attente : ${action.type} refusé`, "choicePending", reduce(first.state, action).error);
  }
  run("attente : une cible déjà choisie refusée", "invalidChoice", answer(first.state, "rightBase").error);
  run("attente : une zone hors du choix refusée", "invalidChoice", reduce(first.state, { type: "choose", target: { zone: "hand", index: 0 } }).error);
  run("hors attente : choisir refusé", "noChoicePending", reduce(triple, { type: "choose", done: true }).error);

  // La main et le triangle : la bille de la main, par sa place.
  const both = reduce(playState({ hand: inHand(["anyPocket", "plain", "sturdy"]), triangle: triangleOf(null, null, placed("plain")) }), { type: "place", handIndex: 0, slot: "apex" });
  run.same("main et triangle : les billes de la main puis les actives", ["main0", "main1", "apex"], slots(both.state.pendingChoice));
  const fromHand = reduce(both.state, { type: "choose", target: { zone: "hand", index: 1 } });
  run.same("main : la bille choisie au pot, l'autre reste", { pot: ["sturdy"], hand: ["plain"] }, { pot: fromHand.state.pot, hand: handIds(fromHand.state) });

  // Règle des cibles : un bonus ne va qu'à une phase à venir. En base droite, la
  // première phase, pendant la résolution : la base droite (en cours) n'est pas
  // éligible.
  const boosting = reduce(playState({ triangle: triangleOf(placed("plain"), placed("booster"), placed("plain")) }), { type: "resolve" });
  run.same("éligibilité : un bonus, seulement les phases à venir", ["leftBase", "apex"], slots(boosting.state.pendingChoice));
  const boosted = answer(boosting.state, "apex");
  // La pointe ordinaire : Vitesse +1, plus le bonus de 2 ; la base gauche ne produit rien.
  run("éligibilité : le bonus compté à la phase choisie", 1 + 2, boosted.events.find((event) => event.type === "impact").speed);

  // Reprise exacte : un choix équivaut à la même cible fixe. Au milieu d'une
  // résolution (un Final), puis dans une réaction du pot (pendant la pose).
  // Les évènements du choix à part, et la clause imprimée (au choix ou fixe) mise de
  // côté : tout le reste doit être identique.
  const withoutChoice = (events) =>
    events.filter((event) => !["choice", "chosen", "choiceEnded"].includes(event.type)).map(({ operations, ...event }) => event);
  const strip = (events) => JSON.stringify(withoutChoice(events)).replaceAll("finalChooser", "X").replaceAll("finalFixed", "X").replaceAll("potChooser", "X").replaceAll("potFixed", "X");
  const resolving = (marble) => playState({ bag: ["plain"], triangle: triangleOf(placed("plain"), placed("sturdy", 3), placed(marble)) });
  const suspended = reduce(resolving("finalChooser"), { type: "resolve" });
  run("reprise, résolution : suspendue au Final", "final", suspended.state.pendingChoice.by.trigger);
  run("reprise, résolution : l'Impact n'a pas encore eu lieu", false, suspended.events.some((event) => event.type === "impact"));
  const resumed = answer(suspended.state, "rightBase");
  const fixed = reduce(resolving("finalFixed"), { type: "resolve" });
  run("reprise, résolution : même journal qu'une cible fixe", strip(fixed.events), strip([...suspended.events, ...resumed.events]));
  run("reprise, résolution : même état qu'une cible fixe", JSON.stringify(fixed.state).replaceAll("finalFixed", "X"), JSON.stringify(resumed.state).replaceAll("finalChooser", "X"));
  const reacting = (marble) => playState({ hand: inHand(["flicker"]), pot: [marble], triangle: triangleOf(placed("sturdy"), null, null) });
  const inPot = reduce(reacting("potChooser"), { type: "place", handIndex: 0, slot: "apex" });
  run("reprise, réaction du pot : suspendue à la réaction", "pocketReaction", inPot.state.pendingChoice.by.trigger);
  run("reprise, réaction du pot : la bille lancée pas encore posée", false, inPot.events.some((event) => event.type === "placed"));

  // EN TRANSIT : la bille en cours de lancer, dans aucune zone, jamais une cible,
  // mais connue du choix ouvert pendant son trajet, avec l'emplacement qu'elle vise.
  run.same("transit : la bille en cours de lancer, vers son emplacement", [{ kind: "thrown", marble: "flicker", slot: "apex" }], inPot.state.pendingChoice.inTransit);
  run("transit : ni en main ni sur le triangle", false, inPot.state.hand.some((held) => held.marble === "flicker") || Object.values(inPot.state.triangle).some((slot) => slot?.marble === "flicker"));
  run("transit : jamais une cible", false, inPot.state.pendingChoice.eligible.some((target) => target.marble === "flicker"));
  run.same("transit : un aller-retour JSON ne change rien", inPot.state, JSON.parse(JSON.stringify(inPot.state)));
  run.same("transit : aucune au Tic, la bille déjà posée", [], opened.state.pendingChoice.inTransit);
  run.same("transit : pendant un Final, la bille en partance, depuis son emplacement", [{ kind: "leaving", marble: "finalChooser", slot: "apex" }], suspended.state.pendingChoice.inTransit);
  run("transit : en partance, jamais une cible", false, suspended.state.pendingChoice.eligible.some((target) => target.marble === "finalChooser"));
  const reachedChoice = (state) => state.pendingChoice?.inTransit ?? null;
  run("transit : arrivée, plus rien n'attend", null, reachedChoice(answer(inPot.state, "leftBase").state));
  const potResumed = answer(inPot.state, "leftBase");
  const potFixed = reduce(reacting("potFixed"), { type: "place", handIndex: 0, slot: "apex" });
  run("reprise, réaction du pot : même journal qu'une cible fixe", strip(potFixed.events), strip([...inPot.events, ...potResumed.events]));

  // Sérialisable : un aller-retour JSON de l'état en attente ne change rien.
  const roundTrip = JSON.parse(JSON.stringify(first.state));
  run.same("sérialisation : l'état en attente fait l'aller-retour", first.state, roundTrip);
  run.same("sérialisation : la reprise depuis la copie est la même", answer(first.state, "leftBase"), answer(roundTrip, "leftBase"));
  const frozen = deepFreeze(structuredClone(first.state));
  run("pureté : l'état en attente reçu n'est pas modifié", true, answer(frozen, "leftBase").ok);

  // Les billes de test : hit_pocket (main), hit_polish (triangle), fragile
  // (jusqu'à 2, pendant la résolution).
  const hitPocket = rules.reduce(playState({ hand: inHand(["hit_pocket", "aging_flick", "final_pocket"]), triangle: triangleOf(null, null, placed("aging_flick")) }), { type: "place", handIndex: 0, slot: "apex" });
  run.same("hit_pocket : les billes de la main", ["aging_flick", "final_pocket"], hitPocket.state.pendingChoice.eligible.map((target) => target.marble));
  const pocketedFinalPocket = rules.reduce(hitPocket.state, { type: "choose", target: { zone: "hand", index: 1 } });
  run.same("hit_pocket : final_pocket choisie au pot", ["final_pocket"], pocketedFinalPocket.state.pot);
  const fragile = rules.reduce(playState({ bag: ["aging_flick"], triangle: triangleOf(placed("aging_flick"), placed("final_pocket", 1), placed("fragile", 1)) }), { type: "resolve" });
  run.same("fragile : son Final, jusqu'à 2 billes actives", { upTo: true, count: 2, trigger: "final" }, { upTo: fragile.state.pendingChoice.upTo, count: fragile.state.pendingChoice.count, trigger: fragile.state.pendingChoice.by.trigger });

  // Validation : les combinaisons impossibles refusées au chargement.
  const valid = (clause, field = "hit") => !throws(() => validateTable({ x: { [field]: [clause] } }));
  run("validation, choix : Polissage au choix sur le triangle permis", true, valid({ action: "polish", amount: 1, target: choose(["triangle"]) }));
  run("validation, choix : Empocher dans la main permis", true, valid({ action: "pocket", target: choose(["hand"]) }));
  run("validation, choix : Polissage dans la main refusé", false, valid({ action: "polish", amount: 1, target: choose(["hand"]) }));
  run("validation, choix : le pot pas encore disponible", false, valid({ action: "pocket", target: choose(["pot"]) }));
  run("validation, choix : zone inconnue refusée", false, valid({ action: "pocket", target: choose(["nowhere"]) }));
  run("validation, choix : un emplacement vide n'a rien à polir", false, valid({ action: "polish", amount: 1, target: choose(["triangle"], { pick: "slot" }) }));
  run("validation, choix : nombre nul refusé", false, valid({ action: "polish", amount: 1, target: choose(["triangle"], { count: 0 }) }));
  run("validation, choix : champ inconnu refusé", false, valid({ action: "polish", amount: 1, target: choose(["triangle"], { extra: 1 }) }));
  run("validation, choix : la Pioche ne se choisit pas", false, valid({ action: "draw", amount: 1, target: choose(["triangle"]) }));
  run("validation, choix : bonus au choix pendant la pose permis", true, valid({ action: "speed", amount: 1, target: choose(["triangle"]) }));
  run("validation, choix : bonus au choix au Final refusé (plus aucune phase)", false, valid({ action: "speed", amount: 1, target: choose(["triangle"]) }, "final"));
  run("validation, choix : bonus au choix en pointe refusé (plus aucune phase après)", false, valid({ action: "speed", amount: 1, target: choose(["triangle"]) }, "apex"));
  run("validation, choix : bonus au choix en base permis (la pointe vient après)", true, valid({ action: "speed", amount: 1, target: choose(["triangle"]) }, "base"));
}

// ÉJECTER : chaque forme de cible, l'ordre (Éjection, retrait, défausse), ni Tic ni
// Final, la phase sautée, la référence des conditions de calibre, les compteurs et
// les réactions du pot, flick_strike qui vide l'emplacement visé.
function checkEject(run) {
  const journal = (events) =>
    events.map((event) => {
      if (event.type === "effect") return `effect:${event.trigger}:${event.marble}`;
      if (event.type === "removed" || event.type === "discarded") return `${event.type}:${event.marble}:${event.cause}`;
      if (event.type === "targetEmpty") return `targetEmpty:${event.action}:${event.target ?? event.slot}`;
      return event.marble === undefined ? event.type : `${event.type}:${event.marble}`;
    });
  const table = {
    plain: { apex: [{ action: "speed", amount: 1 }], base: [{ action: "speed", amount: 1 }] },
    small: { size: SMALL, apex: [{ action: "speed", amount: 1 }] },
    smallKnock: { size: SMALL, knockout: [{ action: "speed", amount: 2 }] },
    large: { size: LARGE },
    // Éjection : Vitesse +5 si la bille « posée » (ici, celle qui éjecte) est plus grosse.
    sizeKnock: { size: MEDIUM, knockout: [{ action: "speed", amount: 5, when: { type: "relativeSize", marble: "placed", is: "larger" } }] },
    // Base : s'éjecter elle-même.
    selfEjector: { base: [{ action: "eject" }] },
    // Tic : Éjecter la pointe ; et toutes les minibilles actives ; et toutes.
    apexEjector: { hit: [{ action: "eject", target: "apex" }] },
    smallEjector: { size: LARGE, hit: [{ action: "eject", target: { type: "all", filters: [{ type: "size", size: SMALL }] } }] },
    allEjector: { base: [{ action: "eject", target: { type: "all" } }] },
    chooserEjector: { hit: [{ action: "eject", target: { type: "choice", zones: ["triangle"], pick: "marble", count: 2 } }] },
    // Base gauche : Éjecter la pointe, avant sa phase.
    earlyEjector: { base: [{ action: "eject", target: "apex" }] },
    wornOut: { maxWear: 1, apex: [{ action: "speed", amount: 1 }], final: [{ action: "speed", amount: 9 }] },
    // Son Éjection l'éjecterait à nouveau : sans effet, pas de boucle.
    // Son Éjection vise son propre emplacement : à l'exécution, sans effet.
    loopKnock: { knockout: [{ action: "eject", target: "apex" }] },
    onEjected: { pocketed: { ejectedMarbles: [{ action: "mass", amount: 1 }] } },
  };
  const made = fabricatedRules(table);
  const go = (state, action) => apply(state, action, made);
  const toApex = { type: "place", handIndex: 0, slot: "apex" };
  const toLeft = { type: "place", handIndex: 0, slot: "leftBase" };

  // Un emplacement : le départ de la visée, son Éjection en partance, son arrivée à
  // la défausse ; ni Tic ni Final.
  const fixed = go(playState({ hand: inHand(["apexEjector"]), triangle: triangleOf(placed("plain"), null, placed("smallKnock")) }), toLeft);
  run.same(
    "éjecter, emplacement : départ, Éjection, défausse",
    ["eject:smallKnock", "removed:smallKnock:eject", "knockout:smallKnock", "effect:knockout:smallKnock", "discarded:smallKnock:eject"],
    journal(fixed.events).slice(journal(fixed.events).indexOf("eject:smallKnock"))
  );
  run("éjecter : la pointe vidée", null, fixed.state.triangle.apex);
  run("éjecter : la bille à la défausse", "plain,smallKnock", fixed.state.discard.join());
  run("éjecter : ni Final ni Tic de plus", 1, fixed.events.filter((event) => event.type === "hit").length);
  run("éjecter : pas de Final", false, fixed.events.some((event) => event.type === "final"));
  run("éjecter : son Éjection compte au tour (Vitesse +2)", 2, fixed.state.speed);
  run.same("éjecter : l'Éjection provoquée porte l'éjection", { trigger: "hit", slot: "leftBase", marble: "apexEjector" }, fixed.events.find((event) => event.trigger === "knockout").ejectedBy);

  // La bille elle-même, sur le triangle ; refusée hors du triangle.
  const self = go(playState({ bag: ["plain"], triangle: triangleOf(placed("selfEjector"), null, placed("plain")) }), { type: "resolve" });
  run("éjecter soi-même : quitte le triangle pendant sa phase", true, self.events.some((event) => event.type === "removed" && event.marble === "selfEjector" && event.cause === "eject"));
  const refused = (field, clause = { action: "eject" }) => throws(() => validateTable({ x: { [field]: [clause] } }));
  run("validation, éjecter soi-même : dans une Chiquenaude refusé", true, refused("flick"));
  run("validation, éjecter soi-même : dans un Final refusé", true, refused("final"));
  run("validation, éjecter soi-même : à l'Éveil refusé", true, refused("awaken"));
  run("validation, éjecter soi-même : en poche refusé", true, throws(() => validateTable({ x: { pocketed: { entry: [{ action: "eject" }] } } })));
  run("validation, éjecter soi-même : au Tic permis", false, refused("hit"));
  run("validation, éjecter soi-même : dans sa propre Éjection refusé", true, refused("knockout"));
  run("validation, éjecter soi-même : le message dit pourquoi, elle est en partance", true, /en partance/.test(caughtMessage(() => validateTable({ x: { knockout: [{ action: "eject" }] } }))));
  run("validation, éjecter un emplacement dans son Éjection permis", false, refused("knockout", { action: "eject", target: "apex" }));
  run("validation, éjecter : un montant refusé", true, refused("hit", { action: "eject", amount: 1, target: "apex" }));
  run("validation, éjecter : au choix dans la main refusé", true, refused("hit", { action: "eject", target: { type: "choice", zones: ["hand"], pick: "marble", count: 1 } }));
  run("validation, « toutes » : un filtre inconnu refusé", true, refused("hit", { action: "eject", target: { type: "all", filters: [{ type: "matter", matter: "hit_polish" }] } }));
  run("validation, « toutes » : un calibre inconnu refusé", true, refused("hit", { action: "eject", target: { type: "all", filters: [{ type: "size", size: 9 }] } }));
  run("validation, « toutes » : deux filtres de calibre refusés", true, refused("hit", { action: "eject", target: { type: "all", filters: [{ type: "size", size: SMALL }, { type: "size", size: LARGE }] } }));
  run("validation, « toutes » : pour une autre action refusé", true, refused("hit", { action: "polish", amount: 1, target: { type: "all" } }));
  // Une condition sur une action sans montant : elle vaudrait toujours 0.
  const printedOn = (stat) => refused("hit", { action: "speed", amount: 1, when: { type: "printedStat", slot: "apex", stat, atLeast: 1 } });
  run("validation, condition imprimée : sur Empocher refusée", true, printedOn("pocket"));
  run("validation, condition imprimée : sur Éjecter refusée", true, printedOn("eject"));
  run("validation, condition imprimée : sur la Fêlure permise", false, printedOn("crack"));

  // Un choix pendant une Éjection ne propose jamais l'emplacement de la bille qui part.
  const leaving = fabricatedRules({
    k: { knockout: [{ action: "eject", target: { type: "choice", zones: ["triangle"], pick: "marble", count: 1 } }] },
    p: {},
  });
  const replacing = leaving.reduce(
    { ...leaving.createGame(1, { bag: ["p"] }), stage: "play", bag: [], hand: [{ marble: "p", turnsInHand: 0 }], triangle: { leftBase: { marble: "k", wear: 0 }, rightBase: { marble: "p", wear: 0 }, apex: null } },
    { type: "place", handIndex: 0, slot: "leftBase" }
  ).state;
  run.same("choix pendant une Éjection : l'emplacement de la bille qui part n'est pas éligible", ["rightBase"], replacing.pendingChoice.eligible.map((target) => target.slot));
  run("validation, « toutes » : sans filtre permis", false, refused("hit", { action: "eject", target: { type: "all" } }));

  // Toutes les minibilles actives : dans l'ordre horaire, seulement elles.
  const smalls = go(
    playState({ hand: inHand(["smallEjector"]), triangle: triangleOf(placed("small"), placed("plain"), placed("smallKnock")) }),
    { type: "place", handIndex: 0, slot: "rightBase" }
  );
  run.same("éjecter toutes les minibilles : dans l'ordre horaire", ["small", "smallKnock"], smalls.events.filter((event) => event.type === "eject").map((event) => event.marble));
  run.same("éjecter toutes les minibilles : la bille normale reste", "smallEjector", smalls.state.triangle.rightBase.marble);
  // Toutes : la bille elle-même comprise, sur le triangle.
  const everyone = go(playState({ bag: ["plain"], triangle: triangleOf(placed("allEjector"), placed("plain"), placed("plain")) }), { type: "resolve" });
  run.same("éjecter toutes : chaque bille active, elle comprise, dans l'ordre horaire", ["rightBase", "leftBase", "apex"], everyone.events.filter((event) => event.type === "eject").map((event) => event.slot));
  // Aucune bille visée : sans effet, noté.
  const noneSmall = go(playState({ hand: inHand(["smallEjector"]), triangle: triangleOf(placed("plain"), null, placed("plain")) }), toApex);
  run("éjecter toutes les minibilles : aucune, noté", true, journal(noneSmall.events).includes("targetEmpty:eject:all"));

  // Au choix : dans l'ordre de sélection.
  const choosing = go(playState({ hand: inHand(["chooserEjector"]), triangle: triangleOf(placed("plain"), placed("small"), placed("plain")) }), toApex);
  const first = made.reduce(choosing.state, { type: "choose", target: { zone: "triangle", slot: "rightBase" } });
  const second = made.reduce(first.state, { type: "choose", target: { zone: "triangle", slot: "leftBase" } });
  run.same("éjecter au choix : dans l'ordre de sélection", ["rightBase", "leftBase"], second.events.filter((event) => event.type === "eject").map((event) => event.slot));

  // Cible vide.
  const empty = go(playState({ hand: inHand(["apexEjector"]), triangle: triangleOf(placed("plain"), null, null) }), toLeft);
  run("éjecter, emplacement vide : noté", true, journal(empty.events).includes("targetEmpty:eject:apex"));

  // Avant sa phase : la phase sautée, la bille dite retirée avant.
  const early = go(playState({ bag: ["plain"], triangle: triangleOf(placed("earlyEjector"), null, placed("wornOut")) }), { type: "resolve" });
  run.same("éjecter avant la phase : phase sautée", { type: "phaseSkipped", slot: "apex" }, early.events.find((event) => event.type === "phaseSkipped" && event.slot === "apex"));
  run("éjecter : pas de Final, même à l'usure maximale", false, early.events.some((event) => event.type === "final"));

  // La comparaison de calibre : la bille qui éjecte est la référence (« posée »).
  const bigger = go(playState({ hand: inHand(["smallEjector"]), triangle: triangleOf(placed("sizeKnock"), null, null) }), toApex);
  run("calibre : plus petite que la grosse qui l'éjecte… (pas de minibille visée)", 0, bigger.state.speed);
  const sizeTable = fabricatedRules({ ...table, bigEjector: { size: LARGE, hit: [{ action: "eject", target: "leftBase" }] }, smallEjectorFixed: { size: SMALL, hit: [{ action: "eject", target: "leftBase" }] } });
  const byBig = apply(playState({ hand: inHand(["bigEjector"]), triangle: triangleOf(placed("sizeKnock"), null, placed("plain")) }), toApex, sizeTable);
  run("calibre : éjectée par un calot, la condition « plus grosse » vaut", 5, byBig.events.find((event) => event.trigger === "knockout").speedDelta);
  const bySmall = apply(playState({ hand: inHand(["smallEjectorFixed"]), triangle: triangleOf(placed("sizeKnock"), null, placed("plain")) }), toApex, sizeTable);
  run("calibre : éjectée par une minibille, elle ne vaut pas", 0, bySmall.events.find((event) => event.trigger === "knockout").speedDelta);

  // Une Éjection qui viserait son propre emplacement : sans effet, pas de boucle.
  const loop = go(playState({ hand: inHand(["apexEjector"]), triangle: triangleOf(placed("plain"), null, placed("loopKnock")) }), toLeft);
  run("éjecter : une Éjection qui s'éjecte elle-même, sans boucle", false, loop.events.some((event) => event.type === "chainInterrupted"));
  run("éjecter : elle part une seule fois", 1, loop.events.filter((event) => event.type === "removed" && event.marble === "loopKnock").length);

  // Compteurs : billes éjectées, sorties du triangle, Éjection seulement avec l'effet,
  // Éjecter et sa quantité réelle ; la réaction du pot « à chaque bille éjectée ».
  const counted = go(
    playState({ hand: inHand(["smallEjector"]), pot: ["onEjected"], triangle: triangleOf(placed("small"), placed("large"), placed("smallKnock")) }),
    { type: "place", handIndex: 0, slot: "rightBase" }
  );
  const tally = (id) => counted.state.tally[id].turn;
  // La pose chasse le calot de la base droite (1), Éjecter les deux minibilles (2).
  run.same(
    "compteurs : éjectées (pose et Éjecter), sorties, Éjection (une seule a l'effet), Éjecter, quantité",
    { ejectedMarbles: 3, triangleExits: 3, knockout: 1, eject: 2, ejectQuantity: 2 },
    { ejectedMarbles: tally("ejectedMarbles"), triangleExits: tally("triangleExits"), knockout: tally("knockout"), eject: tally("eject"), ejectQuantity: tally("ejectQuantity") }
  );
  run("compteurs : la réaction du pot à chaque bille éjectée, pose comprise", 3, counted.events.filter((event) => event.type === "pocketReaction").length);
  run("compteurs : cible vide, un déclenchement, aucune bille", "1/0", `${noneSmall.state.tally.eject.turn}/${noneSmall.state.tally.ejectQuantity.turn}`);

  // flick_strike : posée en pointe sur une bille, sa Chiquenaude l'éjecte ; la pose se
  // poursuit comme sur un emplacement vide, ni Éjection par la pose ni Tic.
  const flickStrike = apply(playState({ hand: inHand(["flick_strike"]), triangle: triangleOf(null, null, placed("tally_flick")) }), toApex);
  run.same(
    "flick_strike : sa Chiquenaude éjecte la pointe, puis la pose sur l'emplacement vidé",
    ["flick:flick_strike", "effect:flick:flick_strike", "eject:tally_flick", "removed:tally_flick:eject", "knockout:tally_flick", "effect:knockout:tally_flick", "discarded:tally_flick:eject", "placed:flick_strike"],
    journal(flickStrike.events)
  );
  run("flick_strike : ni Tic", false, flickStrike.events.some((event) => event.type === "hit"));
  run("flick_strike : l'Éjection de tally_flick compte (Vitesse +3)", 3, flickStrike.state.speed);
  // one_shot : son Final éjecte toutes les minibilles actives, tally_flick y joue son Éjection.
  const oneShot = apply(playState({ bag: ["aging_flick"], triangle: triangleOf(placed("tally_flick"), placed("aging_flick"), placed("one_shot")) }), { type: "resolve" });
  run.same("one_shot : son Final éjecte tally_flick, seule minibille", ["tally_flick"], oneShot.events.filter((event) => event.type === "eject").map((event) => event.marble));
  run("one_shot : tally_flick joue son Éjection", true, oneShot.events.some((event) => event.trigger === "knockout" && event.marble === "tally_flick" && event.speedDelta === 3));
}
