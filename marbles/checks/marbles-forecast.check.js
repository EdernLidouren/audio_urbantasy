// Vérifications du core — domaine « marbles-forecast ». La prévision du jeu des
// billes (marbles/core/forecast.js) : les cas nécessaires, ses garde-fous, et la
// propriété clé : sur des centaines d'états aléatoires à graine, la prévision de
// chaque action envisagée correspond exactement au résultat réel de cette action
// suivie de la résolution. Sur la table de billes des vérifications
// (marbles/checks/fixtures/marbles.js) ; la même propriété, en plus court, se rejoue sur
// la vraie table (domaine marbles-content). Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js marbles-forecast`).

import { TALLY_COUNTERS } from "../core/content.js";
import { emptyTally } from "../core/tally.js";
import { forecast, readForecast } from "../core/forecast.js";
import { CHOICELESS_TYPES, FIXTURE_TYPES, fixtureRules } from "./fixtures/marbles.js";
import { emptyForecastTally, walkForecastGame } from "./fixtures/forecast-property.js";
import { deepFreeze, fabricatedRules, inHand, marblesPlayState, placed } from "./helpers.js";

// Les règles de la table des vérifications (marbles/checks/fixtures/marbles.js) : la
// propriété « prévision = réel » et les cas du choix et d'Éjecter.
const choiceRules = fixtureRules();
// La même table sans cible au choix ni Éjecter : les cas qui portent sur d'autres
// mécanismes, sans choix à trancher.
const rules = fixtureRules(CHOICELESS_TYPES);

function playState(over = {}) {
  return marblesPlayState(rules, over);
}

export default function checkMarblesForecast(run) {
  run.section("cas", checkCases);
  run.section("pioche à l'aveugle", checkBlindDraws);
  run.section("Final", checkFinalForecast);
  run.section("Polissage et Fêlure", checkWearForecast);
  run.section("Chiquenaude", checkFlickForecast);
  run.section("Trouvaille", checkWindfallForecast);
  run.section("valeurs de partie", checkTallyForecast);
  run.section("Éveil", checkAwakenForecast);
  run.section("pot", checkPocketForecast);
  run.section("réactions", checkReactionForecast);
  run.section("choix", checkChoiceForecast);
  run.section("Éjecter", checkEjectForecast);
  run.section("garde-fous", checkGuards);
  run.section("prévision = réel", checkMatchesReality);
}

// La pioche À L'AVEUGLE : la prévision compte les billes et annonce la
// régénération, sans jamais dire lesquelles, ni toucher au hasard de la partie.
function checkBlindDraws(run) {
  const occupied = { leftBase: null, rightBase: null, apex: placed("size_count") };
  // base_pocket n'est qu'au sac : la prévision ne doit jamais le nommer.
  const state = playState({ hand: inHand(["split_base"]), bag: ["base_pocket"], discard: [], triangle: occupied });
  const predicted = rules.forecast(state, { type: "place", handIndex: 0, slot: "apex" });
  run.same("aveugle : l'Éjection pioche 1", { marble: "size_count", speed: 0, mass: 0, draw: 1, operations: [], given: [] }, predicted.knockout);
  run.same("aveugle : le Tic pioche 1", { marble: "split_base", speed: 0, mass: 0, draw: 1, operations: [], given: [] }, predicted.hit);
  run("aveugle : deux billes piochées", 2, predicted.drawn);
  run("aveugle : la seconde régénère le sac (size_count éjecté)", 1, predicted.regenerations.length);
  run("aveugle : aucune bille du sac révélée", false, JSON.stringify(predicted).includes("base_pocket"));
  run("aveugle : rien d'incertain, aucune bille n'écoute la main", false, predicted.uncertain);

  // Le réel : mêmes comptes.
  const real = rules.reduce(state, { type: "place", handIndex: 0, slot: "apex" });
  const resolved = rules.reduce(real.state, { type: "resolve" });
  const actual = readForecast(real.events, resolved.events, resolved.state);
  run("aveugle : le réel pioche autant", predicted.drawn, actual.drawn);
  run("aveugle : le réel régénère aussi", 1, actual.regenerations.length);

  // Le hasard de la partie n'est ni lu ni avancé : deux états qui ne diffèrent que
  // par lui donnent la même prévision, et l'état reçu (figé) n'est pas touché.
  const other = { ...state, rngState: state.rngState + 12345 };
  run(
    "aveugle : le hasard de la partie n'y change rien",
    JSON.stringify(predicted),
    JSON.stringify(rules.forecast(other, { type: "place", handIndex: 0, slot: "apex" }))
  );
  const frozen = deepFreeze(structuredClone(state));
  run("aveugle : l'état reçu n'est pas modifié", true, rules.forecast(frozen, { type: "place", handIndex: 0, slot: "apex" }).ok);
  run("aveugle : son hasard non plus", state.rngState, frozen.rngState);

  // Une phase qui pioche, sur le triangle actuel : sa Pioche est une valeur finale.
  const phase = rules.forecast(playState({ hand: inHand([]), bag: [], discard: [], triangle: { leftBase: placed("awaken_draw"), rightBase: null, apex: null } }));
  run.same("aveugle : la phase de awaken_draw, Pioche 1", { marble: "awaken_draw", speed: 0, mass: 0, draw: 1, operations: [], given: [] }, phase.phases.leftBase);
  run("aveugle : rien à piocher, rien de pioché", 0, phase.drawn);
  run.same("aveugle : ni régénération", [], phase.regenerations);
}

