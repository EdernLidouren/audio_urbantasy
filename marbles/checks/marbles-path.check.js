// Vérifications du core — domaine « marbles-path ». Le CHEMIN DES BILLES du jeu des
// billes (marbles/core/run.js/travel, doc/marbles.md, « Le chemin des billes ») et
// ce qui s'y branche : la Chute, déclencheur d'arrivée à la défausse, et les
// actions qui déplacent une bille (Défausser, Rebond, Ramasser). Sur des billes
// fabriquées, pour isoler chaque règle. Lancées par
// core/checks/index.js/runChecks (`node tools/run-checks.js marbles-path`).

import { throws } from "../../lib/check.js";
import { LARGE, SMALL } from "../config/values.js";
import { readForecast } from "../core/forecast.js";
import { fabricatedRules, inHand, marbleCount, marblesPlayState, mustReduce, placed, validateTable } from "./helpers.js";
import { placeRefusal } from "../core/marbles.js";

// La prévision (sans ce qui n'existe qu'à l'aveugle) égale-t-elle le réel, lu de la
// même façon ? `action` : null pour le triangle actuel.
function forecastMatches(rules, state, action) {
  const real = action === null ? { state, events: [] } : mustReduce(rules, state, action);
  const resolved = mustReduce(rules, real.state, { type: "resolve" });
  const { uncertain, awakenPossible, ...predicted } = rules.forecast(state, action);
  return JSON.stringify(predicted) === JSON.stringify(readForecast(real.events, resolved.events, resolved.state));
}

// Le journal, une entrée par évènement : son type et sa bille, et ce qui distingue
// un départ (sa cause), une arrivée (d'où) ou un effet (son déclencheur).
function journal(events) {
  return events.map((event) => {
    if (event.type === "effect") return `effect:${event.trigger}:${event.marble}`;
    if (event.type === "removed") return `removed:${event.marble}:${event.cause}`;
    if (["discarded", "pocketed", "lost", "returned"].includes(event.type)) return `${event.type}:${event.marble}:${event.from}`;
    return event.marble === undefined ? event.type : `${event.type}:${event.marble}`;
  });
}

export default function checkMarblesPath(run) {
  run.section("Chute", checkDrop);
  run.section("Défausser", checkDiscard);
  run.section("Rebond", checkBounce);
  run.section("Ramasser", checkRetrieve);
}

