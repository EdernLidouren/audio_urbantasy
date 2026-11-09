// Vérifications — domaine « marbles-tools ». La boîte à outils des billes
// (tools/marbles/, doc/marbles-tools.md) : état construit à la main, affichage du
// journal, commandes, joueurs automatiques, simulateur, rapport et exports. Les
// outils ne changent aucune règle : on vérifie qu'ils mesurent juste. Rien n'est
// annoncé ni joué ici. Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js marbles-tools`).

import { MARBLES_SETTINGS, STARTING_BAG } from "../../config/marbles-values.js";
import { SLOTS, createMarblesGame, legalActions, marblesReduce } from "../marbles.js";
import { forecast } from "../marbles-forecast.js";
import { throws } from "../../lib/check.js";
import { parseCommand } from "../../tools/marbles/commands.js";
import { formatEvent, formatState } from "../../tools/marbles/format.js";
import { applyActions, buildState } from "../../tools/marbles/state-builder.js";
import { PLAYERS, bestPlan, publicView } from "../../tools/marbles/players.js";
import { MARBLES_DRAWN_VALUE } from "../../tools/marbles/drawn-value.js";
import { MARBLE_IDS, deriveSeed, parseBagText, playGame, simulate } from "../../tools/marbles/simulation.js";
import { percentile, summarize } from "../../tools/marbles/stats.js";
import { buildReport, frNumber } from "../../tools/marbles/report.js";
import { MARBLE_COLUMNS, toCsv, toJson } from "../../tools/marbles/export.js";
import MARBLE_TYPES from "../../marbles/types/index.js";
import { createMarblesRules } from "../marbles-rules.js";

// Les règles du jeu, liées à la vraie table (core/marbles-rules.js).
const rules = createMarblesRules(MARBLE_TYPES);

// Les parties de contrôle : assez pour que les moyennes parlent, assez peu pour
// que la vérification reste rapide (elle tourne aussi dans le jeu).
const GAMES = 300;

export default function checkMarblesTools(run) {
  checkStateBuilder(run);
  checkCommandsAndFormat(run);
  checkPublicView(run);
  checkGreedy(run);
  checkDrawnValue(run);
  checkSimulation(run);
  checkReportAndExport(run);
}

function checkStateBuilder(run) {
  const state = buildState({
    turn: 4,
    score: 30,
    triangle: { leftBase: "magnifier:1", rightBase: "clay", apex: { marble: "shooter", wear: 2 } },
    hand: ["clay", "leaded"],
    bag: ["agate", "mica"],
    settings: { turnCount: 6 },
  });
  run.same("état construit : le triangle et son usure", { marble: "magnifier", wear: 1 }, state.triangle.leftBase);
  run("état construit : usure 0 par défaut", 0, state.triangle.rightBase.wear);
  run.same("état construit : le sac dans l'ordre décrit, sans mélange", ["agate", "mica"], state.bag);
  run("état construit : réglage surchargé", 6, state.turnCount);
  run("état construit : phase de jeu par défaut", "play", state.stage);
  run("état construit : un état que le réducteur accepte", true, rules.reduce(state, { type: "place", handIndex: 1, slot: "apex" }).ok);
  run("état construit : bille inconnue refusée", true, throws(() => buildState({ hand: ["nope"] })));
  run("état construit : champ inconnu refusé", true, throws(() => buildState({ tour: 2 })));
  run("état construit : emplacement inconnu refusé", true, throws(() => buildState({ triangle: { middle: "clay" } })));
  run("état construit : usure au maximum refusée", true, throws(() => buildState({ triangle: { apex: "giant:1" } })));
  run("état construit : main trop grande refusée", true, throws(() => buildState({ hand: Array(6).fill("clay") })));

  const { state: after, steps } = applyActions(state, [
    { type: "place", handIndex: 9, slot: "apex" },
    { type: "place", handIndex: 1, slot: "apex" },
    { type: "resolve" },
  ]);
  run.same("actions : un refus garde l'état, la suite continue", [false, true, true], steps.map((step) => step.ok));
  run("actions : le code du refus", "invalidHandIndex", steps[0].error);
  run("actions : l'état final est celui d'après la résolution", 5, after.turn);
}