// Le Final se prévoit avec l'emplacement de sa bille, seulement si elle atteint son
// usure maximale ce tour.
function checkFinalForecast(run) {
  const worn = rules.forecast(playState({ hand: inHand([]), bag: ["aging_flick"], triangle: { leftBase: null, rightBase: null, apex: placed("fragile", 1) } }));
  run.same("final prévu : fragile usée ce tour", [{ trigger: "final", marble: "fragile", speed: 4, mass: 0, draw: 0, operations: [], given: [] }], worn.slotEffects.apex);
  run("final prévu : compté dans l'Impact (5 + 4)", 9, worn.impact);
  run.same("final prévu : rien ailleurs", [[], []], [worn.slotEffects.leftBase, worn.slotEffects.rightBase]);
  const fresh = rules.forecast(playState({ hand: inHand([]), bag: ["aging_flick"], triangle: { leftBase: null, rightBase: null, apex: placed("fragile", 0) } }));
  run.same("final prévu : pas usée ce tour, pas de Final", [], fresh.slotEffects.apex);
  run("final prévu : ni dans l'Impact", 5, fresh.impact);
  const oneShot = rules.forecast(playState({ hand: inHand(["one_shot"]), bag: ["final_pocket"] }), { type: "place", handIndex: 0, slot: "leftBase" });
  run("final prévu : one_shot posée pioche à son Final", 1, oneShot.slotEffects.leftBase[0].draw);
  run("final prévu : une bille piochée", 1, oneShot.drawn);
  run("final prévu : aucune bille du sac révélée", false, JSON.stringify(oneShot).includes("final_pocket"));
}

// La Chiquenaude dans la prévision : son effet, son montant calculé, et le cas où
// elle vide l'emplacement visé (ni Éjection ni Tic) ; toujours égale au réel.
function checkFlickForecast(run) {
  const toApex = { type: "place", handIndex: 0, slot: "apex" };
  const matches = (state, action) => {
    const real = rules.reduce(state, action);
    const resolved = rules.reduce(real.state, { type: "resolve" });
    const { uncertain, awakenPossible, ...predicted } = rules.forecast(state, action);
    return JSON.stringify(predicted) === JSON.stringify(readForecast(real.events, resolved.events, resolved.state));
  };

  const agingFlick = playState({ hand: inHand(["aging_flick"], 3), triangle: { leftBase: null, rightBase: null, apex: placed("all_rounder") } });
  const predicted = rules.forecast(agingFlick, toApex);
  run("chiquenaude prévue : le montant calculé, 3 tours en main", 3, predicted.flick.speed);
  run("chiquenaude prévue : égale au réel", true, matches(agingFlick, toApex));

  const clearing = playState({ hand: inHand(["flick_strike"]), triangle: { leftBase: null, rightBase: null, apex: placed("fragile") } });
  const cleared = rules.forecast(clearing, toApex);
  run.same(
    "chiquenaude prévue qui vide l'emplacement : sa Fêlure, ni Éjection ni Tic",
    { flick: [{ action: "crack", amount: 3, target: "apex" }], knockout: null, hit: null },
    { flick: cleared.flick.operations, knockout: cleared.knockout, hit: cleared.hit }
  );
  run.same("chiquenaude prévue qui vide l'emplacement : le Final de l'occupante", [{ marble: "fragile", speed: 4 }], cleared.slotEffects.apex.map(({ marble, speed }) => ({ marble, speed })));
  run("chiquenaude prévue qui vide l'emplacement : égale au réel", true, matches(clearing, toApex));
  run("chiquenaude prévue : sans le champ, null", null, rules.forecast(playState({ hand: inHand(["all_rounder"]) }), toApex).flick);
}

// Les Trouvailles dans la prévision : prévues chez les billes actives, connues ;
// seules les billes piochées restent cachées. Toujours égales au réel.
function checkWindfallForecast(run) {
  const matches = (state, action) => {
    const real = action === null ? { state, events: [] } : rules.reduce(state, action);
    const resolved = rules.reduce(real.state, { type: "resolve" });
    const { uncertain, awakenPossible, ...predicted } = rules.forecast(state, action);
    return JSON.stringify(predicted) === JSON.stringify(readForecast(real.events, resolved.events, resolved.state));
  };
  const toApex = { type: "place", handIndex: 0, slot: "apex" };
  const play = playState({
    hand: inHand(["split_base"]),
    bag: [],
    discard: ["aging_flick"],
    triangle: { leftBase: placed("all_rounder"), rightBase: placed("final_pocket", 1), apex: placed("hit_polish") },
  });
  const predicted = rules.forecast(play, toApex);
  run.same(
    "trouvaille prévue, pose : chez les billes actives, dans l'ordre",
    [
      { trigger: "windfall", slot: "leftBase", marble: "all_rounder", speed: 3 },
      { trigger: "windfall", slot: "rightBase", marble: "final_pocket", speed: 0 },
    ],
    predicted.regenerations[0].effects.map(({ trigger, slot, marble, speed }) => ({ trigger, slot, marble, speed }))
  );
  run("trouvaille prévue, pose : aucune bille du sac révélée", false, JSON.stringify(predicted).includes("aging_flick"));
  run("trouvaille prévue, pose : certaine, les billes actives sont connues", false, predicted.uncertain);
  run("trouvaille prévue, pose : égale au réel", true, matches(play, toApex));

  const resolving = playState({ bag: [], discard: ["aging_flick"], triangle: { leftBase: placed("awaken_draw"), rightBase: placed("one_shot"), apex: placed("all_rounder") } });
  // Deux régénérations : la Pioche de awaken_draw, puis celle du Final de one_shot ; la
  // all_rounder trouve à chacune, et chaque Trouvaille reste avec la sienne.
  run.same(
    "trouvaille prévue, résolution : deux régénérations, all_rounder à chacune",
    [["all_rounder"], ["all_rounder"]],
    rules.forecast(resolving).regenerations.map(({ effects }) => effects.map((effect) => effect.marble))
  );
  // one_shot repioche sa propre bille après son Final, qui s'éveille (Polissage à la
  // pointe) : un Éveil réel, que la prévision ne dit pas, mais annonce incertaine.
  run("trouvaille prévue, résolution : one_shot repiochée peut s'éveiller, prévision incertaine", true, rules.forecast(resolving).uncertain);
  const cracking = playState({
    hand: inHand(["split_base"]),
    bag: [],
    discard: ["aging_flick"],
    triangle: { leftBase: placed("base_pocket"), rightBase: placed("fragile", 1), apex: placed("hit_polish") },
  });
  run("trouvaille prévue, Fêlure et Final : égale au réel", true, matches(cracking, toApex));
  run.same("trouvaille prévue : rien sans régénération", [], rules.forecast(playState({ triangle: { leftBase: placed("all_rounder"), rightBase: null, apex: null } })).regenerations);
}

