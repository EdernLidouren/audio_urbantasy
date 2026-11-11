// Vérifications du core — domaine « marbles-forecast ». La prévision du jeu des
// billes (core/marbles-forecast.js) : les cas nécessaires, ses garde-fous, et la
// propriété clé : sur des centaines d'états aléatoires à graine, la prévision de
// chaque action envisagée correspond exactement au résultat réel de cette action
// suivie de la résolution. Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js marbles-forecast`).

import { nextRandom } from "../rng.js";
import { SLOTS, TALLY_COUNTERS, createMarblesGame, marblesReduce } from "../marbles.js";
import { emptyTally } from "../marbles-tally.js";
import { forecast, readForecast } from "../marbles-forecast.js";
import MARBLE_TYPES from "../../marbles/types/index.js";
import { emptyBagMarblesGame, inHand, withSizes } from "./helpers.js";
import { createMarblesRules } from "../marbles-rules.js";

// Tables fabriquées : complétées d'un calibre (core/checks/helpers.js/withSizes).
const fabricatedRules = (table) => createMarblesRules(withSizes(table));

// Les règles du jeu, liées à la vraie table (core/marbles-rules.js).
const rules = createMarblesRules(MARBLE_TYPES);

const placed = (marble, wear = 0) => ({ marble, wear });