function checkCommandsAndFormat(run) {
  run.same("commande : poser", { kind: "action", action: { type: "place", handIndex: 0, slot: "apex" } }, parseCommand("poser 1 pointe"));
  run.same("commande : échanger, alias anglais", { kind: "action", action: { type: "swap", a: "leftBase", b: "rightBase" } }, parseCommand("swap left d"));
  run.same("commande : prévision du triangle", { kind: "forecast", action: null }, parseCommand("r"));
  run("commande : usage faux", "error", parseCommand("poser x pointe").kind);
  run("commande : propre à l'outil", "journal", parseCommand("journal json").word);

  // Chaque type d'évènement d'une vraie partie a sa ligne lisible, jamais le repli
  // JSON.
  const { games } = simulate({ games: 20, seed: "format", player: "greedy", bagMode: { kind: "random", size: 7, maxCopies: null }, settings: { turnCount: 20 } });
  const types = new Set();
  let raw = 0;
  for (const index of [0, 1, 2]) {
    const state = rules.createGame(games[index].seed, { bag: games[index].bag, turnCount: 20 });
    let current = state;
    while (current.stage !== "over") {
      const action = current.stage === "draw" ? { type: "draw" } : legalActions(current).find((legal) => legal.type === "place") ?? { type: "resolve" };
      const result = rules.reduce(current, action);
      for (const event of result.events) {
        types.add(event.type);
        if (formatEvent(event).startsWith(`${event.type} : {`)) raw += 1;
      }
      current = result.state;
    }
  }
  run("journal lisible : aucun évènement en JSON brut", 0, raw);
  run("journal lisible : assez de types couverts", true, types.size >= 15);
  run("journal lisible : un type inconnu se lit quand même", true, formatEvent({ type: "nouveau", x: 1 }).startsWith("nouveau : "));
  run("état lisible : une ligne par élément, sans tableau", true, formatState(buildState({ hand: ["clay"] })).every((line) => !line.includes("|") && line.length < 200));
}

function checkPublicView(run) {
  const state = buildState({ hand: ["clay"], bag: ["agate", "mica", "giant"] });
  const view = publicView(state);
  run.same("vue publique : billes du sac inconnues", [null, null, null], view.bag);
  run("vue publique : le nombre de billes du sac reste", 3, view.bag.length);
  run("vue publique : sans hasard de la partie", null, view.rngState);
  run("vue publique : une copie, l'état n'est pas touché", 3, state.bag.length);

  // Un joueur espion, ajouté le temps du test : ce que chaque joueur reçoit, c'est
  // une vue, jamais l'état.
  const leaks = [];
  try {
    for (const id of ["random", "greedy", "greedy-no-replacement"]) {
      PLAYERS.spy = {
        label: "espion",
        describe: () => "espion",
        startGame: (args) => {
          const inner = PLAYERS[id].startGame(args);
          return {
            next(seen) {
              if (seen.bag.some((marble) => marble !== null) || seen.rngState !== null) leaks.push(id);
              return inner.next(seen);
            },
          };
        },
      };
      simulate({ games: 10, seed: 3, player: "spy" });
    }
  } finally {
    delete PLAYERS.spy;
  }
  run.same("joueurs : jamais le sac ni le hasard de la partie", [], leaks);

  // Les graines d'une partie sont dérivées, distinctes l'une de l'autre : le joueur
  // a son propre hasard.
  run("graines : celle du joueur n'est pas celle de la partie", false, deriveSeed(1, 0, "player") === deriveSeed(1, 0, "game"));
}