// Les valeurs de partie dans la prévision : la copie porte le registre, qui y évolue
// comme dans la partie (une Chiquenaude se compte elle-même, une régénération compte
// une trouvaille) ; le registre réel n'est jamais touché.
function checkTallyForecast(run) {
  const toApex = { type: "place", handIndex: 0, slot: "apex" };
  const matches = (state, action) => {
    const real = rules.reduce(state, action);
    const resolved = rules.reduce(real.state, { type: "resolve" });
    const { uncertain, awakenPossible, ...predicted } = rules.forecast(state, action);
    return JSON.stringify(predicted) === JSON.stringify(readForecast(real.events, resolved.events, resolved.state));
  };
  // Un registre décrit en partie, { id: { turn, game } }, le reste à zéro.
  const tally = (values) => ({ ...emptyTally(TALLY_COUNTERS), ...values });

  // tally_flick : sa Chiquenaude lit le registre de la copie, elle-même comprise.
  const first = playState({ hand: inHand(["tally_flick"]) });
  run("valeurs prévues : première chiquenaude du tour de tally_flick, Vitesse +2", 2, rules.forecast(first, toApex).flick.speed);
  run("valeurs prévues : égales au réel", true, matches(first, toApex));
  const second = playState({ hand: inHand(["tally_flick"]), tally: tally({ flick: { turn: 1, game: 1 } }) });
  run("valeurs prévues : deuxième chiquenaude, Vitesse +4", 4, rules.forecast(second, toApex).flick.speed);
  run("valeurs prévues : deuxième, égale au réel", true, matches(second, toApex));
  const capped = playState({ hand: inHand(["tally_flick"]), tally: tally({ flick: { turn: 7, game: 7 } }) });
  run("valeurs prévues : plafond de tally_flick, Vitesse +6", 6, rules.forecast(capped, toApex).flick.speed);

  // Un mélange en chemin (le Tic de split_base qui pioche) : la Trouvaille de la
  // all_rounder et le mélange comptent dans le registre de la copie.
  const regenerating = playState({
    hand: inHand(["split_base"]),
    bag: [],
    discard: ["aging_flick"],
    triangle: { leftBase: placed("all_rounder"), rightBase: null, apex: placed("hit_polish") },
    tally: tally({ windfall: { turn: 0, game: 2 } }),
  });
  const predicted = rules.forecast(regenerating, toApex);
  run.same(
    "valeurs prévues : la Trouvaille et le mélange comptés dans le registre de la copie",
    { windfall: 3, shuffles: 1 },
    { windfall: predicted.tally.windfall.game, shuffles: predicted.tally.shuffles.game }
  );
  run("valeurs prévues : égales au réel, régénération comprise", true, matches(regenerating, toApex));
  const frozen = deepFreeze(structuredClone(regenerating));
  run("valeurs prévues : l'état reçu n'est pas modifié", true, rules.forecast(frozen, toApex).ok);
  run.same("valeurs prévues : le registre réel non plus", tally({ windfall: { turn: 0, game: 2 } }), frozen.tally);
}