function playState(over = {}) {
  return { ...emptyBagMarblesGame(rules, 1), turn: 2, stage: "play", ...over };
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export default function checkMarblesForecast(run) {
  checkCases(run);
  checkBlindDraws(run);
  checkFinalForecast(run);
  checkWearForecast(run);
  checkFlickForecast(run);
  checkWindfallForecast(run);
  checkTallyForecast(run);
  checkAwakenForecast(run);
  checkPocketForecast(run);
  checkGuards(run);
  checkMatchesReality(run);
}

// La pioche À L'AVEUGLE : la prévision compte les billes et annonce la
// régénération, sans jamais dire lesquelles, ni toucher au hasard de la partie.
function checkBlindDraws(run) {
  const occupied = { leftBase: null, rightBase: null, apex: placed("stoneware") };
  // Le sulfure n'est qu'au sac : la prévision ne doit jamais le nommer.
  const state = playState({ hand: inHand(["cats_eye"]), bag: ["sulphide"], discard: [], triangle: occupied });
  const predicted = rules.forecast(state, { type: "place", handIndex: 0, slot: "apex" });
  run.same("aveugle : l'Éjection pioche 1", { marble: "stoneware", speed: 0, mass: 0, draw: 1, operations: [], given: [] }, predicted.knockout);
  run.same("aveugle : le Tic pioche 1", { marble: "cats_eye", speed: 0, mass: 0, draw: 1, operations: [], given: [] }, predicted.hit);
  run("aveugle : deux billes piochées", 2, predicted.drawn);
  run("aveugle : la seconde régénère le sac (le grès éjecté)", 1, predicted.regenerations.length);
  run("aveugle : aucune bille du sac révélée", false, JSON.stringify(predicted).includes("sulphide"));
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
  const phase = rules.forecast(playState({ hand: inHand([]), bag: [], discard: [], triangle: { leftBase: placed("mica"), rightBase: null, apex: null } }));
  run.same("aveugle : la phase du mica, Pioche 1", { marble: "mica", speed: 0, mass: 0, draw: 1, operations: [], given: [] }, phase.phases.leftBase);
  run("aveugle : rien à piocher, rien de pioché", 0, phase.drawn);
  run.same("aveugle : ni régénération", [], phase.regenerations);
}

// Le Final se prévoit avec l'emplacement de sa bille, seulement si elle atteint son
// usure maximale ce tour.
function checkFinalForecast(run) {
  const worn = rules.forecast(playState({ hand: inHand([]), bag: ["clay"], triangle: { leftBase: null, rightBase: null, apex: placed("porcelain", 1) } }));
  run.same("final prévu : la porcelaine usée ce tour", [{ trigger: "final", marble: "porcelain", speed: 4, mass: 0, draw: 0, operations: [], given: [] }], worn.slotEffects.apex);
  run("final prévu : compté dans l'Impact (5 + 4)", 9, worn.impact);
  run.same("final prévu : rien ailleurs", [[], []], [worn.slotEffects.leftBase, worn.slotEffects.rightBase]);
  const fresh = rules.forecast(playState({ hand: inHand([]), bag: ["clay"], triangle: { leftBase: null, rightBase: null, apex: placed("porcelain", 0) } }));
  run.same("final prévu : pas usée ce tour, pas de Final", [], fresh.slotEffects.apex);
  run("final prévu : ni dans l'Impact", 5, fresh.impact);
  const giant = rules.forecast(playState({ hand: inHand(["giant"]), bag: ["agate"] }), { type: "place", handIndex: 0, slot: "leftBase" });
  run("final prévu : la géante posée pioche à son Final", 1, giant.slotEffects.leftBase[0].draw);
  run("final prévu : une bille piochée", 1, giant.drawn);
  run("final prévu : aucune bille du sac révélée", false, JSON.stringify(giant).includes("agate"));
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

  const clay = playState({ hand: inHand(["clay"], 3), triangle: { leftBase: null, rightBase: null, apex: placed("tiger") } });
  const predicted = rules.forecast(clay, toApex);
  run("chiquenaude prévue : le montant calculé, 3 tours en main", 3, predicted.flick.speed);
  run("chiquenaude prévue : égale au réel", true, matches(clay, toApex));

  const clearing = playState({ hand: inHand(["leaded"]), triangle: { leftBase: null, rightBase: null, apex: placed("porcelain") } });
  const cleared = rules.forecast(clearing, toApex);
  run.same(
    "chiquenaude prévue qui vide l'emplacement : sa Fêlure, ni Éjection ni Tic",
    { flick: [{ action: "crack", amount: 3, target: "apex" }], knockout: null, hit: null },
    { flick: cleared.flick.operations, knockout: cleared.knockout, hit: cleared.hit }
  );
  run.same("chiquenaude prévue qui vide l'emplacement : le Final de l'occupante", [{ marble: "porcelain", speed: 4 }], cleared.slotEffects.apex.map(({ marble, speed }) => ({ marble, speed })));
  run("chiquenaude prévue qui vide l'emplacement : égale au réel", true, matches(clearing, toApex));
  run("chiquenaude prévue : sans le champ, null", null, rules.forecast(playState({ hand: inHand(["tiger"]) }), toApex).flick);
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
    hand: inHand(["cats_eye"]),
    bag: [],
    discard: ["clay"],
    triangle: { leftBase: placed("tiger"), rightBase: placed("agate", 1), apex: placed("glass") },
  });
  const predicted = rules.forecast(play, toApex);
  run.same(
    "trouvaille prévue, pose : chez les billes actives, dans l'ordre",
    [
      { trigger: "windfall", slot: "leftBase", marble: "tiger", speed: 3 },
      { trigger: "windfall", slot: "rightBase", marble: "agate", speed: 0 },
    ],
    predicted.regenerations[0].effects.map(({ trigger, slot, marble, speed }) => ({ trigger, slot, marble, speed }))
  );
  run("trouvaille prévue, pose : aucune bille du sac révélée", false, JSON.stringify(predicted).includes("clay"));
  run("trouvaille prévue, pose : certaine, les billes actives sont connues", false, predicted.uncertain);
  run("trouvaille prévue, pose : égale au réel", true, matches(play, toApex));

  const resolving = playState({ bag: [], discard: ["clay"], triangle: { leftBase: placed("mica"), rightBase: placed("giant"), apex: placed("tiger") } });
  // Deux régénérations : la Pioche du mica, puis celle du Final de la géante ; la
  // tigrée trouve à chacune, et chaque Trouvaille reste avec la sienne.
  run.same(
    "trouvaille prévue, résolution : deux régénérations, la tigrée à chacune",
    [["tiger"], ["tiger"]],
    rules.forecast(resolving).regenerations.map(({ effects }) => effects.map((effect) => effect.marble))
  );
  // La géante repioche sa propre bille après son Final, qui s'éveille (Polissage à la
  // pointe) : un Éveil réel, que la prévision ne dit pas, mais annonce incertaine.
  run("trouvaille prévue, résolution : la géante repiochée peut s'éveiller, prévision incertaine", true, rules.forecast(resolving).uncertain);
  const cracking = playState({
    hand: inHand(["cats_eye"]),
    bag: [],
    discard: ["clay"],
    triangle: { leftBase: placed("sulphide"), rightBase: placed("porcelain", 1), apex: placed("glass") },
  });
  run("trouvaille prévue, Fêlure et Final : égale au réel", true, matches(cracking, toApex));
  run.same("trouvaille prévue : rien sans régénération", [], rules.forecast(playState({ triangle: { leftBase: placed("tiger"), rightBase: null, apex: null } })).regenerations);
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

  // La loupe : sa Chiquenaude lit le registre de la copie, elle-même comprise.
  const first = playState({ hand: inHand(["magnifier"]) });
  run("valeurs prévues : première chiquenaude du tour de la loupe, Vitesse +2", 2, rules.forecast(first, toApex).flick.speed);
  run("valeurs prévues : égales au réel", true, matches(first, toApex));
  const second = playState({ hand: inHand(["magnifier"]), tally: tally({ flick: { turn: 1, game: 1 } }) });
  run("valeurs prévues : deuxième chiquenaude, Vitesse +4", 4, rules.forecast(second, toApex).flick.speed);
  run("valeurs prévues : deuxième, égale au réel", true, matches(second, toApex));
  const capped = playState({ hand: inHand(["magnifier"]), tally: tally({ flick: { turn: 7, game: 7 } }) });
  run("valeurs prévues : plafond de la loupe, Vitesse +6", 6, rules.forecast(capped, toApex).flick.speed);

  // Un mélange en chemin (le Tic de l'œil-de-chat qui pioche) : la Trouvaille de la
  // tigrée et le mélange comptent dans le registre de la copie.
  const regenerating = playState({
    hand: inHand(["cats_eye"]),
    bag: [],
    discard: ["clay"],
    triangle: { leftBase: placed("tiger"), rightBase: null, apex: placed("glass") },
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

  // Le Tic du gorille empoche la porcelaine, qui entre avec Vitesse +10.
  const gorilla = playState({ hand: inHand(["gorilla", "porcelain"]), triangle: { leftBase: null, rightBase: null, apex: placed("clay") } });
  const predicted = rules.forecast(gorilla, toApex);
  run.same(
    "pot prévu : chez le Tic du gorille, la porcelaine et son entrée",
    [{ marble: "porcelain", lost: false, entry: { marble: "porcelain", speed: 10, mass: 0, draw: 0, operations: [], given: [] } }],
    predicted.hit.pockets
  );
  run("pot prévu : l'entrée dans la Vitesse prévue (Tic 4, entrée 10, pointe du gorille 6)", 20, predicted.speed);
  run("pot prévu : égal au réel", true, matches(gorilla, toApex));
  const full = { ...gorilla, pot: ["clay", "glass", "mica"] };
  run.same("pot prévu, plein : la porcelaine perdue, sans entrée", [{ marble: "porcelain", lost: true, entry: null }], rules.forecast(full, toApex).hit.pockets);
  run("pot prévu, plein : égal au réel", true, matches(full, toApex));

  // Le sulfure empoche la pointe pendant la résolution : phase sautée, entrée comptée.
  const sulphide = playState({ triangle: { leftBase: placed("sulphide"), rightBase: null, apex: placed("porcelain", 1) } });
  const resolving = rules.forecast(sulphide);
  run("pot prévu, résolution : la pointe retirée avant sa phase", "porcelain", resolving.cleared.apex);
  run("pot prévu, résolution : l'entrée chez le sulfure", 10, resolving.phases.leftBase.pockets[0].entry.speed);
  run("pot prévu, résolution : Impact 10", 10, resolving.impact);
  run("pot prévu, résolution : égal au réel", true, matches(sulphide, null));

  // Les billes du pot, à chaque résolution.
  const pot = playState({ triangle: { leftBase: placed("magnifier"), rightBase: null, apex: placed("porcelain") }, pot: ["agate", "glass", "sulphide"] });
  run.same(
    "pot prévu : les effets de chaque résolution, dans l'ordre d'arrivée, sans le verre",
    [
      { marble: "agate", speed: 0, mass: 1 },
      { marble: "sulphide", speed: 4, mass: 0 },
    ],
    rules.forecast(pot).potEffects.map(({ marble, speed, mass }) => ({ marble, speed, mass }))
  );
  run("pot prévu : égal au réel", true, matches(pot, null));
  // Le Final de l'agate l'empoche depuis la défausse ; elle joue au pot ce tour.
  const agate = playState({ triangle: { leftBase: null, rightBase: null, apex: placed("agate", 2) } });
  run("pot prévu : l'agate empochée par son Final", "agate", rules.forecast(agate).slotEffects.apex[0].pockets[0].marble);
  run("pot prévu : Final de l'agate, égal au réel", true, matches(agate, null));

  // Une bille piochée à l'aveugle puis empochée : inconnue, prévision incertaine,
  // sans Éveil possible pour autant.
  const blind = playState({ hand: inHand(["gorilla"]), bag: ["clay"], triangle: { leftBase: null, rightBase: null, apex: placed("stoneware") } });
  const unknown = rules.forecast(blind, toApex);
  run.same("pot prévu, bille inconnue : empochée sans être nommée", [{ marble: null, lost: false, entry: null }], unknown.hit.pockets);
  run("pot prévu, bille inconnue : incertaine", true, unknown.uncertain);
  run("pot prévu, bille inconnue : aucun Éveil possible", false, unknown.awakenPossible);
  const frozen = deepFreeze(structuredClone(gorilla));
  run("pot prévu : l'état reçu n'est pas modifié", true, rules.forecast(frozen, toApex).ok);
  run.same("pot prévu : ni son pot", [], frozen.pot);
}

// Polissage et Fêlure : la prévision montre leurs conséquences, comme le réel.
function checkWearForecast(run) {
  const crackerRules = fabricatedRules({ cracker: { base: [{ action: "crack", amount: 1, target: "apex" }] }, porcelain: MARBLE_TYPES.porcelain, clay: MARBLE_TYPES.clay });
  const cracking = playState({ hand: inHand([]), bag: ["clay"], triangle: { leftBase: placed("cracker"), rightBase: null, apex: placed("porcelain", 1) } });
  const predicted = crackerRules.forecast(cracking);
  run.same("Fêlure prévue : chez la bille qui la produit", [{ action: "crack", amount: 1, target: "apex" }], predicted.phases.leftBase.operations);
  run("Fêlure prévue : la pointe n'a pas de phase", null, predicted.phases.apex);
  run("Fêlure prévue : la porcelaine retirée avant sa phase", "porcelain", predicted.cleared.apex);
  run("Fêlure prévue : son Final", 4, predicted.slotEffects.apex[0].speed);
  run.same("Fêlure prévue : les retraits", [{ slot: "apex", marble: "porcelain" }], predicted.retired);
  const real = crackerRules.reduce(cracking, { type: "resolve" });
  run.same("Fêlure prévue : comme le réel, usure comprise", JSON.stringify((({ uncertain, awakenPossible, ...rest }) => rest)(predicted)), JSON.stringify(readForecast([], real.events, real.state)));

  const saving = playState({ hand: inHand([]), bag: ["clay"], triangle: { leftBase: placed("agate", 2), rightBase: null, apex: placed("porcelain", 1) } });
  const saved = rules.forecast(saving);
  run.same("Polissage prévu : la porcelaine sauvée n'est pas retirée", [{ slot: "leftBase", marble: "agate" }], saved.retired);
  run.same("Polissage prévu : pas de Final pour elle", [], saved.slotEffects.apex);
  run.same("Polissage prévu : le Final de l'agate le dit, puis elle s'empoche", [{ action: "polish", amount: 1, target: "apex" }, { action: "pocket" }], saved.slotEffects.leftBase[0].operations);

  // Un bonus perdu (phase passée) n'apparaît nulle part dans la prévision.
  const lostRules = fabricatedRules({ late: { base: [{ action: "speed", amount: 3, target: "rightBase" }] }, plain: { base: [{ action: "speed", amount: 1 }] } });
  const lost = lostRules.forecast(playState({ hand: inHand([]), triangle: { leftBase: placed("plain"), rightBase: placed("late"), apex: null } }));
  run("bonus perdu : absent de la prévision", 1, lost.speed);
  run.same("bonus perdu : rien de donné", [], lost.phases.rightBase.given);
}

function checkCases(run) {
  // Bille active, sur le triangle actuel : bonus reçu annoncé chez elle.
  const triangle = { leftBase: placed("magnifier"), rightBase: placed("glass"), apex: placed("gorilla") };
  const current = rules.forecast(playState({ triangle, hand: inHand(["clay", "agate"]) }));
  run.same("triangle actuel : le gorille, bonus compris", { marble: "gorilla", speed: 10, mass: 0, draw: 0, operations: [], given: [] }, current.phases.apex);
  run.same(
    "triangle actuel : la loupe dit ce qu'elle donne",
    { marble: "magnifier", speed: 0, mass: 0, draw: 0, operations: [], given: [{ slot: "apex", marble: "gorilla", speed: 4, mass: 0 }] },
    current.phases.leftBase
  );
  run.same("triangle actuel : le verre", { marble: "glass", speed: 0, mass: 1, draw: 0, operations: [], given: [] }, current.phases.rightBase);
  run("triangle actuel : ni Éjection", null, current.knockout);
  run("triangle actuel : ni Tic", null, current.hit);
  run("triangle actuel : Impact du tour", 20, current.impact);
  const holes = rules.forecast(playState({ triangle: { leftBase: null, rightBase: null, apex: placed("clay") } }));
  run("triangle actuel : emplacement vide", null, holes.phases.leftBase);

  // Bille de la main, posée : triangle simulé, Éjection et Tic compris.
  const state = playState({ triangle, hand: inHand(["clay", "agate"]) });
  const replacing = rules.forecast(state, { type: "place", handIndex: 0, slot: "apex" });
  run.same("pose : effet de phase sur le triangle simulé", { marble: "clay", speed: 8, mass: 0, draw: 0, operations: [], given: [] }, replacing.phases.apex);
  run.same("pose : Éjection de la bille remplacée", { marble: "gorilla", speed: 3, mass: 0, draw: 0, operations: [], given: [] }, replacing.knockout);
  run.same("pose : Tic de la bille posée", { marble: "clay", speed: 2, mass: 0, draw: 0, operations: [], given: [] }, replacing.hit);
  run("pose : Vitesse totale, Éjection et Tic compris", 13, replacing.speed);

  const noBonus = rules.forecast(state, { type: "place", handIndex: 1, slot: "apex" });
  run.same("pose : une agate ne reçoit rien de la loupe", { marble: "agate", speed: 0, mass: 1, draw: 0, operations: [], given: [] }, noBonus.phases.apex);
  run.same("pose : la loupe ne donne plus rien", [], noBonus.phases.leftBase.given);
  run.same("pose : Tic de l'agate", { marble: "agate", speed: 0, mass: 1, draw: 0, operations: [], given: [] }, noBonus.hit);

  const withLens = rules.forecast(playState({ hand: inHand(["magnifier"]), triangle: { leftBase: null, rightBase: null, apex: placed("clay") } }), { type: "place", handIndex: 0, slot: "leftBase" });
  run("pose sur vide : le bonus s'annonce chez la bille qui le reçoit", 8, withLens.phases.apex.speed);
  run("pose sur vide : ni Éjection", null, withLens.knockout);
  run("pose sur vide : ni Tic", null, withLens.hit);

  const plain = rules.forecast(playState({ hand: inHand(["tiger"]), triangle: { leftBase: null, rightBase: null, apex: placed("porcelain") } }), { type: "place", handIndex: 0, slot: "apex" });
  run("sans Éjection imprimée : rien à prévoir", null, plain.knockout);
  run("sans Tic imprimé : rien à prévoir", null, plain.hit);

  // Échange : le moteur le prend comme le reste, sans Tic ni Éjection.
  const swapped = rules.forecast(state, { type: "swap", a: "leftBase", b: "rightBase" });
  run("échange : la loupe en base droite, Vitesse +1", 1, swapped.phases.rightBase.speed);
  run("échange : plus de bonus sur le gorille", 6, swapped.phases.apex.speed);
  run("échange : ni Éjection", null, swapped.knockout);

  // Compteurs déjà modifiés : la résolution en part.
  const counters = rules.forecast(playState({ speed: 5, mass: 2, triangle: { leftBase: null, rightBase: null, apex: placed("clay") } }));
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
    triangle: { leftBase: placed("magnifier"), rightBase: placed("giant", 0), apex: placed("gorilla", 2) },
  });
  const before = JSON.stringify(state);
  rules.forecast(state);
  rules.forecast(state, { type: "place", handIndex: 0, slot: "apex" });
  rules.forecast(state, { type: "swap", a: "leftBase", b: "apex" });
  run("garde-fou : état réel intact, sur un état figé", before, JSON.stringify(state));

  // Rien de caché n'influe : même prévision quel que soit le sac ou le hasard.
  const action = { type: "place", handIndex: 0, slot: "apex" };
  const reference = rules.forecast(state, action);
  run.same("garde-fou : le sac n'influe pas", reference, rules.forecast({ ...state, bag: ["giant", "giant"] }, action));
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