// Impact prévu d'une suite d'actions sur `state`, par le moteur de prévision.
function predictedAfter(state, actions) {
  let current = state;
  for (const action of actions) {
    const result = rules.reduce(current, action);
    if (!result.ok) return null;
    current = result.state;
  }
  const predicted = rules.forecast(current);
  return predicted.ok ? predicted.impact : null;
}

function checkGreedy(run) {
  // Un cas construit où le meilleur coup est un remplacement : la plombée éjecte le
  // calot de la pointe... ou l'inverse. Le glouton doit trouver le maximum que donne
  // une recherche exhaustive indépendante (pas d'échange ou chaque échange, puis
  // aucune pose ou chaque pose). Une bille gagnée en main n'y vaut rien
  // (drawnValue 0) : le glouton ne compare alors que l'Impact.
  const state = buildState({
    turn: 4,
    triangle: { leftBase: "magnifier:1", rightBase: "glass", apex: "stoneware" },
    hand: ["clay", "shooter", "agate"],
  });
  const view = publicView(state);
  const swaps = [[], ...legalActions(view).filter((action) => action.type === "swap").map((swap) => [swap])];
  let best = -Infinity;
  for (const swap of swaps) {
    const afterSwap = swap.length === 0 ? view : rules.reduce(view, swap[0]).state;
    best = Math.max(best, predictedAfter(view, swap));
    for (const place of legalActions(afterSwap).filter((action) => action.type === "place")) {
      best = Math.max(best, predictedAfter(view, [...swap, place]));
    }
  }
  const impactOnly = { drawnValue: 0 };
  const plan = bestPlan(view, impactOnly);
  run("glouton : l'Impact prévu maximal d'une recherche exhaustive", best, plan.impact);
  // Une pose du plan désigne sa bille : sa place dans la main se lit au moment de
  // jouer, comme le fait le joueur.
  let current = view;
  for (const choice of plan.choices) {
    const action = choice.type === "place" ? { type: "place", handIndex: current.hand.indexOf(choice.marble), slot: choice.slot } : choice;
    current = rules.reduce(current, action).state;
  }
  run("glouton : son plan rejoué donne l'Impact annoncé", plan.impact, rules.forecast(current).impact);
  run("glouton : une pose au plus après le premier tour", true, plan.choices.filter((choice) => choice.type === "place").length <= 1);
  run("glouton : deux poses envisagées, jamais pire", true, bestPlan(view, { ...impactOnly, maxPlacements: 2 }).impact >= plan.impact);

  const careful = bestPlan(view, { ...impactOnly, allowReplacement: false });
  run(
    "sans remplacement : jamais de pose sur un emplacement occupé",
    true,
    careful.choices.every((choice) => choice.type !== "place" || view.triangle[choice.slot] === null)
  );
  run("sans remplacement : jamais mieux que le glouton", true, careful.impact <= plan.impact);

  // Premier tour : toutes les attributions de la main au triangle, par recherche
  // exhaustive sur les places de la main.
  const first = rules.reduce(rules.createGame(7), { type: "draw" }).state;
  let firstBest = -Infinity;
  const hand = first.hand;
  for (const a of hand.keys()) {
    for (const b of hand.keys()) {
      for (const c of hand.keys()) {
        if (new Set([a, b, c]).size < 3) continue;
        const triangle = { leftBase: { marble: hand[a], wear: 0 }, rightBase: { marble: hand[b], wear: 0 }, apex: { marble: hand[c], wear: 0 } };
        firstBest = Math.max(firstBest, rules.forecast({ ...first, triangle }).impact);
      }
    }
  }
  const firstPlan = bestPlan(publicView(first), impactOnly);
  run("glouton, premier tour : le meilleur remplissage", firstBest, firstPlan.impact);
  run.same("glouton, premier tour : les trois emplacements", [...SLOTS].sort(), firstPlan.choices.map((choice) => choice.slot).sort());
}