// Le pot dans la prévision : les effets En poche sont déterministes et inclus, chez la
// bille qui empoche ; égale au réel.
function checkPocketForecast(run) {
  const matches = (state, action) => {
    const real = action === null ? { state, events: [] } : rules.reduce(state, action);
    const resolved = rules.reduce(real.state, { type: "resolve" });
    const { uncertain, awakenPossible, ...predicted } = rules.forecast(state, action);
    return JSON.stringify(predicted) === JSON.stringify(readForecast(real.events, resolved.events, resolved.state));
  };
  const toApex = { type: "place", handIndex: 0, slot: "apex" };

  // Le Tic de hit_pocket empoche fragile, qui entre avec Vitesse +10.
  const hitPocket = playState({ hand: inHand(["hit_pocket", "fragile"]), triangle: { leftBase: null, rightBase: null, apex: placed("aging_flick") } });
  const predicted = rules.forecast(hitPocket, toApex);
  run.same(
    "pot prévu : chez le Tic de hit_pocket, fragile et son entrée",
    [{ marble: "fragile", lost: false, entry: { marble: "fragile", speed: 10, mass: 0, draw: 0, operations: [], given: [] } }],
    predicted.hit.pockets
  );
  run("pot prévu : l'entrée dans la Vitesse prévue (Tic 4, entrée 10, pointe de hit_pocket 6)", 20, predicted.speed);
  run("pot prévu : égal au réel", true, matches(hitPocket, toApex));
  const full = { ...hitPocket, pot: ["aging_flick", "hit_polish", "awaken_draw"] };
  run.same("pot prévu, plein : fragile perdue, sans entrée", [{ marble: "fragile", lost: true, entry: null }], rules.forecast(full, toApex).hit.pockets);
  run("pot prévu, plein : égal au réel", true, matches(full, toApex));

  // base_pocket empoche la pointe pendant la résolution : phase sautée, entrée comptée.
  const basePocket = playState({ triangle: { leftBase: placed("base_pocket"), rightBase: null, apex: placed("fragile", 1) } });
  const resolving = rules.forecast(basePocket);
  run("pot prévu, résolution : la pointe retirée avant sa phase", "fragile", resolving.cleared.apex);
  run("pot prévu, résolution : l'entrée chez base_pocket", 10, resolving.phases.leftBase.pockets[0].entry.speed);
  run("pot prévu, résolution : Impact 10", 10, resolving.impact);
  run("pot prévu, résolution : égal au réel", true, matches(basePocket, null));

  // Les billes du pot, à chaque résolution.
  const pot = playState({ triangle: { leftBase: placed("tally_flick"), rightBase: null, apex: placed("fragile") }, pot: ["final_pocket", "hit_polish", "base_pocket"] });
  run.same(
    "pot prévu : les effets de chaque résolution, dans l'ordre d'arrivée, sans hit_polish",
    [
      { marble: "final_pocket", speed: 0, mass: 1 },
      { marble: "base_pocket", speed: 4, mass: 0 },
    ],
    rules.forecast(pot).potEffects.map(({ marble, speed, mass }) => ({ marble, speed, mass }))
  );
  run("pot prévu : égal au réel", true, matches(pot, null));
  // Le Final de final_pocket l'empoche depuis la défausse ; elle joue au pot ce tour.
  const finalPocket = playState({ triangle: { leftBase: null, rightBase: null, apex: placed("final_pocket", 2) } });
  run("pot prévu : final_pocket empochée par son Final", "final_pocket", rules.forecast(finalPocket).slotEffects.apex[0].pockets[0].marble);
  run("pot prévu : Final de final_pocket, égal au réel", true, matches(finalPocket, null));
  // Ses cibles vides : la pointe qu'elle polit est déjà la sienne, vidée.
  run.same("cible vide prévue : chez le Final de final_pocket", [{ action: "polish", slot: "apex" }], rules.forecast(finalPocket).slotEffects.apex[0].empty);
  // La main vide de hit_pocket : Empocher n'y trouve rien, et la prévision le sait.
  const alone = playState({ hand: inHand(["hit_pocket"]), triangle: { leftBase: null, rightBase: null, apex: placed("aging_flick") } });
  const aloneForecast = rules.forecast(alone, toApex);
  run.same("cible vide prévue : main vide au Tic de hit_pocket", [{ action: "pocket", slot: null, target: "firstInHand" }], aloneForecast.hit.empty);
  run("cible vide prévue : rien d'empoché", undefined, aloneForecast.hit.pockets);
  run("cible vide prévue : égal au réel", true, matches(alone, toApex));

  // Une bille piochée à l'aveugle puis empochée : inconnue, prévision incertaine,
  // sans Éveil possible pour autant.
  const blind = playState({ hand: inHand(["hit_pocket"]), bag: ["aging_flick"], triangle: { leftBase: null, rightBase: null, apex: placed("size_count") } });
  const unknown = rules.forecast(blind, toApex);
  run.same("pot prévu, bille inconnue : empochée sans être nommée", [{ marble: null, lost: false, entry: null }], unknown.hit.pockets);
  run("pot prévu, bille inconnue : incertaine", true, unknown.uncertain);
  run("pot prévu, bille inconnue : aucun Éveil possible", false, unknown.awakenPossible);
  const frozen = deepFreeze(structuredClone(hitPocket));
  run("pot prévu : l'état reçu n'est pas modifié", true, rules.forecast(frozen, toApex).ok);
  run.same("pot prévu : ni son pot", [], frozen.pot);
}

// Les réactions du pot dans la prévision : déterministes et incluses, celles de la
// pose à part (`potReactions`), celles de la résolution regroupées par bille avec
// son effet de résolution (`potEffects`) ; égales au réel.
function checkReactionForecast(run) {
  const matches = (marbles, state, action) => {
    const real = action === null ? { state, events: [] } : marbles.reduce(state, action);
    const resolved = marbles.reduce(real.state, { type: "resolve" });
    const { uncertain, awakenPossible, ...predicted } = marbles.forecast(state, action);
    return JSON.stringify(predicted) === JSON.stringify(readForecast(real.events, resolved.events, resolved.state));
  };
  const toApex = { type: "place", handIndex: 0, slot: "apex" };
  const values = (outcomes) => outcomes.map(({ marble, speed, mass }) => ({ marble, speed, mass }));

  // Pendant la pose : all_rounder à la Chiquenaude, size_count à l'éjection.
  const placing = playState({ hand: inHand(["aging_flick"]), pot: ["size_count", "all_rounder"], triangle: { leftBase: null, rightBase: null, apex: placed("hit_polish") } });
  const predicted = rules.forecast(placing, toApex);
  run.same(
    "réactions prévues, pose : par bille, dans l'ordre d'arrivée",
    [
      { marble: "size_count", speed: 0, mass: 1 },
      { marble: "all_rounder", speed: 2, mass: 0 },
    ],
    values(predicted.potReactions)
  );
  run("réactions prévues, pose : rien pendant la résolution", 0, predicted.potEffects.length);
  run("réactions prévues : dans la Vitesse prévue (Tic 2 + all_rounder 2 + phase 4)", 8, predicted.speed);
  run("réactions prévues, pose : égal au réel", true, matches(rules, placing, toApex));

  // Pendant la résolution : awaken_draw au mélange.
  const shuffling = playState({ bag: [], discard: ["aging_flick", "hit_polish"], hand: inHand([]), pot: ["awaken_draw"], triangle: { leftBase: placed("awaken_draw"), rightBase: null, apex: placed("fragile", 1) } });
  const resolving = rules.forecast(shuffling);
  run.same("réactions prévues, résolution : le Polissage de awaken_draw", [{ action: "polish", amount: 1, target: "apex" }], resolving.potEffects[0].operations);
  run("réactions prévues, résolution : égal au réel", true, matches(rules, shuffling, null));

  // Regroupées : l'effet de résolution et les réactions d'une même bille en un.
  const made = fabricatedRules({
    plain: { apex: [{ action: "speed", amount: 1 }] },
    both: { pocketed: { resolution: [{ action: "mass", amount: 1 }], apex: [{ action: "speed", amount: 2 }] } },
    quiet: { pocketed: { shuffles: [{ action: "speed", amount: 1 }] } },
  });
  const grouped = playState({ pot: ["both", "quiet"], triangle: { leftBase: null, rightBase: null, apex: placed("plain") } });
  run.same(
    "réactions prévues : regroupées par bille, la bille qui ne joue rien absente",
    [{ marble: "both", speed: 2, mass: 1 }],
    values(made.forecast(grouped).potEffects)
  );
  run("réactions prévues, regroupées : égal au réel", true, matches(made, grouped, null));

  // Une boucle indirecte : la prévision le sait aussi.
  const looping = fabricatedRules({
    sturdy: { maxWear: 100 },
    polisher: { flick: [{ action: "polish", amount: 1, target: "apex" }] },
    cracker: { pocketed: { polish: [{ action: "crack", amount: 1, target: "apex" }] } },
    healer: { pocketed: { crack: [{ action: "polish", amount: 1, target: "apex" }] } },
  });
  const loop = playState({ hand: inHand(["polisher"]), pot: ["cracker", "healer"], triangle: { leftBase: null, rightBase: null, apex: placed("sturdy", 50) } });
  run("prévision, boucle : interrompue, dit", true, looping.forecast(loop, { type: "place", handIndex: 0, slot: "leftBase" }).interrupted);
  run("prévision, sans boucle : rien d'interrompu", false, predicted.interrupted);
}