function candidateActions(state) {
  const actions = [null];
  state.hand.forEach((_, handIndex) => {
    for (const slot of SLOTS) actions.push({ type: "place", handIndex, slot });
  });
  for (let i = 0; i < SLOTS.length; i++) {
    for (let j = i + 1; j < SLOTS.length; j++) actions.push({ type: "swap", a: SLOTS[i], b: SLOTS[j] });
  }
  return actions;
}

// Compare la prévision de chaque action au réel. `compared` : les comparaisons
// faites (une action refusée ou un triangle du tour 1 incomplet n'a pas de réel
// à quoi se comparer, la prévision doit alors dire le même refus).
function compareState(state, marbles, faults, tally) {
  tally.states += 1;
  for (const action of candidateActions(state)) {
    const predicted = marbles.forecast(state, action);
    const real = action === null ? { ok: true, state, events: [] } : marbles.reduce(state, action);
    if (!real.ok) {
      if (predicted.error !== real.error) faults.push(`refus différent : ${predicted.error} au lieu de ${real.error}`);
      continue;
    }
    const resolved = marbles.reduce(real.state, { type: "resolve" });
    if (!resolved.ok) {
      if (!predicted.ok) faults.push(`prévision refusée sur un tour 1 : ${predicted.error}`);
      continue;
    }
    tally.actions += 1;
    const actual = readForecast(real.events, resolved.events, resolved.state);
    const { uncertain, awakenPossible, ...certain } = predicted;
    // L'exception de l'Éveil (core/marbles-forecast.js) : un Éveil réel ne se
    // prévoit pas ; la prévision doit alors s'être dite incertaine, et seul ce qui
    // ne dépend d'aucun Éveil se compare. De même pour une bille piochée à l'aveugle
    // puis empochée : son identité, donc son entrée au pot, est inconnue.
    if (unknownPocket(predicted)) {
      tally.unknownPockets += 1;
      if (!uncertain) faults.push(`mise en poche inconnue sans prévision incertaine : ${JSON.stringify(action)}`);
      continue;
    }
    if (awakened(real.events, resolved.events)) {
      tally.awakened += 1;
      if (!uncertain) faults.push(`éveil réel sans prévision incertaine : ${JSON.stringify(action)}`);
      continue;
    }
    if (JSON.stringify(certain) !== JSON.stringify(actual)) {
      faults.push(`écart sur ${JSON.stringify(action)} : ${JSON.stringify(predicted)} au lieu de ${JSON.stringify(actual)}`);
    }
    if (resolved.state.score - state.score !== predicted.impact) {
      faults.push(`Impact prévu ${predicted.impact}, réel ${resolved.state.score - state.score}`);
    }
    // Les comptes tombent juste, lus indépendamment du journal d'Impact.
    const parts = [
      predicted.flick,
      predicted.knockout,
      predicted.hit,
      ...SLOTS.map((slot) => predicted.phases[slot]),
      ...SLOTS.flatMap((slot) => predicted.slotEffects[slot]),
      ...predicted.regenerations.flatMap(({ effects }) => effects),
      ...predicted.potEffects,
    ]
      .filter((part) => part !== null)
      .flatMap(withEntries);
    const speed = parts.reduce((total, part) => total + part.speed, state.speed);
    if (speed !== predicted.speed) faults.push(`Vitesse prévue ${predicted.speed}, somme des effets ${speed}`);
  }
}