// REBOND : vers la main, à 0 tour en main, sans Éveil ; depuis le triangle, ni Final
// ni Éjection, une phase sautée ; en partance, une redirection ; main pleine, la
// défausse et sa Chute ; rejouable dans le tour.
function checkBounce(run) {
  const choose = { type: "choice", zones: ["triangle"], pick: "marble", count: 1 };
  const table = {
    plain: { apex: [{ action: "speed", amount: 1 }] },
    // Éveil, Final, Éjection, Chute : aucun ne doit jouer sur un Rebond réussi.
    target: { awaken: [{ action: "speed", amount: 50 }], final: [{ action: "mass", amount: 5 }], knockout: [{ action: "mass", amount: 7 }], drop: [{ action: "speed", amount: 2 }], apex: [{ action: "speed", amount: 9 }] },
    toApex: { hit: [{ action: "bounce", target: "apex" }] },
    baseToApex: { base: [{ action: "bounce", target: "apex" }] },
    selfBase: { base: [{ action: "bounce" }] },
    finalBack: { maxWear: 1, final: [{ action: "bounce" }], drop: [{ action: "speed", amount: 2 }] },
    knockBack: { knockout: [{ action: "bounce" }] },
    chooser: { hit: [{ action: "bounce", target: choose }] },
  };
  const rules = fabricatedRules(table);
  const state = (over) => marblesPlayState(rules, { bag: ["plain"], ...over });
  const place = (over, slot = "rightBase") => mustReduce(rules, state(over), { type: "place", handIndex: 0, slot });

  // Un emplacement : départ, arrivée en main ; ni Final, ni Éjection, ni Chute, ni Éveil.
  const bounced = place({ hand: inHand(["toApex"]), triangle: { rightBase: placed("plain"), leftBase: null, apex: placed("target", 2) } });
  run.same("Rebond, emplacement : départ, arrivée en main", ["removed:target:bounce", "returned:target:triangle"], journal(bounced.events).filter((entry) => /target/.test(entry)));
  run.same("Rebond, emplacement : en main, à 0 tour en main", [{ marble: "target", turnsInHand: 0 }], bounced.state.hand);
  run("Rebond, emplacement : ni Final, ni Éjection, ni Chute, ni Éveil", false, bounced.events.some((event) => event.type === "effect" && event.marble === "target"));
  run.same(
    "Rebond, emplacement : compteurs, une sortie du triangle de plus, un rebond, une bille déplacée",
    { triangleExits: 1, bounce: 1, bounceQuantity: 1 },
    { triangleExits: bounced.state.tally.triangleExits.game - 1, bounce: bounced.state.tally.bounce.game, bounceQuantity: bounced.state.tally.bounceQuantity.game }
  );
  // Rejouable dans le tour, à usure 0 sur le triangle.
  run("Rebond : rejouable dans le tour", null, placeRefusal(bounced.state, 0, "apex"));
  const replayed = mustReduce(rules, bounced.state, { type: "place", handIndex: 0, slot: "apex" });
  run.same("Rebond : reposée à usure 0", { marble: "target", wear: 0 }, replayed.state.triangle.apex);

  // Pendant la résolution : la phase de la bille renvoyée est sautée.
  const resolved = mustReduce(rules, state({ triangle: { rightBase: placed("baseToApex"), leftBase: null, apex: placed("target") } }), { type: "resolve" });
  run("Rebond en résolution : la phase de la pointe sautée", true, resolved.events.some((event) => event.type === "phaseSkipped" && event.slot === "apex"));
  run.same("Rebond en résolution : en main pour le tour suivant", ["target"], resolved.state.hand.map(({ marble }) => marble));
  const selfPhase = mustReduce(rules, state({ triangle: { rightBase: placed("selfBase"), leftBase: null, apex: null } }), { type: "resolve" });
  run.same("Rebond soi en phase : en main, pas d'usure ensuite", { hand: ["selfBase"], wear: false }, { hand: selfPhase.state.hand.map(({ marble }) => marble), wear: selfPhase.events.some((event) => event.type === "wear" && event.marble === "selfBase") });

  // En partance : Final et Éjection, redirigée vers la main ; pas de défausse, pas
  // de Chute.
  const finalBack = mustReduce(rules, state({ triangle: { rightBase: null, leftBase: null, apex: placed("finalBack") } }), { type: "resolve" });
  run.same(
    "Rebond soi au Final : départ, Final, redirection, arrivée en main",
    ["removed:finalBack:wear", "final:finalBack", "effect:final:finalBack", "redirected:finalBack", "returned:finalBack:triangle"],
    journal(finalBack.events).filter((entry) => /finalBack/.test(entry) && !/^(phase|effect:phase|wear):/.test(entry))
  );
  run.same("Rebond soi au Final : ni défausse ni Chute", { discard: [], drop: 0 }, { discard: finalBack.state.discard, drop: finalBack.state.tally.drop.game });
  run.same("Rebond soi au Final : un rebond, une bille déplacée", "1 1", `${finalBack.state.tally.bounce.game} ${finalBack.state.tally.bounceQuantity.game}`);
  const knockBack = place({ hand: inHand(["plain"]), triangle: { rightBase: placed("knockBack"), leftBase: null, apex: null } });
  run.same("Rebond soi à l'Éjection : en main, pas à la défausse", { hand: ["knockBack"], discard: [] }, { hand: knockBack.state.hand.map(({ marble }) => marble), discard: knockBack.state.discard });

  // Main pleine : la défausse à la place, et la Chute.
  const fullHand = (marbles) => inHand([...marbles, "plain", "plain", "plain", "plain", "plain"].slice(0, 5));
  const full = mustReduce(rules, state({ hand: fullHand([]), triangle: { rightBase: null, leftBase: null, apex: placed("finalBack") } }), { type: "resolve" });
  run.same("Rebond, main pleine : à la défausse, sa Chute", { discard: ["finalBack"], drop: 1, handFull: true }, { discard: full.state.discard, drop: full.state.tally.drop.game, handFull: full.events.find((event) => event.type === "discarded").handFull });
  run("Rebond, main pleine : compté comme une bille déplacée", 1, full.state.tally.bounceQuantity.game);

  // Au choix, sur le triangle.
  const choosing = place({ hand: inHand(["chooser"]), triangle: { rightBase: placed("plain"), leftBase: placed("target"), apex: null } });
  const chosen = mustReduce(rules, choosing.state, { type: "choose", target: { zone: "triangle", slot: "leftBase" } });
  run.same("Rebond au choix : la bille choisie en main", ["target"], chosen.state.hand.map(({ marble }) => marble));

  // Validation : sur soi, sur le triangle ou en partance ; jamais en main, en
  // lancer, à la défausse ni au pot.
  run("validation, Rebond soi : permis en phase, au Final, à l'Éjection", false, throws(() => validateTable({ x: { base: [{ action: "bounce" }], final: [{ action: "bounce" }], knockout: [{ action: "bounce" }] } })));
  for (const field of ["flick", "awaken", "drop"]) {
    run(`validation, Rebond soi : refusé (${field})`, true, throws(() => validateTable({ x: { [field]: [{ action: "bounce" }] } })));
  }
  run("validation, Rebond : pas de choix dans la main", true, throws(() => validateTable({ x: { hit: [{ action: "bounce", target: { type: "choice", zones: ["hand"], pick: "marble", count: 1 } }] } })));

  // Prévision : égale au réel.
  run("prévision : égale au réel, Rebond d'un emplacement", true, forecastMatches(rules, state({ hand: inHand(["toApex"]), triangle: { rightBase: placed("plain"), leftBase: null, apex: placed("target") } }), { type: "place", handIndex: 0, slot: "rightBase" }));
  run("prévision : égale au réel, Rebond au Final", true, forecastMatches(rules, state({ triangle: { rightBase: null, leftBase: null, apex: placed("finalBack") } }), null));
  run("prévision : égale au réel, main pleine", true, forecastMatches(rules, state({ hand: fullHand([]), triangle: { rightBase: null, leftBase: null, apex: placed("finalBack") } }), null));
  run("aucune bille perdue ni dupliquée", marbleCount(state({ hand: fullHand([]), triangle: { rightBase: null, leftBase: null, apex: placed("finalBack") } })), marbleCount(full.state));
}