// Le CHOIX dans la prévision : elle ne le devine pas (« selon votre choix »), sauf
// quand il n'y a rien à choisir ; la prévision d'une réponse rejoue l'action à
// l'aveugle avec elle, et égale le réel (le joueur glouton s'en sert : domaine
// marbles-tools).
function checkChoiceForecast(run) {
  const toApex = { type: "place", handIndex: 0, slot: "apex" };
  const hitPolish = playState({ hand: inHand(["hit_polish"]), triangle: { leftBase: placed("fragile", 1), rightBase: null, apex: placed("aging_flick") } });
  const predicted = choiceRules.forecast(hitPolish, toApex);
  run.same("choix prévu : indécis, chez le Tic de hit_polish", [{ action: "polish" }], predicted.hit.undecided);
  run("choix prévu : la prévision le dit", true, predicted.choiceDependent);
  run("choix prévu : rien n'est appliqué (fragile s'use)", "fragile", predicted.retired.find((retired) => retired.slot === "leftBase")?.marble);

  // Une réponse prévue : le Polissage de fragile (usure 1 sur 2) la sauve.
  const real = choiceRules.reduce(hitPolish, toApex);
  const answer = { type: "choose", target: { zone: "triangle", slot: "leftBase" } };
  const answered = choiceRules.forecast(real.state, answer);
  run("réponse prévue : fragile sauvée", false, answered.retired.some((retired) => retired.marble === "fragile"));
  run("réponse prévue : plus rien d'indécis", false, answered.choiceDependent);
  const chosen = choiceRules.reduce(real.state, answer);
  const resolved = choiceRules.reduce(chosen.state, { type: "resolve" });
  run("réponse prévue : l'Impact réel", resolved.state.score - real.state.score, answered.impact);
  run("réponse prévue : une réponse refusée, refusée", "invalidChoice", choiceRules.forecast(real.state, { type: "choose", target: { zone: "triangle", slot: "rightBase" } }).error);
  run("réponse prévue : l'état reçu n'est pas modifié", true, (() => {
    const frozen = deepFreeze(structuredClone(real.state));
    return choiceRules.forecast(frozen, answer).ok;
  })());

  // Un rejeu qui DIVERGE : la Chiquenaude de drawer pioche waker, dont l'Éveil empoche
  // la première de la main (first) ; puis drawer fait empocher une bille de la main
  // au choix. En vrai, la main est alors [second, waker] ; à l'aveugle, l'Éveil de la
  // bille piochée (inconnue) ne joue pas, la main reste [first, second, ?]. La
  // réponse « place 0 » désigne second en vrai, first à l'aveugle : la réponse se
  // repère par sa bille, le choix reste indécis au lieu de prévoir first.
  const choice = (zones) => ({ type: "choice", zones, pick: "marble", count: 1 });
  const diverging = fabricatedRules({
    first: {},
    second: {},
    waker: { awaken: [{ action: "pocket", target: "firstInHand" }] },
    drawer: { flick: [{ action: "draw", amount: 1 }, { action: "pocket", target: choice(["hand"]) }] },
  });
  const drawing = diverging.reduce(playState({ hand: inHand(["drawer", "first", "second"]), bag: ["waker"] }), toApex);
  run.same(
    "réponse prévue, rejeu divergent : en vrai, le choix porte sur la main d'après l'Éveil",
    ["second", "waker"],
    drawing.state.pendingChoice.eligible.map((target) => target.marble)
  );
  const firstPlace = { type: "choose", target: { zone: "hand", index: 0 } };
  run("réponse prévue, rejeu divergent : une autre bille à cette place, le choix reste indécis", true, diverging.forecast(drawing.state, firstPlace).choiceDependent);
  run.same(
    "réponse prévue, rejeu divergent : le réel empoche bien second",
    ["first", "second"],
    diverging.reduce(drawing.state, firstPlace).state.pot
  );
}