// Un effet prévu et les effets d'entrée au pot de ce qu'il a empoché, à plat.
function withEntries(outcome) {
  return [outcome, ...(outcome.pockets ?? []).flatMap((moved) => (moved.entry === null ? [] : withEntries(moved.entry)))];
}

// Tous les effets d'une prévision, à plat.
function allOutcomes(predicted) {
  return [
    predicted.flick,
    predicted.knockout,
    predicted.hit,
    ...SLOTS.map((slot) => predicted.phases[slot]),
    ...SLOTS.flatMap((slot) => predicted.slotEffects[slot]),
    ...predicted.regenerations.flatMap(({ effects }) => effects),
    ...predicted.potEffects,
  ]
    .filter((part) => part !== null && part !== undefined)
    .flatMap(withEntries);
}

// La prévision a-t-elle empoché une bille inconnue (piochée à l'aveugle) ?
function unknownPocket(predicted) {
  return allOutcomes(predicted).some((outcome) => (outcome.pockets ?? []).some((moved) => moved.marble === null));
}

// Un Éveil a-t-il joué (un effet) dans ces journaux ?
function awakened(...journals) {
  return journals.flat().some((event) => event.type === "effect" && event.trigger === "awaken");
}

// Joue une partie au hasard, à graine (un PRNG de test, jamais celui de la
// partie), en comparant à chaque état de jeu.
function walkGame(seed, options, marbles, faults, tally) {
  let rngState = seed >>> 0;
  const pick = (count) => {
    const { value, state: next } = nextRandom(rngState);
    rngState = next;
    return Math.floor(value * count);
  };
  let state = marbles.createGame(seed, options);
  let guard = 0;
  while (state.stage !== "over" && guard < 400) {
    guard += 1;
    if (state.stage === "draw") {
      state = marbles.reduce(state, { type: "draw" }).state;
      continue;
    }
    compareState(state, marbles, faults, tally);
    const roll = pick(5);
    if (roll === 0) state = marbles.reduce(state, { type: "swap", a: SLOTS[pick(3)], b: SLOTS[pick(3)] }).state;
    else if (roll <= 2) state = marbles.reduce(state, { type: "place", handIndex: pick(state.maxHandSize), slot: SLOTS[pick(3)] }).state;
    else state = marbles.reduce(state, { type: "resolve" }).state;
  }
}