// RAMASSER : de la défausse à la main, sans Éveil ; la dernière arrivée ou au choix,
// dans l'ordre d'arrivée ; main pleine, elle reste ; une bille en partance n'est pas
// à la défausse.
function checkRetrieve(run) {
  const fromDiscard = (count = 1, upTo = false) => ({ type: "choice", zones: ["discard"], pick: "marble", count, ...(upTo ? { upTo: true } : {}) });
  const table = {
    plain: {},
    waker: { awaken: [{ action: "speed", amount: 50 }] },
    last: { hit: [{ action: "retrieve", target: "lastDiscarded" }] },
    picker: { hit: [{ action: "retrieve", target: fromDiscard() }] },
    twoPicker: { hit: [{ action: "retrieve", target: fromDiscard(2) }] },
    // En phase de base : la main n'a pas bougé (aucune pose avant).
    baseLast: { base: [{ action: "retrieve", target: "lastDiscarded" }] },
    basePicker: { base: [{ action: "retrieve", target: fromDiscard() }] },
    // Éjection : Ramasser au choix ; en partance, elle-même n'est pas proposée.
    seeker: { knockout: [{ action: "retrieve", target: fromDiscard() }] },
  };
  const rules = fabricatedRules(table);
  const state = (over) => marblesPlayState(rules, { bag: ["plain"], ...over });
  const place = (over, slot = "rightBase") => mustReduce(rules, state(over), { type: "place", handIndex: 0, slot });
  const occupied = { rightBase: placed("plain"), leftBase: null, apex: null };

  // La dernière arrivée : au Tic, la bille remplacée, arrivée juste avant ; de la
  // défausse à la main, sans Éveil.
  const last = place({ hand: inHand(["last"]), discard: ["plain"], triangle: { rightBase: placed("waker"), leftBase: null, apex: null } });
  run.same("Ramasser la dernière : la remplacée, en main, à 0 tour en main", [{ marble: "waker", turnsInHand: 0 }], last.state.hand);
  run("Ramasser la dernière : pas d'Éveil", false, last.events.some((event) => event.type === "awaken" || (event.type === "effect" && event.trigger === "awaken")));
  run.same("Ramasser la dernière : la défausse, sans elle", ["plain"], last.state.discard);
  run.same("Ramasser : un ramassage, une bille", "1 1", `${last.state.tally.retrieve.game} ${last.state.tally.retrieveQuantity.game}`);
  const resolve = (over) => mustReduce(rules, state(over), { type: "resolve" });
  const none = resolve({ discard: [], triangle: { rightBase: placed("baseLast"), leftBase: null, apex: null } });
  run("Ramasser la dernière, défausse vide : noté", true, none.events.some((event) => event.type === "targetEmpty" && event.target === "lastDiscarded"));

  // Main pleine : la bille reste à la défausse ; au choix, aucun choix ne s'ouvre.
  const fullHand = inHand(["plain", "plain", "plain", "plain", "plain"]);
  const full = resolve({ hand: fullHand, discard: ["waker"], triangle: { rightBase: placed("baseLast"), leftBase: null, apex: null } });
  run.same("Ramasser, main pleine : la bille reste à la défausse", ["waker"], full.state.discard);
  run("Ramasser, main pleine : noté", true, full.events.some((event) => event.type === "targetEmpty" && event.target === "handFull"));
  const crowded = resolve({ hand: fullHand, discard: ["waker"], triangle: { rightBase: placed("basePicker"), leftBase: null, apex: null } });
  run.same("Ramasser au choix, main pleine : aucun choix, noté", { pending: null, noted: true }, { pending: crowded.state.pendingChoice, noted: crowded.events.some((event) => event.type === "targetEmpty" && event.target === "handFull") });

  // Au choix : la défausse dans l'ordre d'arrivée ; la bille choisie en main.
  const picking = place({ hand: inHand(["picker"]), discard: ["waker", "plain"], triangle: occupied });
  run.same("Ramasser au choix : la défausse, dans l'ordre d'arrivée", ["waker", "plain", "plain"], picking.state.pendingChoice.eligible.map((target) => target.marble));
  run.same("Ramasser au choix : des cibles de la défausse", ["discard", "discard", "discard"], picking.state.pendingChoice.eligible.map((target) => target.zone));
  const picked = mustReduce(rules, picking.state, { type: "choose", target: { zone: "discard", index: 0 } });
  run.same("Ramasser au choix : waker en main, sans Éveil", { hand: ["waker"], awaken: false }, { hand: picked.state.hand.map(({ marble }) => marble), awaken: picked.events.some((event) => event.type === "awaken") });
  // Deux choix : la seconde bille suivie malgré le départ de la première (la
  // remplacée arrive en dernier, place 3).
  const two = place({ hand: inHand(["twoPicker"]), discard: ["waker", "plain", "waker"], triangle: occupied });
  const firstPick = mustReduce(rules, two.state, { type: "choose", target: { zone: "discard", index: 0 } });
  const secondPick = mustReduce(rules, firstPick.state, { type: "choose", target: { zone: "discard", index: 2 } });
  run.same("Ramasser deux au choix : les deux choisies, dans l'ordre", { hand: ["waker", "waker"], discard: ["plain", "plain"] }, { hand: secondPick.state.hand.map(({ marble }) => marble), discard: secondPick.state.discard });
  // Une seule place : un seul choix, même pour deux demandés.
  const roomy = place({ hand: inHand(["twoPicker", "plain", "plain", "plain", "plain"]), discard: ["waker", "plain"], triangle: occupied });
  run("Ramasser deux au choix, une place : un seul choix", 1, roomy.state.pendingChoice.count);

  // En partance pendant son Éjection : elle n'est pas encore à la défausse.
  const seeking = place({ hand: inHand(["plain"]), discard: ["waker"], triangle: { rightBase: placed("seeker"), leftBase: null, apex: null } });
  run.same("Ramasser pendant l'Éjection : la bille en partance n'est pas proposée", ["waker"], seeking.state.pendingChoice.eligible.map((target) => target.marble));
  run.same(
    "Ramasser pendant l'Éjection : la lancée et l'éjectée en transit, pour information",
    [
      { kind: "thrown", marble: "plain", slot: "rightBase" },
      { kind: "leaving", marble: "seeker", slot: "rightBase" },
    ],
    seeking.state.pendingChoice.inTransit
  );

  // Validation : jamais sur soi, jamais le sac, jamais un choix dans la main.
  run("validation, Ramasser : sans cible refusé", true, throws(() => validateTable({ x: { hit: [{ action: "retrieve" }] } })));
  run("validation, Ramasser : le sac refusé", true, throws(() => validateTable({ x: { hit: [{ action: "retrieve", target: { type: "bag", count: 1 } }] } })));
  run("validation, Ramasser : un choix dans la main refusé", true, throws(() => validateTable({ x: { hit: [{ action: "retrieve", target: { type: "choice", zones: ["hand"], pick: "marble", count: 1 } }] } })));
  run("validation, Ramasser : la dernière arrivée, permis", false, throws(() => validateTable({ x: { hit: [{ action: "retrieve", target: "lastDiscarded" }] } })));

  // Prévision : égale au réel pour la dernière ; un choix, selon le joueur.
  run("prévision : égale au réel, la dernière arrivée", true, forecastMatches(rules, state({ hand: inHand(["last"]), discard: ["plain", "waker"], triangle: occupied }), { type: "place", handIndex: 0, slot: "rightBase" }));
  run("prévision : un choix dans la défausse, selon le joueur", true, rules.forecast(state({ hand: inHand(["picker"]), discard: ["waker"], triangle: occupied }), { type: "place", handIndex: 0, slot: "rightBase" }).choiceDependent);
}