// ÉJECTER dans la prévision : déterministe ; les billes chassées chez l'effet qui
// éjecte, avec leur Éjection provoquée ; la pose sans Éjection ni Tic quand la
// Chiquenaude vide l'emplacement ; une bille chassée avant sa phase, retirée avant.
// Égale au réel.
function checkEjectForecast(run) {
  const matches = (marbles, state, action) => {
    const real = action === null ? { state, events: [] } : marbles.reduce(state, action);
    const resolved = marbles.reduce(real.state, { type: "resolve" });
    const { uncertain, awakenPossible, ...predicted } = marbles.forecast(state, action);
    return JSON.stringify(predicted) === JSON.stringify(readForecast(real.events, resolved.events, resolved.state));
  };
  const toApex = { type: "place", handIndex: 0, slot: "apex" };
  const flickStrike = playState({ hand: inHand(["flick_strike"]), triangle: { leftBase: null, rightBase: null, apex: placed("tally_flick") } });
  const predicted = choiceRules.forecast(flickStrike, toApex);
  run.same(
    "Éjecter prévu : chez la Chiquenaude, tally_flick et son Éjection",
    [{ marble: "tally_flick", slot: "apex", knockout: { marble: "tally_flick", speed: 3, mass: 0, draw: 0, operations: [], given: [] } }],
    predicted.flick.ejected
  );
  run("Éjecter prévu : pas d'Éjection de la pose", null, predicted.knockout);
  run("Éjecter prévu : pas de Tic", null, predicted.hit);
  run("Éjecter prévu : égal au réel", true, matches(choiceRules, flickStrike, toApex));

  const oneShot = playState({ bag: ["aging_flick"], triangle: { leftBase: placed("tally_flick"), rightBase: placed("aging_flick"), apex: placed("one_shot") } });
  run.same("Éjecter prévu, Final : tally_flick chassée", ["tally_flick"], choiceRules.forecast(oneShot).slotEffects.apex[0].ejected.map((ejected) => ejected.marble));
  run("Éjecter prévu, Final : égal au réel", true, matches(choiceRules, oneShot, null));

  // Avant sa phase : la bille chassée se dit retirée avant.
  const made = fabricatedRules({ early: { base: [{ action: "eject", target: "apex" }] }, plain: { apex: [{ action: "speed", amount: 2 }] } });
  const early = playState({ triangle: { leftBase: placed("early"), rightBase: null, apex: placed("plain") } });
  const earlyForecast = made.forecast(early);
  run("Éjecter prévu, avant la phase : la pointe retirée avant", "plain", earlyForecast.cleared.apex);
  run("Éjecter prévu, avant la phase : pas de phase", null, earlyForecast.phases.apex);
  run("Éjecter prévu, avant la phase : égal au réel", true, matches(made, early, null));

  // Au choix : selon votre choix.
  const allRounder = playState({ triangle: { leftBase: placed("all_rounder"), rightBase: null, apex: placed("aging_flick") } });
  run.same("Éjecter au choix prévu : indécis", [{ action: "eject" }], choiceRules.forecast(allRounder).phases.leftBase.undecided);
}

// Polissage et Fêlure : la prévision montre leurs conséquences, comme le réel.
function checkWearForecast(run) {
  // fragile sans le Polissage au choix de son Final (la table sans choix) : ce cas
  // porte sur la Fêlure.
  const crackerRules = fabricatedRules({
    cracker: { base: [{ action: "crack", amount: 1, target: "apex" }] },
    fragile: CHOICELESS_TYPES.fragile,
    aging_flick: FIXTURE_TYPES.aging_flick,
  });
  const cracking = playState({ hand: inHand([]), bag: ["aging_flick"], triangle: { leftBase: placed("cracker"), rightBase: null, apex: placed("fragile", 1) } });
  const predicted = crackerRules.forecast(cracking);
  run.same("Fêlure prévue : chez la bille qui la produit", [{ action: "crack", amount: 1, target: "apex" }], predicted.phases.leftBase.operations);
  run("Fêlure prévue : la pointe n'a pas de phase", null, predicted.phases.apex);
  run("Fêlure prévue : fragile retirée avant sa phase", "fragile", predicted.cleared.apex);
  run("Fêlure prévue : son Final", 4, predicted.slotEffects.apex[0].speed);
  run.same("Fêlure prévue : les retraits", [{ slot: "apex", marble: "fragile" }], predicted.retired);
  const real = crackerRules.reduce(cracking, { type: "resolve" });
  run.same("Fêlure prévue : comme le réel, usure comprise", JSON.stringify((({ uncertain, awakenPossible, ...rest }) => rest)(predicted)), JSON.stringify(readForecast([], real.events, real.state)));

  const saving = playState({ hand: inHand([]), bag: ["aging_flick"], triangle: { leftBase: placed("final_pocket", 2), rightBase: null, apex: placed("fragile", 1) } });
  const saved = rules.forecast(saving);
  run.same("Polissage prévu : fragile sauvée n'est pas retirée", [{ slot: "leftBase", marble: "final_pocket" }], saved.retired);
  run.same("Polissage prévu : pas de Final pour elle", [], saved.slotEffects.apex);
  run.same("Polissage prévu : le Final de final_pocket le dit, puis elle s'empoche", [{ action: "polish", amount: 1, target: "apex" }, { action: "pocket" }], saved.slotEffects.leftBase[0].operations);

  // Un bonus perdu (phase passée) n'apparaît nulle part dans la prévision.
  const lostRules = fabricatedRules({ late: { base: [{ action: "speed", amount: 3, target: "rightBase" }] }, plain: { base: [{ action: "speed", amount: 1 }] } });
  const lost = lostRules.forecast(playState({ hand: inHand([]), triangle: { leftBase: placed("plain"), rightBase: placed("late"), apex: null } }));
  run("bonus perdu : absent de la prévision", 1, lost.speed);
  run.same("bonus perdu : rien de donné", [], lost.phases.rightBase.given);
}