// La valeur d'une bille gagnée en main : sans elle, une bille qui pioche ne vaut rien
// pour le glouton ; avec elle, il la joue quand elle rapporte plus que l'Impact perdu.
function checkDrawnValue(run) {
  run("bille gagnée : la valeur par défaut, mesurée sur la référence", 12.68, MARBLES_DRAWN_VALUE);
  run("bille gagnée : dite dans la description du joueur", true, PLAYERS.greedy.describe({}).includes("12,68"));
  // Le Tic de l'œil-de-chat pioche : une pose sur un emplacement occupé.
  const view = publicView(buildState({ turn: 4, triangle: { leftBase: "clay", rightBase: "glass", apex: null }, hand: ["cats_eye", "agate"], bag: ["tiger", "giant"] }));
  const greedy = bestPlan(view, { drawnValue: 100 });
  run("bille gagnée : très chère, le glouton pioche", true, greedy.drawn >= 1);
  run("bille gagnée : la valeur du plan", greedy.impact + 100 * greedy.drawn, greedy.value);
  run("bille gagnée : sans valeur, l'Impact seul décide", true, bestPlan(view, { drawnValue: 0 }).impact >= greedy.impact);
  run("bille gagnée : la planification ne révèle rien du sac", true, view.bag.every((marble) => marble === null));
  run("bille gagnée : valeur négative refusée", true, throws(() => PLAYERS.greedy.startGame({ seed: 1, options: { drawnValue: -1 } })));

  // La simulation compte les pioches d'effets, les régénérations et les lancers.
  const summary = summarize(simulate({ games: 60, seed: 5, player: "greedy" }));
  run("simulation : des billes piochées par des effets", true, summary.draws.byEffect > 0);
  run("simulation : régénérations en cours de tour, comprises dans le total", true, summary.draws.midTurnRegenerations <= summary.draws.regenerations);
  run("simulation : jamais plus de lancers que la limite", true, summary.throwsPerTurn > 0 && summary.throwsPerTurn <= MARBLES_SETTINGS.throwsPerTurn);
  run("simulation : le mica fait piocher", true, summary.marbles.find((marble) => marble.id === "mica").drawn > 0);
  run("simulation : l'argile ne fait jamais piocher", 0, summary.marbles.find((marble) => marble.id === "clay").drawn);
}

function checkSimulation(run) {
  const settingsBefore = structuredClone(MARBLES_SETTINGS);
  const results = {};
  for (const player of ["random", "greedy", "greedy-no-replacement"]) {
    results[player] = simulate({ games: GAMES, seed: 11, player });
    run(`${player} : aucune action refusée sur ${GAMES} parties`, 0, summarize(results[player]).refusals);
  }
  const meanOf = (player) => summarize(results[player]).score.mean;
  run("cohérence : le glouton bat l'aléatoire", true, meanOf("greedy") > meanOf("random"));
  run("cohérence : sans remplacement, aucun remplacement", 0, summarize(results["greedy-no-replacement"]).replacements.perGame);

  // Déterminisme : mêmes paramètres, même rapport ; une autre graine, un autre.
  const report = (seed) => {
    const result = simulate({ games: 30, seed, player: "greedy", bagMode: { kind: "random", size: 10, maxCopies: 2 } });
    return buildReport({ params: result.params, summary: summarize(result) });
  };
  run.same("déterminisme : même rapport, au caractère près", report(5), report(5));
  run("déterminisme : une autre graine change le rapport", false, JSON.stringify(report(5)) === JSON.stringify(report(6)));

  // Surcharges : prises en compte, le module de réglages intact.
  const short = simulate({ games: 20, seed: 2, player: "greedy", settings: { turnCount: 4, drawPerTurn: 2, maxHandSize: 6, firstTurnDraw: 6 } });
  run("surcharge : 4 tours", true, short.games.every((game) => game.turns === 4));
  run.same("surcharge : réglages par défaut intacts", settingsBefore, MARBLES_SETTINGS);
  run("surcharge : réglage inconnu refusé", true, throws(() => simulate({ games: 1, settings: { tours: 3 } })));
  run("surcharge : valeur refusée par la simulation", true, throws(() => simulate({ games: 1, settings: { firstTurnDraw: 2 } })));
  run("joueur inconnu refusé", true, throws(() => simulate({ games: 1, player: "nope" })));

  // Sacs.
  const random = simulate({ games: 40, seed: 4, player: "random", bagMode: { kind: "random", size: 12, maxCopies: 1 } });
  run("sac aléatoire : la taille demandée", true, random.games.every((game) => game.bag.length === 12));
  run("sac aléatoire : la limite d'exemplaires", true, random.games.every((game) => new Set(game.bag).size === 12));
  run("sac aléatoire : des sacs différents d'une partie à l'autre", true, new Set(random.games.map((game) => [...game.bag].sort().join())).size > 1);
  run("sac aléatoire : impossible avec la limite", true, throws(() => simulate({ games: 1, bagMode: { kind: "random", size: 14, maxCopies: 1 } })));
  run.same("sac décrit : texte", ["clay", "clay", "mica"], parseBagText("clay, clay # deux\nmica\n"));
  run.same("sac décrit : JSON", ["agate"], parseBagText('["agate"]'));
  run("sac décrit : bille inconnue refusée", true, throws(() => parseBagText("clay nope")));
  run.same("sac de test par défaut", STARTING_BAG, results.greedy.games[0].bag);

  // Une partie se rejoue à l'identique, seule, depuis son index.
  run.same("partie : rejouée seule, même relevé", results.greedy.games[17], playGame({ ...results.greedy.params, index: 17 }));
  run("centiles : interpolation", 2.5, percentile([1, 2, 3, 4], 50));
  run("ids des billes : la table", 13, MARBLE_IDS.length);
}