// Une clause Défausser, cible facultative.
const discard = (target) => ({ action: "discard", ...(target === undefined ? {} : { target }) });

// DÉFAUSSER : chaque cible, par le chemin des billes ; depuis le triangle, ni Final
// ni Éjection, une sortie du triangle, une phase sautée ; la Chute à chaque arrivée ;
// le sac sans régénération ; les compteurs ; la prévision.
function checkDiscard(run) {
  const choose = (zones) => ({ type: "choice", zones, pick: "marble", count: 1 });
  const table = {
    plain: { apex: [{ action: "speed", amount: 1 }] },
    // Une Chute, un Final, une Éjection : seule la Chute doit jouer.
    dropper: { drop: [{ action: "speed", amount: 2 }], final: [{ action: "mass", amount: 5 }], knockout: [{ action: "mass", amount: 7 }] },
    small: { size: SMALL, drop: [{ action: "speed", amount: 1 }] },
    big: { size: LARGE },
    selfBase: { base: [discard()] },
    selfWake: { awaken: [discard()] },
    toApex: { hit: [discard("apex")] },
    firstInHand: { hit: [discard("firstInHand")] },
    fromHand: { hit: [discard(choose(["hand"]))] },
    fromTriangle: { hit: [discard(choose(["triangle"]))] },
    allSmall: { hit: [discard({ type: "all", filters: [{ type: "size", size: SMALL }] })] },
    bagTwo: { hit: [discard({ type: "bag", count: 2 })] },
  };
  const rules = fabricatedRules(table);
  const state = (over) => marblesPlayState(rules, { bag: ["plain"], ...over });
  const place = (over, slot = "rightBase") => mustReduce(rules, state(over), { type: "place", handIndex: 0, slot });
  const choose1 = (result, target) => mustReduce(rules, result.state, { type: "choose", target });

  // Un emplacement : départ, arrivée, Chute ; ni Final ni Éjection.
  const fromSlot = place({ hand: inHand(["toApex"]), triangle: { rightBase: placed("plain"), leftBase: null, apex: placed("dropper") } });
  run.same(
    "Défausser, emplacement : départ, arrivée à la défausse, Chute",
    ["removed:dropper:discard", "discarded:dropper:triangle", "effect:drop:dropper"],
    journal(fromSlot.events).filter((entry) => /dropper/.test(entry))
  );
  run("Défausser, emplacement : ni Final ni Éjection pour la bille défaussée", false, fromSlot.events.some((event) => (event.type === "final" || event.type === "knockout") && event.marble === "dropper"));
  run.same("Défausser, emplacement : la pointe vidée, la bille à la défausse", { apex: null, discard: ["plain", "dropper"] }, { apex: fromSlot.state.triangle.apex, discard: fromSlot.state.discard });
  run.same(
    "Défausser, emplacement : une sortie du triangle de plus (la remplacée compte aussi), ni usée",
    { triangleExits: 1, ejectedMarbles: 1, wornMarbles: 0, discardedMarbles: 2, discard: 1, discardQuantity: 1 },
    (({ triangleExits, ejectedMarbles, wornMarbles, discardedMarbles, discard: triggers, discardQuantity }) => ({
      triangleExits: triangleExits.game - 1,
      ejectedMarbles: ejectedMarbles.game,
      wornMarbles: wornMarbles.game,
      discardedMarbles: discardedMarbles.game,
      discard: triggers.game,
      discardQuantity: discardQuantity.game,
    }))(fromSlot.state.tally)
  );
  const empty = place({ hand: inHand(["toApex"]), triangle: { rightBase: placed("plain"), leftBase: null, apex: null } });
  run("Défausser, emplacement vide : noté, un déclenchement, aucune bille", "1 0", `${empty.state.tally.discard.game} ${empty.state.tally.discardQuantity.game}`);

  // Pendant la résolution : la phase de la bille défaussée est sautée.
  const selfPhase = mustReduce(rules, state({ triangle: { rightBase: placed("selfBase"), leftBase: null, apex: null } }), { type: "resolve" });
  run.same("Défausser soi en phase : à la défausse, pas d'usure ensuite", ["selfBase"], selfPhase.state.discard);
  run("Défausser soi en phase : aucun +1 d'usure", false, selfPhase.events.some((event) => event.type === "wear" && event.marble === "selfBase"));

  // En main, à son Éveil : depuis la main, sa Chute ; aucune bille perdue.
  const woke = mustReduce(rules, { ...state({ hand: inHand([]), bag: ["selfWake"] }), stage: "draw" }, { type: "draw" });
  run.same("Défausser soi à l'Éveil : de la main à la défausse", { hand: [], discard: ["selfWake"] }, { hand: woke.state.hand, discard: woke.state.discard });
  run("Défausser soi à l'Éveil : arrivée depuis la main", "hand", woke.events.find((event) => event.type === "discarded").from);

  // La première bille de la main, puis une main vide.
  const first = place({ hand: inHand(["firstInHand", "dropper", "plain"]), triangle: { rightBase: placed("plain"), leftBase: null, apex: null } });
  run.same("Défausser la première de la main : dropper, sa Chute", { hand: ["plain"], drop: 1 }, { hand: first.state.hand.map(({ marble }) => marble), drop: first.state.tally.drop.game });
  const noHand = place({ hand: inHand(["firstInHand"]), triangle: { rightBase: placed("plain"), leftBase: null, apex: null } });
  run("Défausser la première de la main, main vide : noté", true, noHand.events.some((event) => event.type === "targetEmpty" && event.action === "discard" && event.target === "firstInHand"));

  // Au choix, dans la main et sur le triangle.
  const handChoice = place({ hand: inHand(["fromHand", "plain", "dropper"]), triangle: { rightBase: placed("plain"), leftBase: null, apex: null } });
  run.same("Défausser au choix, main : les billes de la main", ["plain", "dropper"], handChoice.state.pendingChoice.eligible.map((target) => target.marble));
  const handChosen = choose1(handChoice, { zone: "hand", index: 1 });
  run.same("Défausser au choix, main : la bille choisie, sa Chute", { hand: ["plain"], dropped: true }, { hand: handChosen.state.hand.map(({ marble }) => marble), dropped: handChosen.events.some((event) => event.trigger === "drop") });
  const triChoice = place({ hand: inHand(["fromTriangle"]), triangle: { rightBase: placed("plain"), leftBase: placed("dropper"), apex: null } });
  const triChosen = choose1(triChoice, { zone: "triangle", slot: "leftBase" });
  run.same("Défausser au choix, triangle : la bille choisie quitte le triangle", { leftBase: null, discard: ["plain", "dropper"] }, { leftBase: triChosen.state.triangle.leftBase, discard: triChosen.state.discard });

  // Toutes les minibilles actives, dans l'ordre horaire, chacune sa Chute.
  const smalls = place({ hand: inHand(["allSmall"]), triangle: { rightBase: placed("plain"), leftBase: placed("small"), apex: placed("small") } });
  run.same("Défausser toutes les minibilles : chacune, dans l'ordre horaire", ["leftBase", "apex"], smalls.events.filter((event) => event.type === "removed" && event.cause === "discard").map((event) => event.slot));
  run("Défausser toutes les minibilles : deux Chutes", 2, smalls.state.tally.drop.game);

  // Le sac : les deux prochaines, du haut ; un sac plus court donne ce qu'il a, sans
  // régénération ; vide : noté.
  const bagState = (bag, discardPile = []) => ({ hand: inHand(["bagTwo"]), bag, discard: discardPile, triangle: { rightBase: placed("plain"), leftBase: null, apex: null } });
  const two = place(bagState(["dropper", "small", "plain"]));
  run.same("Défausser le sac : les deux du haut, chacune sa Chute", { bag: ["plain"], drops: 2 }, { bag: two.state.bag, drops: two.state.tally.drop.game });
  run.same("Défausser le sac : arrivées depuis le sac", ["bag", "bag"], two.events.filter((event) => event.type === "discarded" && event.cause === "discard").map((event) => event.from));
  const short = place(bagState(["dropper"], ["big"]));
  run.same("Défausser le sac, plus court : ce qu'il a, sans régénération", { bag: [], regenerated: false }, { bag: short.state.bag, regenerated: short.events.some((event) => event.type === "bagRegenerated") });
  const none = place(bagState([], ["big"]));
  run("Défausser le sac vide : noté, sans régénération", true, none.events.some((event) => event.type === "targetEmpty" && event.target === "bag") && !none.events.some((event) => event.type === "bagRegenerated"));
  run("Défausser : aucune bille perdue ni dupliquée", marbleCount(state(bagState(["dropper", "small", "plain"]))), marbleCount(two.state));

  // Validation : sur soi, ni en lancer, ni en partance, ni à la défausse, ni au pot ;
  // la cible du sac, seulement pour Défausser, au moins 1.
  for (const field of ["flick", "final", "knockout", "drop"]) {
    run(`validation, Défausser soi : refusé (${field})`, true, throws(() => validateTable({ x: { [field]: [discard()] } })));
  }
  run("validation, Défausser soi : refusé en poche", true, throws(() => validateTable({ x: { pocketed: { entry: [discard()] } } })));
  run("validation, Défausser soi : permis en phase et à l'Éveil", false, throws(() => validateTable({ x: { base: [discard()], awaken: [discard()] } })));
  run("validation, sac : Empocher ne le vise pas", true, throws(() => validateTable({ x: { hit: [{ action: "pocket", target: { type: "bag", count: 1 } }] } })));
  run("validation, sac : au moins une bille", true, throws(() => validateTable({ x: { hit: [discard({ type: "bag", count: 0 })] } })));

  // Prévision : égale au réel ; le sac caché la rend incertaine.
  run("prévision : égale au réel, emplacement", true, forecastMatches(rules, state({ hand: inHand(["toApex"]), triangle: { rightBase: placed("plain"), leftBase: null, apex: placed("dropper") } }), { type: "place", handIndex: 0, slot: "rightBase" }));
  run("prévision : égale au réel, première de la main", true, forecastMatches(rules, state({ hand: inHand(["firstInHand", "dropper"]), triangle: { rightBase: placed("plain"), leftBase: null, apex: null } }), { type: "place", handIndex: 0, slot: "rightBase" }));
  const blind = rules.forecast(state(bagState(["dropper", "small"])), { type: "place", handIndex: 0, slot: "rightBase" });
  run("prévision, sac : incertaine", true, blind.uncertain);
  run.same("prévision, sac : deux billes inconnues défaussées", [null, null], blind.hit.discards.map((moved) => moved.marble));
}