function checkCases(run) {
  // Bille active, sur le triangle actuel : bonus reçu annoncé chez elle.
  const triangle = { leftBase: placed("tally_flick"), rightBase: placed("hit_polish"), apex: placed("hit_pocket") };
  const current = rules.forecast(playState({ triangle, hand: inHand(["aging_flick", "final_pocket"]) }));
  run.same("triangle actuel : hit_pocket, bonus compris", { marble: "hit_pocket", speed: 10, mass: 0, draw: 0, operations: [], given: [] }, current.phases.apex);
  run.same(
    "triangle actuel : tally_flick dit ce qu'elle donne",
    { marble: "tally_flick", speed: 0, mass: 0, draw: 0, operations: [], given: [{ slot: "apex", marble: "hit_pocket", speed: 4, mass: 0 }] },
    current.phases.leftBase
  );
  run.same("triangle actuel : hit_polish", { marble: "hit_polish", speed: 0, mass: 1, draw: 0, operations: [], given: [] }, current.phases.rightBase);
  run("triangle actuel : ni Éjection", null, current.knockout);
  run("triangle actuel : ni Tic", null, current.hit);
  run("triangle actuel : Impact du tour", 20, current.impact);
  const holes = rules.forecast(playState({ triangle: { leftBase: null, rightBase: null, apex: placed("aging_flick") } }));
  run("triangle actuel : emplacement vide", null, holes.phases.leftBase);

  // Bille de la main, posée : triangle simulé, Éjection et Tic compris.
  const state = playState({ triangle, hand: inHand(["aging_flick", "final_pocket"]) });
  const replacing = rules.forecast(state, { type: "place", handIndex: 0, slot: "apex" });
  run.same("pose : effet de phase sur le triangle simulé", { marble: "aging_flick", speed: 8, mass: 0, draw: 0, operations: [], given: [] }, replacing.phases.apex);
  run.same("pose : Éjection de la bille remplacée", { marble: "hit_pocket", speed: 3, mass: 0, draw: 0, operations: [], given: [] }, replacing.knockout);
  run.same("pose : Tic de la bille posée", { marble: "aging_flick", speed: 2, mass: 0, draw: 0, operations: [], given: [] }, replacing.hit);
  run("pose : Vitesse totale, Éjection et Tic compris", 13, replacing.speed);

  const noBonus = rules.forecast(state, { type: "place", handIndex: 1, slot: "apex" });
  run.same("pose : une final_pocket ne reçoit rien de tally_flick", { marble: "final_pocket", speed: 0, mass: 1, draw: 0, operations: [], given: [] }, noBonus.phases.apex);
  run.same("pose : tally_flick ne donne plus rien", [], noBonus.phases.leftBase.given);
  run.same("pose : Tic de final_pocket", { marble: "final_pocket", speed: 0, mass: 1, draw: 0, operations: [], given: [] }, noBonus.hit);

  const withLens = rules.forecast(playState({ hand: inHand(["tally_flick"]), triangle: { leftBase: null, rightBase: null, apex: placed("aging_flick") } }), { type: "place", handIndex: 0, slot: "leftBase" });
  run("pose sur vide : le bonus s'annonce chez la bille qui le reçoit", 8, withLens.phases.apex.speed);
  run("pose sur vide : ni Éjection", null, withLens.knockout);
  run("pose sur vide : ni Tic", null, withLens.hit);

  const plain = rules.forecast(playState({ hand: inHand(["all_rounder"]), triangle: { leftBase: null, rightBase: null, apex: placed("fragile") } }), { type: "place", handIndex: 0, slot: "apex" });
  run("sans Éjection imprimée : rien à prévoir", null, plain.knockout);
  run("sans Tic imprimé : rien à prévoir", null, plain.hit);

  // Échange : le moteur le prend comme le reste, sans Tic ni Éjection.
  const swapped = rules.forecast(state, { type: "swap", a: "leftBase", b: "rightBase" });
  run("échange : tally_flick en base droite, Vitesse +1", 1, swapped.phases.rightBase.speed);
  run("échange : plus de bonus sur hit_pocket", 6, swapped.phases.apex.speed);
  run("échange : ni Éjection", null, swapped.knockout);

  // Compteurs déjà modifiés : la résolution en part.
  const counters = rules.forecast(playState({ speed: 5, mass: 2, triangle: { leftBase: null, rightBase: null, apex: placed("aging_flick") } }));
  run("compteurs : la prévision en part", 18, counters.impact);

  // Tour 1 : le triangle incomplet se prévoit et se résout, comme le réel.
  const firstTurn = apply(rules.createGame(42), { type: "draw" });
  const partial = rules.forecast(firstTurn, { type: "place", handIndex: 0, slot: "apex" });
  run("tour 1 : la prévision passe sur un triangle incomplet", true, partial.ok);
  const placedFirst = apply(firstTurn, { type: "place", handIndex: 0, slot: "apex" });
  run("tour 1 : le triangle incomplet se résout aussi", true, rules.reduce(placedFirst, { type: "resolve" }).ok);
  run("tour 1 : prévision égale au réel", rules.reduce(placedFirst, { type: "resolve" }).events.find((event) => event.type === "impact").impact, partial.impact);
}

function apply(state, action) {
  const result = rules.reduce(state, action);
  if (!result.ok) throw new Error(`action refusée (${result.error}) : ${JSON.stringify(action)}`);
  return result.state;
}

function checkGuards(run) {
  // Jamais de modification : ni l'état réel, ni le générateur, ni le sac.
  const game = apply(rules.createGame(77), { type: "draw" });
  const state = deepFreeze({
    ...game,
    turn: 2,
    triangle: { leftBase: placed("tally_flick"), rightBase: placed("one_shot", 0), apex: placed("hit_pocket", 2) },
  });
  const before = JSON.stringify(state);
  rules.forecast(state);
  rules.forecast(state, { type: "place", handIndex: 0, slot: "apex" });
  rules.forecast(state, { type: "swap", a: "leftBase", b: "apex" });
  run("garde-fou : état réel intact, sur un état figé", before, JSON.stringify(state));

  // Rien de caché n'influe : même prévision quel que soit le sac ou le hasard.
  const action = { type: "place", handIndex: 0, slot: "apex" };
  const reference = rules.forecast(state, action);
  run.same("garde-fou : le sac n'influe pas", reference, rules.forecast({ ...state, bag: ["one_shot", "one_shot"] }, action));
  run.same("garde-fou : l'état du hasard n'influe pas", reference, rules.forecast({ ...state, rngState: state.rngState + 1 }, action));
  run.same("garde-fou : la défausse et l'ordre de pioche n'influent pas sur l'avenir", reference, rules.forecast({ ...state, bag: [...state.bag].reverse() }, action));

  // Le réel se joue ensuite exactement comme sans prévision.
  const untouched = apply(rules.createGame(77), { type: "draw" });
  const looked = apply(rules.createGame(77), { type: "draw" });
  rules.forecast(looked, { type: "place", handIndex: 0, slot: "apex" });
  run.same("garde-fou : prévoir ne change rien au réel", rules.reduce(untouched, { type: "place", handIndex: 0, slot: "apex" }), rules.reduce(looked, { type: "place", handIndex: 0, slot: "apex" }));

  // Refus : mêmes codes que le réducteur, jamais de pioche envisagée.
  const before1 = rules.createGame(77);
  run("refus : avant la pioche", "mustDraw", rules.forecast(before1).error);
  run("refus : une pioche ne s'envisage pas", "unknownAction", rules.forecast(state, { type: "draw" }).error);
  run("refus : une résolution ne s'envisage pas", "unknownAction", rules.forecast(state, { type: "resolve" }).error);
  run("refus : pose impossible, code du réducteur", "invalidHandIndex", rules.forecast(state, { type: "place", handIndex: 9, slot: "apex" }).error);
  run("refus : échange impossible, code du réducteur", "swapSameSlot", rules.forecast(state, { type: "swap", a: "apex", b: "apex" }).error);
  run("refus : partie finie", "gameOver", rules.forecast({ ...state, stage: "over" }).error);
}