function checkMatchesReality(run) {
  const faults = [];
  const tally = { states: 0, actions: 0, awakened: 0, unknownPockets: 0 };
  const mixedBag = ["plain", "plain", "heavy", "giver", "giver", "lens", "lens", "thief", "thief", "plain"];
  for (let seed = 1; seed <= 60; seed++) {
    walkGame(seed, {}, rules, faults, tally);
    walkGame(seed + 1000, { bag: mixedBag }, mixedRules, faults, tally);
  }
  run.same("propriété : la prévision correspond au résultat réel", [], faults.slice(0, 3));
  run("propriété : plusieurs centaines d'états", true, tally.states >= 300);
  run("propriété : des milliers d'actions comparées", true, tally.actions >= 2000);
  run("propriété : des Éveils réels rencontrés, chacun annoncé incertain", true, tally.awakened > 0);
}

// L'Éveil dans la prévision : jamais compté, annoncé possible (« incertain ») quand
// une bille est piochée et qu'une bille qui pouvait l'être en a un.
function checkAwakenForecast(run) {
  const toApex = { type: "place", handIndex: 0, slot: "apex" };
  const occupied = { leftBase: null, rightBase: null, apex: placed("glass") };
  const tic = (bag, discard = []) => playState({ hand: inHand(["cats_eye"]), bag, discard, triangle: occupied });
  run("éveil prévu : une pioche, la tigrée au sac, incertaine", true, rules.forecast(tic(["tiger"]), toApex).uncertain);
  run("éveil prévu : une pioche, aucune bille du sac n'a d'Éveil, certaine", false, rules.forecast(tic(["sulphide", "clay"]), toApex).uncertain);
  run("éveil prévu : la tigrée en défausse, sans régénération, certaine", false, rules.forecast(tic(["clay"], ["tiger"]), toApex).uncertain);
  run("éveil prévu : la tigrée en défausse, avec régénération, incertaine", true, rules.forecast(tic([], ["tiger"]), toApex).uncertain);
  run(
    "éveil prévu : aucune pioche, la tigrée au sac, certaine",
    false,
    rules.forecast(playState({ hand: inHand(["clay"]), bag: ["tiger"], triangle: occupied }), toApex).uncertain
  );
  // Jamais compté : la tigrée piochée par le Tic s'éveille (Vitesse +2) en vrai.
  const state = tic(["tiger"]);
  const predicted = rules.forecast(state, toApex);
  const real = rules.reduce(state, toApex);
  run("éveil prévu : l'effet réel a lieu", 2, real.events.find((event) => event.trigger === "awaken")?.speedDelta);
  const resolved = rules.reduce(real.state, { type: "resolve" });
  run("éveil prévu : jamais dans les valeurs prévues (Vitesse prévue = réelle − 2)", resolved.events.find((event) => event.type === "impact").speed - 2, predicted.speed);
  run.same("éveil prévu : ni dans le registre de la copie", { turn: 0, game: 0 }, predicted.tally.awaken);
}