// LA CHUTE : à chaque arrivée à la défausse, d'où qu'elle vienne, après le
// déclencheur de sortie ; jamais après une redirection. Ses valeurs vont au tour ;
// la règle des cibles habituelle ; à la défausse, Empocher sur elle-même l'en fait
// partir.
function checkDrop(run) {
  const table = {
    plain: { apex: [{ action: "speed", amount: 1 }] },
    // Final puis Chute : l'ordre se lit dans le journal et dans les compteurs.
    faller: { maxWear: 1, final: [{ action: "mass", amount: 1 }], drop: [{ action: "speed", amount: 3 }] },
    // Final qui l'empoche : redirigée, pas de Chute.
    escaper: { maxWear: 1, final: [{ action: "pocket" }], drop: [{ action: "speed", amount: 3 }] },
    // Chute qui l'empoche : de la défausse au pot.
    bouncer: { maxWear: 1, drop: [{ action: "pocket" }] },
    // Chute qui donne un bonus à la pointe : perdu si sa phase est passée.
    giver: { maxWear: 1, drop: [{ action: "speed", amount: 2, target: "apex" }] },
    // Tic : Éjecter la pointe.
    ejector: { hit: [{ action: "eject", target: "apex" }] },
  };
  const rules = fabricatedRules(table);
  const state = (over) => marblesPlayState(rules, { bag: ["plain"], ...over });
  const resolve = (over) => mustReduce(rules, state(over), { type: "resolve" });

  // Usure : départ, Final, arrivée, Chute ; la Chute compte au tour.
  const worn = resolve({ triangle: { rightBase: null, leftBase: null, apex: placed("faller") } });
  run.same(
    "Chute, usure : départ, Final, arrivée à la défausse, puis Chute",
    ["removed:faller:wear", "final:faller", "effect:final:faller", "discarded:faller:triangle", "effect:drop:faller"],
    journal(worn.events).filter((entry) => /faller/.test(entry) && !/^(phase|effect:phase|wear):/.test(entry))
  );
  run.same("Chute, usure : ses valeurs au tour (Masse du Final, Vitesse de la Chute)", { speed: 3, mass: 2 }, (({ speed, mass }) => ({ speed, mass }))(worn.events.find((event) => event.type === "impact")));
  run.same("Chute, usure : à la défausse", ["faller"], worn.state.discard);
  run.same("Chute : l'effet porte l'emplacement quitté", { trigger: "drop", slot: "apex", marble: "faller" }, (({ trigger, slot, marble }) => ({ trigger, slot, marble }))(worn.events.find((event) => event.trigger === "drop")));

  // Redirection : pas d'arrivée à la défausse, pas de Chute.
  const escaped = resolve({ triangle: { rightBase: null, leftBase: null, apex: placed("escaper") } });
  run("Chute, redirection : pas de Chute", false, escaped.events.some((event) => event.trigger === "drop"));
  run.same("Chute, redirection : au pot, jamais à la défausse", { pot: ["escaper"], discard: [] }, { pot: escaped.state.pot, discard: escaped.state.discard });

  // Remplacement et Éjecter : la Chute de la bille chassée, à son arrivée.
  const replaced = mustReduce(rules, state({ hand: inHand(["plain"]), triangle: { rightBase: null, leftBase: null, apex: placed("faller") } }), { type: "place", handIndex: 0, slot: "apex" });
  run.same(
    "Chute, remplacement : départ, Éjection, arrivée, Chute, puis la pose",
    ["removed:faller:replacement", "knockout:faller", "discarded:faller:triangle", "effect:drop:faller", "placed:plain"],
    journal(replaced.events).slice(1, 6)
  );
  run("Chute, remplacement : pas de Final", false, replaced.events.some((event) => event.type === "final"));
  const ejected = mustReduce(rules, state({ hand: inHand(["ejector"]), triangle: { rightBase: placed("plain"), leftBase: null, apex: placed("faller") } }), { type: "place", handIndex: 0, slot: "rightBase" });
  run("Chute, Éjecter : la bille chassée chute", true, ejected.events.some((event) => event.trigger === "drop" && event.marble === "faller"));

  // Empocher sur elle-même pendant sa Chute : de la défausse au pot.
  const bounced = resolve({ triangle: { rightBase: null, leftBase: null, apex: placed("bouncer") } });
  run.same(
    "Chute, Empocher sur soi : la bille quitte la défausse pour le pot",
    ["discarded:bouncer:triangle", "effect:drop:bouncer", "pocketed:bouncer:discard"],
    journal(bounced.events).filter((entry) => /^(discarded|effect:drop|pocketed)/.test(entry))
  );
  run.same("Chute, Empocher sur soi : au pot, la défausse vide", { pot: ["bouncer"], discard: [] }, { pot: bounced.state.pot, discard: bounced.state.discard });
  run("Chute, Empocher sur soi : aucune bille perdue ni dupliquée", marbleCount(state({ triangle: { rightBase: null, leftBase: null, apex: placed("bouncer") } })), marbleCount(bounced.state));

  // Règle des cibles : un bonus de Chute dont la phase est passée est perdu.
  const late = resolve({ triangle: { rightBase: placed("giver"), leftBase: null, apex: placed("plain") } });
  run.same(
    "Chute, bonus : la pointe a déjà joué aux retraits, le bonus est perdu",
    [{ slot: "apex", reason: "phasePassed", speed: 2, mass: 0 }],
    late.events.find((event) => event.trigger === "drop").lost
  );
  const inTime = mustReduce(rules, state({ hand: inHand(["plain"]), triangle: { rightBase: placed("giver"), leftBase: null, apex: placed("plain") } }), { type: "place", handIndex: 0, slot: "rightBase" });
  run.same("Chute, bonus : pendant la phase de jeu, la pointe le reçoit", { speed: 2, mass: 0 }, inTime.state.triangle.apex.bonus);

  // Compteurs : une arrivée à la défausse, toutes origines ; la Chute seulement chez
  // une bille qui en a une.
  run.same("compteurs : une bille défaussée, une Chute", { discardedMarbles: 1, drop: 1 }, { discardedMarbles: worn.state.tally.discardedMarbles.game, drop: worn.state.tally.drop.game });
  const plainOut = resolve({ triangle: { rightBase: null, leftBase: null, apex: placed("plain", 2) } });
  run.same("compteurs : sans Chute, une bille défaussée, aucune Chute", { discardedMarbles: 1, drop: 0 }, { discardedMarbles: plainOut.state.tally.discardedMarbles.game, drop: plainOut.state.tally.drop.game });
  run("compteurs : une redirection n'est pas une bille défaussée", 0, escaped.state.tally.discardedMarbles.game);

  // Validation : à la défausse, ni Polissage, ni Fêlure, ni Éjecter sur soi ;
  // Empocher sur soi permis.
  for (const action of ["polish", "crack"]) {
    run(`validation, Chute : ${action} sur soi refusé`, true, throws(() => validateTable({ x: { drop: [{ action, amount: 1 }] } })));
  }
  run("validation, Chute : Éjecter sur soi refusé", true, throws(() => validateTable({ x: { drop: [{ action: "eject" }] } })));
  run("validation, Chute : Empocher sur soi permis", false, throws(() => validateTable({ x: { drop: [{ action: "pocket" }] } })));

  // Prévision : la Chute avec l'emplacement quitté, après le Final ; égale au réel.
  const predicted = rules.forecast(state({ triangle: { rightBase: null, leftBase: null, apex: placed("faller") } }));
  run.same("prévision : le Final puis la Chute, sur l'emplacement de la bille", ["final", "drop"], predicted.slotEffects.apex.map((effect) => effect.trigger));
  run("prévision : égale au réel, usure", true, forecastMatches(rules, state({ triangle: { rightBase: null, leftBase: null, apex: placed("faller") } }), null));
  run("prévision : égale au réel, remplacement", true, forecastMatches(rules, state({ hand: inHand(["plain"]), triangle: { rightBase: null, leftBase: null, apex: placed("faller") } }), { type: "place", handIndex: 0, slot: "apex" }));
  run("prévision : égale au réel, Empocher sur soi pendant la Chute", true, forecastMatches(rules, state({ triangle: { rightBase: null, leftBase: null, apex: placed("bouncer") } }), null));
}