// Des billes fictives qui mêlent cibles, conditions et valeurs négatives : ce que
// la table du jeu ne fait pas encore.
const MIXED_TYPES = {
  plain: { base: [{ action: "speed", amount: 1 }], apex: [{ action: "speed", amount: 3 }] },
  heavy: { base: [{ action: "mass", amount: 2 }], apex: [{ action: "mass", amount: -1 }], maxWear: 2 },
  giver: {
    base: [{ action: "speed", amount: 2, target: "apex" }, { action: "mass", amount: 1, target: "rightBase" }],
    hit: [{ action: "speed", amount: 2, target: "apex" }, { action: "speed", amount: 1 }],
    knockout: [{ action: "speed", amount: 3, target: "leftBase" }],
  },
  lens: {
    baseVariant: { leftBase: [{ action: "speed", amount: 4, target: "apex", when: { type: "printedStat", slot: "apex", stat: "speed", atLeast: 1 } }] },
    apex: [{ action: "speed", amount: 2, when: { type: "printedStat", slot: "leftBase", stat: "mass", atLeast: 1 } }],
    hit: [{ action: "mass", amount: 1, when: { type: "printedStat", slot: "rightBase", stat: "speed", atLeast: 1 } }],
  },
  thief: { knockout: [{ action: "speed", amount: -4 }, { action: "mass", amount: -2 }], apex: [{ action: "speed", amount: -2 }], maxWear: 1 },
};
const mixedRules = fabricatedRules(MIXED_TYPES);

function checkMatchesReality(run) {
  const faults = [];
  const tally = emptyForecastTally();
  const mixedBag = ["plain", "plain", "heavy", "giver", "giver", "lens", "lens", "thief", "thief", "plain"];
  for (let seed = 1; seed <= 60; seed++) {
    walkForecastGame(choiceRules, seed, {}, faults, tally);
    walkForecastGame(mixedRules, seed + 1000, { bag: mixedBag }, faults, tally);
  }
  run.same("propriété : la prévision correspond au résultat réel", [], faults.slice(0, 3));
  run("propriété : plusieurs centaines d'états", true, tally.states >= 300);
  run("propriété : des milliers d'actions comparées", true, tally.actions >= 2000);
  run("propriété : des choix réels rencontrés, chacun annoncé par la prévision", true, tally.choices > 0);
  run("propriété : des Éveils réels rencontrés, chacun annoncé incertain", true, tally.awakened > 0);
}

// L'Éveil dans la prévision : jamais compté, annoncé possible (« incertain ») quand
// une bille est piochée et qu'une bille qui pouvait l'être en a un.
function checkAwakenForecast(run) {
  const toApex = { type: "place", handIndex: 0, slot: "apex" };
  const occupied = { leftBase: null, rightBase: null, apex: placed("hit_polish") };
  const tic = (bag, discard = []) => playState({ hand: inHand(["split_base"]), bag, discard, triangle: occupied });
  run("éveil prévu : une pioche, all_rounder au sac, incertaine", true, rules.forecast(tic(["all_rounder"]), toApex).uncertain);
  run("éveil prévu : une pioche, aucune bille du sac n'a d'Éveil, certaine", false, rules.forecast(tic(["base_pocket", "aging_flick"]), toApex).uncertain);
  run("éveil prévu : all_rounder en défausse, sans régénération, certaine", false, rules.forecast(tic(["aging_flick"], ["all_rounder"]), toApex).uncertain);
  run("éveil prévu : all_rounder en défausse, avec régénération, incertaine", true, rules.forecast(tic([], ["all_rounder"]), toApex).uncertain);
  run(
    "éveil prévu : aucune pioche, all_rounder au sac, certaine",
    false,
    rules.forecast(playState({ hand: inHand(["aging_flick"]), bag: ["all_rounder"], triangle: occupied }), toApex).uncertain
  );
  // Jamais compté : all_rounder piochée par le Tic s'éveille (Vitesse +2) en vrai.
  const state = tic(["all_rounder"]);
  const predicted = rules.forecast(state, toApex);
  const real = rules.reduce(state, toApex);
  run("éveil prévu : l'effet réel a lieu", 2, real.events.find((event) => event.trigger === "awaken")?.speedDelta);
  const resolved = rules.reduce(real.state, { type: "resolve" });
  run("éveil prévu : jamais dans les valeurs prévues (Vitesse prévue = réelle − 2)", resolved.events.find((event) => event.type === "impact").speed - 2, predicted.speed);
  run.same("éveil prévu : ni dans le registre de la copie", { turn: 0, game: 0 }, predicted.tally.awaken);
}