function checkReportAndExport(run) {
  const result = simulate({ games: 40, seed: 9, player: "greedy", bagMode: { kind: "random", size: 13, maxCopies: 2 } });
  const summary = summarize(result);
  const lines = buildReport({ params: result.params, summary });
  const text = lines.join("\n");

  // Le rapport dit les chiffres du résumé, ceux-là mêmes que l'export écrit.
  run("rapport : la moyenne du score", true, text.includes(`Moyenne ${frNumber(summary.score.mean)}. Médiane ${frNumber(summary.score.median)}.`));
  const marbleLinesOk = summary.marbles
    .filter((marble) => marble.games > 0)
    .every((marble) => text.includes(`Posée ${frNumber(marble.placed)} fois, dont ${frNumber(marble.placedReplacing)} en remplacement.`) && (marble.gap === null || text.includes(`écart ${frNumber(marble.gap, { signed: true })}`)));
  run("rapport : chaque bille, les chiffres du résumé", true, marbleLinesOk);
  run("rapport : sans tableau ni ligne très large", true, lines.every((line) => !line.includes("|") && line.length <= 220));
  run("rapport : des observations", true, lines.indexOf("Observations.") > 0 && lines.some((line) => line.startsWith("- ")));

  const json = JSON.parse(toJson({ ...result, summary }));
  run.same("export JSON : le même résumé", summary, json.summary);
  run("export JSON : une ligne par partie", 40, json.games.length);

  const csv = toCsv({ ...result, summary });
  const marbleRows = csv.marbles.trim().split("\n").slice(1).map((row) => row.split(","));
  const csvMatches = summary.marbles.every((marble, index) =>
    MARBLE_COLUMNS.every((column, cell) => String(marble[column] ?? "") === marbleRows[index][cell])
  );
  run("export CSV : les statistiques par bille du rapport", true, csvMatches);
  run("export CSV : une ligne par partie, plus l'en-tête", 41, csv.games.trim().split("\n").length);
  const firstGame = csv.games.split("\n")[1].split(",");
  run("export CSV : le score de la partie", String(result.games[0].score), firstGame[2]);
  run("nombre français : virgule et signe", "+4,5 / −2", `${frNumber(4.5, { signed: true })} / ${frNumber(-2)}`);
}
