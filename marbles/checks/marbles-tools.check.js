// Vérifications — domaine « marbles-tools ». La boîte à outils des billes
// (marbles/tools/, doc/marbles-tools.md) : état construit à la main, affichage du
// journal, commandes, joueurs automatiques, simulateur, rapport et exports. Les
// outils ne changent aucune règle : on vérifie qu'ils mesurent juste. Rien n'est
// annoncé ni joué ici. Les outils sont liés à la VRAIE table
// (marbles/tools/game-rules.js) : ces vérifications la jouent aussi, mais n'en
// attendent aucun chiffre (nombre de billes, effet d'une bille) ; ce qu'elles
// comparent se déduit de la table. Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js marbles-tools`).

import { MARBLES_SETTINGS } from "../config/values.js";
import { bagMarbles } from "../core/bags.js";
import { turnLimit } from "../core/definitions.js";
import { SLOTS } from "../core/marbles.js";
import { JOURNAL_EVENTS } from "../core/content.js";
import { throws } from "../../lib/check.js";
import { parseCommand } from "../tools/commands.js";
import { choiceLine, formatEvent, formatState } from "../tools/format.js";
import { applyActions, buildState } from "../tools/state-builder.js";
import { PLAYERS, bestChoice, bestPlan, publicView } from "../tools/players.js";
import { MARBLES_DRAWN_VALUE } from "../tools/drawn-value.js";
import { MARBLE_IDS, deriveSeed, playGame, recordEvents, simulate } from "../tools/simulation.js";
import { parseBagText, readBagChoice } from "../tools/bag-option.js";
import { percentile, summarize } from "../tools/stats.js";
import { REPORT_HEADINGS, REPORT_RESULT_HEADINGS, buildReport, frNumber } from "../tools/report.js";
import { contextLabel, diffReports, reportAnomalies } from "../tools/report-diff.js";
import { parseArgs } from "../tools/args.js";
import { MARBLE_COLUMNS, toCsv, toJson } from "../tools/export.js";
import { buildSetSheet } from "../tools/set-sheet-builder.js";
import { getLocale } from "../../data/i18n/index.js";
import MARBLE_TYPES from "../content/types/index.js";
import { DEFAULT_GAME_DEFINITION, GAME_RULES, defaultToolsBag, definitionById, gameSetup, withSettings } from "../tools/game-rules.js";
import { caughtMessage, handIds } from "./helpers.js";

// Les règles du jeu, liées aux vraies tables (marbles/tools/game-rules.js).
const rules = GAME_RULES;

// Les parties de contrôle par joueur : assez pour que les moyennes se départagent
// nettement (le glouton bat l'aléatoire de loin), assez peu pour que la
// vérification reste rapide (elle tourne aussi dans le jeu).
const GAMES = 50;

export default function checkMarblesTools(run) {
  run.section("état construit", checkStateBuilder);
  run.section("commandes et journal lisible", checkCommandsAndFormat);
  run.section("vue publique", checkPublicView);
  run.section("glouton", checkGreedy);
  run.section("choix des joueurs", checkPlayerChoices);
  run.section("bille gagnée", checkDrawnValue);
  run.section("simulation", checkSimulation);
  run.section("rapport et exports", checkReportAndExport);
  run.section("attribution des pioches", checkDrawAttribution);
  run.section("différence de rapports", checkReportDiff);
  run.section("ligne de commande", checkArgs);
  run.section("fiche du set", checkSetSheet);
}

// Une clause qui pioche, quelque part dans les effets d'une bille.
function drawsSomewhere(type) {
  return JSON.stringify(type).includes('"action":"draw"');
}

function checkStateBuilder(run) {
  const state = buildState({
    turn: 4,
    score: 30,
    triangle: { leftBase: "moon:1", rightBase: "clay", apex: { marble: "dragon", wear: 2 } },
    hand: ["clay", "bee:2"],
    bag: ["agate", "comet"],
    settings: { turns: 6 },
  });
  run.same("état construit : le triangle et son usure", { marble: "moon", wear: 1 }, state.triangle.leftBase);
  run("état construit : usure 0 par défaut", 0, state.triangle.rightBase.wear);
  run.same("état construit : le sac dans l'ordre décrit, sans mélange", ["agate", "comet"], state.bag);
  run("état construit : réglage surchargé", 6, turnLimit(state));
  run("état construit : phase de jeu par défaut", "play", state.stage);
  run("état construit : un état que le réducteur accepte", true, rules.reduce(state, { type: "place", handIndex: 1, slot: "apex" }).ok);
  run("état construit : bille inconnue refusée", true, throws(() => buildState({ hand: ["nope"] })));
  run("état construit : champ inconnu refusé", true, throws(() => buildState({ tour: 2 })));
  run("état construit : emplacement inconnu refusé", true, throws(() => buildState({ triangle: { middle: "clay" } })));
  run("état construit : usure au maximum refusée", true, throws(() => buildState({ triangle: { apex: `clay:${rules.maxWearOf("clay")}` } })));
  run("état construit : juste sous le maximum, acceptée", false, throws(() => buildState({ triangle: { apex: `clay:${rules.maxWearOf("clay") - 1}` } })));
  run("état construit : main trop grande refusée", true, throws(() => buildState({ hand: Array(DEFAULT_GAME_DEFINITION.start.handSize + 1).fill("clay") })));
  // Les statuts : reçus comme d'un effet, puis ce que la description fixe ; les bornes
  // aux caractéristiques en vigueur.
  const withStatuses = buildState({ statuses: ["cushion:2", { status: "extraThrow", pending: true }] });
  run.same(
    "état construit : statuts, l'intensité dite, le reste de la définition",
    [{ status: "cushion", intensity: 2, remaining: 3, pending: false }, { status: "extraThrow", intensity: 1, remaining: 1, pending: true }],
    withStatuses.statuses.map(({ status, intensity, remaining, pending }) => ({ status, intensity, remaining, pending }))
  );
  run("état construit : statut inconnu refusé", true, throws(() => buildState({ statuses: ["nope"] })));
  run("état construit : pot au-delà de sa capacité refusé", true, throws(() => buildState({ pot: ["clay", "clay", "clay", "clay"] })));
  run("état construit : pot agrandi par un statut, permis", 4, buildState({ pot: ["clay", "clay", "clay", "clay"], statuses: ["deepPocket"] }).pot.length);
  run.same(
    "état construit : la main avec ses compteurs de tours en main",
    [{ marble: "clay", turnsInHand: 0 }, { marble: "bee", turnsInHand: 2 }],
    state.hand
  );
  run.same("état construit : une bille de main en objet", [{ marble: "bubble", turnsInHand: 1 }], buildState({ hand: [{ marble: "bubble", turnsInHand: 1 }] }).hand);
  run("état construit : compteur négatif refusé", true, throws(() => buildState({ hand: ["clay:-1"] })));
  run(
    "état lisible : la main dit les tours en main",
    `Main, 2 sur ${DEFAULT_GAME_DEFINITION.start.handSize} : clay, 0 tour en main ; bee, 2 tours en main.`,
    formatState(state).find((line) => line.startsWith("Main"))
  );

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
  run.same("commande : choisir dans la défausse", { kind: "action", action: { type: "choose", target: { zone: "discard", index: 1 } } }, parseCommand("choisir defausse 2"));
  run("commande : choisir dans la défausse, sans place", "error", parseCommand("choisir defausse").kind);

  // Le choix en attente : les billes en transit à la fin, jamais parmi les cibles.
  const pending = {
    action: "crack",
    count: 1,
    mode: "required",
    remaining: 1,
    by: { trigger: "pocketReaction", slot: null, marble: "a" },
    chosen: [],
    eligible: [{ zone: "triangle", slot: "apex", marble: "b" }],
    inTransit: [{ kind: "thrown", marble: "c", slot: "rightBase" }],
  };
  const line = choiceLine(pending, (id) => id);
  run("ligne de choix : la bille en transit et l'emplacement qu'elle vise", true, line.endsWith(". En transit : c vers base droite."));
  run("ligne de choix : sans transit, rien de plus", false, choiceLine({ ...pending, inTransit: [] }, (id) => id).includes("transit"));
  run("ligne de choix : une cible de la défausse", true, choiceLine({ ...pending, eligible: [{ zone: "discard", index: 0, marble: "b" }], inTransit: [] }, (id) => id).includes("Cibles : défausse 1 : b."));

  // Chaque type d'évènement d'une vraie partie a sa ligne lisible, jamais le repli
  // JSON.
  // Trois parties suffisent : seuls leurs graines et leurs sacs servent.
  const { games } = simulate({ games: 3, seed: "format", player: "random", bagMode: { kind: "random", size: 7, maxCopies: null }, settings: { turns: 20 } });
  const types = new Set();
  let raw = 0;
  for (const index of [0, 1, 2]) {
    const setup = gameSetup(withSettings(DEFAULT_GAME_DEFINITION, { turns: 20 }), { kind: "random", size: 7, maxCopies: null });
    const state = rules.createGame(games[index].seed, setup.definition, setup.options);
    let current = state;
    while (current.stage !== "over") {
      const action = current.pendingChoice
        ? rules.legalActions(current)[0]
        : current.stage === "draw"
          ? { type: "draw" }
          : (rules.legalActions(current).find((legal) => legal.type === "place") ?? { type: "resolve" });
      const result = rules.reduce(current, action);
      for (const event of result.events) {
        types.add(event.type);
        if (formatEvent(event).startsWith(`${event.type} : {`)) raw += 1;
      }
      current = result.state;
    }
  }
  run("journal lisible : aucun évènement en JSON brut", 0, raw);
  // Chaque type du journal (JOURNAL_EVENTS) a sa ligne, pas seulement ceux qu'une
  // partie a rencontrés : un évènement minimal de chaque type, ses champs de
  // structure seulement quand la ligne les lit.
  const minimal = {
    choice: { zones: ["hand"], count: 1, by: { trigger: "hit", slot: "apex", marble: "clay" } },
    eject: { slot: "apex", marble: "clay", by: { trigger: "hit", slot: "apex", marble: "clay" } },
    rotation: { triangle: { leftBase: null, rightBase: null, apex: null } },
    gameOver: { score: 0, result: { goal: "free", end: "lastTurn", score: 0, tier: "none" } },
  };
  const unreadable = Object.keys(JOURNAL_EVENTS).filter((type) => formatEvent({ type, ...minimal[type] }).startsWith(`${type} : {`));
  run.same("journal lisible : chaque type du journal (JOURNAL_EVENTS) a sa ligne", [], unreadable);
  // Chaque cible vide et chaque fin de choix se disent, sans « null » ni « undefined ».
  const empties = ["firstInHand", "choice", "all", "bag", "lastDiscarded", "handFull", "noReference"].map((target) => formatEvent({ type: "targetEmpty", action: "discard", slot: null, target }));
  const ends = ["count", "done", "exhausted", "declined"].map((reason) => formatEvent({ type: "choiceEnded", reason, chosen: 0 }));
  run.same("journal lisible : chaque cible vide, chaque fin de choix", [], [...empties, ...ends].filter((line) => /null|undefined/.test(line)));
  run("journal lisible : un type inconnu se lit quand même", true, formatEvent({ type: "nouveau", x: 1 }).startsWith("nouveau : "));
  run("état lisible : une ligne par élément, sans tableau", true, formatState(buildState({ hand: ["clay"] })).every((line) => !line.includes("|") && line.length < 200));
}

function checkPublicView(run) {
  const state = buildState({ hand: ["clay"], bag: ["agate", "comet", "fireball"] });
  const view = publicView(state);
  run.same("vue publique : billes du sac inconnues", [null, null, null], view.bag);
  run("vue publique : le nombre de billes du sac reste", 3, view.bag.length);
  run("vue publique : sans hasard de la partie", null, view.rngState);
  run.same("vue publique : une copie, l'état n'est pas touché", ["agate", "comet", "fireball"], state.bag);

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

// Impact prévu d'une suite d'actions sur `state`, par le moteur de prévision. À
// l'aveugle, comme le glouton planifie : un choix y reste indécis, rien ne s'y
// suspend.
function predictedAfter(state, actions) {
  let current = state;
  for (const action of actions) {
    const result = rules.reduce(current, action, { blind: true });
    if (!result.ok) return null;
    current = result.state;
  }
  const predicted = rules.forecast(current);
  return predicted.ok ? predicted.impact : null;
}

// Les joueurs devant un choix : le glouton prend la réponse au meilleur Impact prévu,
// l'aléatoire une réponse légale, Terminer compris ; la vue publique voile aussi
// l'état de départ que garde le choix.
function checkPlayerChoices(run) {
  // Une vraie bille dont le Tic ouvre un choix sur le triangle, trouvée par ce qu'elle
  // fait.
  const chooser = Object.keys(MARBLE_TYPES).find((id) => (MARBLE_TYPES[id].hit ?? []).some((clause) => clause.target?.type === "choice" && clause.target.zones.includes("triangle") && clause.when === undefined));
  if (chooser === undefined) throw new Error("aucune vraie bille n'a de Tic à choix : ce test n'a rien à jouer.");
  const state = buildState({ triangle: { leftBase: "turtle:1", rightBase: null, apex: "clay" }, hand: [chooser], bag: ["agate", "comet"] });
  const pending = rules.reduce(state, { type: "place", handIndex: 0, slot: "apex" }).state;
  const view = publicView(pending);
  run("vue publique : le sac de l'état de départ du choix voilé", true, view.pendingChoice.resume.from.bag.every((marble) => marble === null));
  const values = rules.legalActions(view).map((action) => rules.forecast(view, action).impact);
  const best = bestChoice(view);
  run("glouton : la réponse au meilleur Impact prévu", Math.max(...values), rules.forecast(view, best).impact);
  run("glouton : une réponse légale", true, rules.reduce(pending, best).ok);
  const randomAnswer = PLAYERS.random.startGame({ seed: 3 }).next(view);
  run("aléatoire : une réponse légale au choix", true, randomAnswer.type === "choose" && rules.reduce(pending, randomAnswer).ok);
  // Un choix facultatif : Terminer est parmi les réponses tirées.
  const upTo = { ...view, pendingChoice: { ...view.pendingChoice, mode: "optional" } };
  const answers = new Set();
  const session = PLAYERS.random.startGame({ seed: 5 });
  for (let draw = 0; draw < 40; draw++) answers.add(JSON.stringify(session.next(upTo)));
  run("aléatoire : Terminer tiré aussi", true, answers.has(JSON.stringify({ type: "choose", done: true })));
}

function checkGreedy(run) {
  // Un cas construit, triangle plein et trois billes en main : le glouton doit trouver
  // le maximum que donne
  // une recherche exhaustive indépendante (pas d'échange ou chaque échange, puis
  // aucune pose ou chaque pose). Une bille gagnée en main n'y vaut rien
  // (drawnValue 0) : le glouton ne compare alors que l'Impact.
  const state = buildState({
    turn: 4,
    triangle: { leftBase: "moon:1", rightBase: "dolphin", apex: "galaxy" },
    hand: ["clay", "dragon", "agate"],
  });
  const view = publicView(state);
  const swaps = [[], ...rules.legalActions(view).filter((action) => action.type === "swap").map((swap) => [swap])];
  let best = -Infinity;
  for (const swap of swaps) {
    const afterSwap = swap.length === 0 ? view : rules.reduce(view, swap[0]).state;
    best = Math.max(best, predictedAfter(view, swap));
    for (const place of rules.legalActions(afterSwap).filter((action) => action.type === "place")) {
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
    const action = choice.type === "place" ? { type: "place", handIndex: handIds(current).indexOf(choice.marble), slot: choice.slot } : choice;
    current = rules.reduce(current, action, { blind: true }).state;
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

  // Premier tour : toutes les attributions de la main au triangle, emplacements
  // laissés vides compris (aucune règle n'exige de le remplir), par recherche
  // exhaustive sur les places de la main (-1 : emplacement laissé vide). Les billes
  // se posent vraiment, dans l'ordre des phases comme le glouton : leurs
  // Chiquenaudes comptent.
  const setup = gameSetup(DEFAULT_GAME_DEFINITION);
  const first = rules.reduce(rules.createGame(7, setup.definition, setup.options), { type: "draw" }).state;
  let firstBest = -Infinity;
  const hand = handIds(first);
  const choicesOf = [-1, ...hand.keys()];
  for (const a of choicesOf) {
    for (const b of choicesOf) {
      for (const c of choicesOf) {
        const used = [a, b, c].filter((index) => index !== -1);
        if (new Set(used).size < used.length) continue;
        let current = first;
        [a, b, c].forEach((index, slotIndex) => {
          if (index === -1) return;
          const action = { type: "place", handIndex: handIds(current).indexOf(hand[index]), slot: SLOTS[slotIndex] };
          current = rules.reduce(current, action, { blind: true }).state;
        });
        firstBest = Math.max(firstBest, rules.forecast(current).impact);
      }
    }
  }
  const firstPlan = bestPlan(publicView(first), impactOnly);
  run("glouton, premier tour : le meilleur remplissage, partiel compris", firstBest, firstPlan.impact);
  // Un triangle partiel s'envisage : une main d'une bille au premier tour donne un plan
  // d'une pose, pour une bille qui, posée seule, rapporte un Impact (une bille sans
  // Masse, seule, n'en rapporte aucun : ne rien poser la vaut).
  const alone = (held) => ({ ...first, hand: [held] });
  const scoring = first.hand.find((held) => SLOTS.some((slot) => rules.forecast(alone(held), { type: "place", handIndex: 0, slot }).impact > 0));
  if (scoring === undefined) throw new Error("aucune bille de la main ne rapporte d'Impact seule : ce test n'a rien à jouer.");
  run("glouton, premier tour : une seule bille, une seule pose", 1, bestPlan(publicView(alone(scoring)), impactOnly).choices.length);
}

// La valeur d'une bille gagnée en main : sans elle, une bille qui pioche ne vaut rien
// pour le glouton ; avec elle, il la joue quand elle rapporte plus que l'Impact perdu.
function checkDrawnValue(run) {
  run("bille gagnée : la valeur par défaut, dite dans la description du joueur", true, PLAYERS.greedy.describe({}).includes(frNumber(MARBLES_DRAWN_VALUE)));
  run("bille gagnée : valeur négative refusée", true, throws(() => PLAYERS.greedy.startGame({ seed: 1, options: { drawnValue: -1 } })));
  // Une vraie bille dont le Tic pioche (sous condition au plus de main vide) : posée
  // seule de sa main, sur un emplacement occupé, elle pioche.
  const drawer = Object.keys(MARBLE_TYPES).find((id) =>
    (MARBLE_TYPES[id].hit ?? []).some((clause) => clause.action === "draw" && (clause.when === undefined || (clause.when.type === "zone" && clause.when.zone === "hand" && clause.when.state === "empty")))
  );
  // Le set du jeu peut n'en avoir aucune (les pioches de l'itération 27 sont des
  // Éveils, jamais prévus) : la planification d'une pioche n'a alors rien à jouer, et
  // seule la simulation, plus bas, se vérifie.
  if (drawer !== undefined) checkPlannedDraw(run, drawer);
  checkEffectDraws(run);
}

// Le glouton devant une vraie bille qui pioche à son Tic, posée seule de sa main.
function checkPlannedDraw(run, drawer) {
  const view = publicView(buildState({ turn: 4, triangle: { leftBase: "clay", rightBase: "dolphin", apex: null }, hand: [drawer], bag: ["bubble", "fireball"] }));
  const greedy = bestPlan(view, { drawnValue: 100 });
  run("bille gagnée : très chère, le glouton pioche", true, greedy.drawn >= 1);
  run("bille gagnée : la valeur du plan", greedy.impact + 100 * greedy.drawn, greedy.value);
  run("bille gagnée : sans valeur, l'Impact seul décide", true, bestPlan(view, { drawnValue: 0 }).impact >= greedy.impact);
  run("bille gagnée : la planification ne révèle rien du sac", true, view.bag.every((marble) => marble === null));
}

// La simulation compte les pioches d'effets, les régénérations et les lancers.
function checkEffectDraws(run) {
  const summary = summarize(simulate({ games: 30, seed: 5, player: "greedy" }));
  run("simulation : des billes piochées par des effets", true, summary.draws.byEffect > 0);
  run("simulation : régénérations en cours de tour, comprises dans le total", true, summary.draws.midTurnRegenerations <= summary.draws.regenerations);
  // La limite elle-même, statuts compris, est une règle du réducteur (domaine marbles).
  run("simulation : des lancers joués à chaque tour, en moyenne", true, summary.throwsPerTurn > 0);
  // Les pioches d'effets reviennent aux billes qui ont une Pioche, jamais aux autres.
  run.same(
    "simulation : seules les billes qui ont une Pioche font piocher",
    [],
    summary.marbles.filter((marble) => marble.drawn > 0 && !drawsSomewhere(MARBLE_TYPES[marble.id])).map((marble) => marble.id)
  );
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
    const result = simulate({ games: 10, seed, player: "greedy", bagMode: { kind: "random", size: 10, maxCopies: 2 } });
    return buildReport({ params: result.params, summary: summarize(result) });
  };
  run.same("déterminisme : même rapport, au caractère près", report(5), report(5));
  run("déterminisme : une autre graine change le rapport", false, JSON.stringify(report(5)) === JSON.stringify(report(6)));

  // Surcharges : prises en compte, le module de réglages intact.
  const short = simulate({ games: 10, seed: 2, player: "greedy", settings: { turns: 4, drawPerTurn: 2, handSize: 6, firstTurnDraw: 6 } });
  run("surcharge : 4 tours", true, short.games.every((game) => game.turns === 4));
  run.same("surcharge : réglages par défaut intacts", settingsBefore, MARBLES_SETTINGS);
  run("surcharge : réglage inconnu refusé", true, throws(() => simulate({ games: 1, settings: { tours: 3 } })));
  run("surcharge : valeur refusée par la simulation", true, throws(() => simulate({ games: 1, settings: { firstTurnDraw: 0 } })));
  run("joueur inconnu refusé", true, throws(() => simulate({ games: 1, player: "nope" })));

  // Sacs.
  const random = simulate({ games: 40, seed: 4, player: "random", bagMode: { kind: "random", size: 12, maxCopies: 1 } });
  run("sac aléatoire : la taille demandée", true, random.games.every((game) => game.bag.length === 12));
  run("sac aléatoire : la limite d'exemplaires", true, random.games.every((game) => new Set(game.bag).size === 12));
  run("sac aléatoire : des sacs différents d'une partie à l'autre", true, new Set(random.games.map((game) => [...game.bag].sort().join())).size > 1);
  run("sac aléatoire : impossible avec la limite", true, throws(() => simulate({ games: 1, bagMode: { kind: "random", size: Object.keys(MARBLE_TYPES).length + 1, maxCopies: 1 } })));
  run.same(
    "sac décrit : liste en texte, doublons regroupés",
    { id: "mine", marbles: [{ marble: "clay", count: 2 }, { marble: "comet", count: 1 }] },
    parseBagText("clay, comet # deux\nclay\n", "mine")
  );
  run.same("sac décrit : liste JSON", { id: "mine", marbles: [{ marble: "agate", count: 1 }] }, parseBagText('["agate"]', "mine"));
  const formatted = { id: "own", marbles: [{ marble: "agate", count: 2 }] };
  run.same("sac décrit : au format du jeu", formatted, parseBagText(JSON.stringify(formatted), "ignored"));
  run("sac décrit : format du jeu mal formé refusé", true, throws(() => parseBagText('{ "id": "own", "marbles": [{ "marble": "agate", "count": 0 }] }', "x")));
  run("sac décrit : bille inconnue refusée au départ", true, throws(() => simulate({ games: 1, bagMode: { kind: "bag", bag: parseBagText("clay nope", "x"), unchecked: true } })));
  run.same("sac par défaut : le sac de départ, pour un sac du joueur", [...bagMarbles(GAME_RULES.bags.starter)].sort(), [...results.greedy.games[0].bag].sort());
  run("sac par défaut : le premier sac préfait valide selon les règles propres (15 billes)", "treasure", defaultToolsBag(definitionById("endurance")).id);
  run("sac par défaut : aucun valide, une erreur", true, throws(() => defaultToolsBag({ ...DEFAULT_GAME_DEFINITION, bag: { kind: "player", buildRules: { size: { min: 1, max: 2 } } } })));
  // Un sac fourni : validé selon les règles de construction, sauf hors règles.
  const small = { id: "small", marbles: [{ marble: "clay", count: 3 }] };
  run("sac fourni : invalide refusé, avec ses problèmes", true, caughtMessage(() => simulate({ games: 1, bagMode: { kind: "bag", bag: small } })).includes("bagTooSmall"));
  run("sac fourni : hors règles, joué", 3, simulate({ games: 1, bagMode: { kind: "bag", bag: small, unchecked: true } }).games[0].bag.length);
  run("sac fourni : un sac préfait, joué tel quel", 15, simulate({ games: 1, bagMode: { kind: "bag", bag: GAME_RULES.bags.treasure } }).games[0].bag.length);
  // Les options de sac des outils (marbles/tools/bag-option.js), sur un faux disque.
  const disk = { "bags/mine.txt": "clay clay comet", "bags/own.json": JSON.stringify(formatted) };
  const readText = (path) => {
    if (!Object.hasOwn(disk, path)) throw new Error("introuvable");
    return disk[path];
  };
  const choice = (values, flags = []) => readBagChoice((name) => values[name], (name) => flags.includes(name), readText);
  run.same("option : sans sac, celui de la définition", { kind: "definition" }, choice({}));
  run.same("option : un sac préfait par son id", { kind: "bag", bag: GAME_RULES.bags.mist, source: "mist", unchecked: false }, choice({ "--bag": "mist" }));
  run.same(
    "option : un fichier en liste, nommé d'après le fichier, hors règles",
    { kind: "bag", bag: { id: "mine", marbles: [{ marble: "clay", count: 2 }, { marble: "comet", count: 1 }] }, source: "bags/mine.txt", unchecked: true },
    choice({ "--bag": "bags/mine.txt" }, ["--unchecked"])
  );
  run.same("option : un fichier au format du jeu", formatted, choice({ "--bag": "bags/own.json" }).bag);
  run("option : fichier illisible refusé", true, throws(() => choice({ "--bag": "bags/none.txt" })));
  run.same("option : sac généré", { kind: "random", size: 9, maxCopies: 2 }, choice({ "--random-bag": "9", "--max-copies": "2" }));
  run("option : préfait inconnu refusé", true, throws(() => choice({ "--bag": "nope" })));
  run("option : --bag et --random-bag s'excluent", true, throws(() => choice({ "--bag": "mist", "--random-bag": "9" })));
  run("option : --unchecked sans --bag refusé", true, throws(() => choice({}, ["--unchecked"])));
  run("option : --max-copies sans --random-bag refusé", true, throws(() => choice({ "--max-copies": "2" })));

  // Une partie se rejoue à l'identique, seule, depuis son index.
  run.same("partie : rejouée seule, même relevé", results.greedy.games[17], playGame({ ...results.greedy.params, index: 17 }));
  run("centiles : interpolation", 2.5, percentile([1, 2, 3, 4], 50));

  // Chaque objectif a son résultat au rapport : paliers, victoires, tours tenus, et les
  // fins faute de billes, pour toutes les définitions du jeu.
  for (const definition of Object.values(GAME_RULES.definitions)) {
    const played = simulate({ games: 4, seed: 3, player: "greedy", definition });
    const report = buildReport({ params: played.params, summary: summarize(played) });
    const goalAt = report.indexOf(REPORT_HEADINGS.goal);
    run(`définition ${definition.id} : jouée, son résultat au rapport`, true, played.games.every((game) => game.result.goal === definition.goal.kind) && goalAt > 0 && report.some((line) => line.startsWith("Fins faute de billes : ")));
    run(`définition ${definition.id} : nommée au rapport`, true, report.some((line) => line.startsWith(`Définition : ${definition.id},`)));
  }
  const target = summarize(simulate({ games: 6, seed: 2, player: "greedy", definition: definitionById("target") })).goal;
  run("cible : une part de victoires", true, target.kind === "target" && target.victories >= 0 && target.victories <= 100);
  const endurance = summarize(simulate({ games: 6, seed: 2, player: "greedy", definition: definitionById("endurance") })).goal;
  run("endurance : des tours tenus", true, endurance.kind === "endurance" && endurance.held.min >= 0 && endurance.held.max <= 20);
  const tiers = summarize(simulate({ games: 6, seed: 2, player: "greedy" })).goal.tiers;
  run("libre : les paliers font 100 %", 100, Math.round(Object.values(tiers).reduce((total, share) => total + share, 0)));
  run.same("ids des billes : ceux de la table, dans son ordre", Object.keys(MARBLE_TYPES), MARBLE_IDS);
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

// Une pioche d'effet revient à l'effet qui l'a demandée (recordEvents), journaux
// écrits à la main : seuls comptent les évènements `effect` et `draw`.
function checkDrawAttribution(run) {
  const effect = (marble, trigger, draw) => ({ type: "effect", trigger, marble, speedDelta: 0, massDelta: 0, draw });
  const drawn = { type: "draw", marble: "clay", cause: "effect" };
  const drawnBy = (events, drawers = []) => {
    const record = { effectDraws: 0, regenerations: 0, midTurnRegenerations: 0, marbles: {}, awaken: { speed: 0, mass: 0 }, pocketReaction: { speed: 0, mass: 0 } };
    recordEvents(record, events, "resolve", drawers);
    return Object.fromEntries(Object.entries(record.marbles).filter(([, stats]) => stats.drawn > 0).map(([id, stats]) => [id, stats.drawn]));
  };
  // Le mélange au milieu de la Pioche d'une bille (drawer) : la réaction d'une bille du
  // pot (reactor) se dit entre la Pioche et ses billes, sans rien piocher elle-même.
  run.same(
    "attribution des pioches : une réaction glissée avant les billes n'en prend aucune",
    { drawer: 2 },
    drawnBy([effect("drawer", "phase", 2), drawn, { type: "bagRegenerated" }, effect("reactor", "pocketReaction", 0), drawn])
  );
  // L'Éveil de la bille piochée pioche à son tour, puis la Pioche de drawer reprend.
  run.same(
    "attribution des pioches : un Éveil qui pioche pendant une Pioche prend ses billes, la Pioche reprend",
    { drawer: 2, cats_eye: 1 },
    drawnBy([effect("drawer", "phase", 2), drawn, effect("cats_eye", "awaken", 1), drawn, drawn])
  );
  // La Pioche d'une réaction de statut : aucune bille ne la fait, aucune ne la compte.
  run.same("attribution des pioches : la Pioche d'un statut, chez aucune bille", {}, drawnBy([effect(null, "statusReaction", 1), drawn]));
  // Une Pioche suspendue par un choix finit dans l'action suivante : la pile la garde.
  const drawers = [];
  drawnBy([effect("drawer", "phase", 2), drawn], drawers);
  run.same("attribution des pioches : la pile passe d'une action à l'autre", { drawer: 1 }, drawnBy([drawn], drawers));
  // Une Pioche arrêtée (main pleine) ne prend rien à la suivante.
  run.same(
    "attribution des pioches : une Pioche arrêtée ne prend pas les billes d'une autre",
    { reactor: 1 },
    drawnBy([effect("drawer", "phase", 2), effect("reactor", "phase", 1), drawn])
  );
}

// La différence de deux rapports (marbles/tools/report-diff.js), celle du comparateur.
// La ligne de commande des outils, lue strictement (marbles/tools/args.js).
// LA FICHE DU SET (marbles/tools/set-sheet-builder.js) : chaque bille de la table une
// fois, numérotée dans son ordre, avec ses deux descriptions et sa fiche ; les sacs
// préfaits ; aucun espace insécable ni phase « aucun effet » ; la langue rendue
// telle qu'elle était. Aucun chiffre de bille attendu : tout se déduit de la table.
function checkSetSheet(run) {
  const before = getLocale();
  const sheet = buildSetSheet({ date: "2000-01-01" });
  const marbles = Object.keys(GAME_RULES.types);
  const lines = sheet.split("\n");
  run("fiche du set : la date demandée", true, lines[1] === "Généré à partir du jeu le 2000-01-01.");
  run.same(
    "fiche du set : une entrée numérotée par bille, dans l'ordre de la table",
    marbles.map((_, index) => `${index + 1}.`),
    lines.filter((line) => /^\d+\. /.test(line)).map((line) => line.split(" ")[0])
  );
  run("fiche du set : deux descriptions par bille", marbles.length * 2, lines.filter((line) => line.startsWith("FR : ") || line.startsWith("EN : ")).length);
  run("fiche du set : une pointe par bille", marbles.length, lines.filter((line) => line.startsWith("Pointe : ")).length);
  run("fiche du set : chaque sac préfait", Object.keys(GAME_RULES.bags).length, lines.filter((line) => /^Sac .* \(\d+ billes\) : /.test(line)).length);
  run("fiche du set : ni espace insécable ni « aucun effet »", false, /[\u00a0\u202f]/.test(sheet) || sheet.includes(": aucun effet."));
  run("fiche du set : la langue rendue", before, getLocale());
  run("fiche du set : même table, même fiche", sheet, buildSetSheet({ date: "2000-01-01" }));
}

function checkArgs(run) {
  const spec = { values: ["--seed", "--games"], flags: ["--json"], positionals: 1 };
  const read = parseArgs(["cas.json", "--seed", "42", "--json"], spec);
  run.same("arguments : valeur, drapeau, argument", ["42", true, false, ["cas.json"]], [read.option("--seed"), read.flag("--json"), read.flag("--games"), read.positionals]);
  run("arguments : une option inconnue refusée", true, throws(() => parseArgs(["--nope"], spec)));
  run("arguments : une valeur manquante en dernier refusée", true, throws(() => parseArgs(["--seed"], spec)));
  run("arguments : une valeur prise par l'option suivante refusée", true, throws(() => parseArgs(["--seed", "--json"], spec)));
  run("arguments : une option donnée deux fois refusée", true, throws(() => parseArgs(["--seed", "1", "--seed", "2"], spec)));
  run("arguments : un argument en trop refusé", true, throws(() => parseArgs(["a.json", "b.json"], spec)));
}

function checkReportDiff(run) {
  const result = simulate({ games: 20, seed: 4, player: "random" });
  const report = [...buildReport({ params: result.params, summary: summarize(result), name: (id) => id }), "Durée : 1,2 s."];
  const headings = Object.values(REPORT_HEADINGS);
  run("rapport : chaque titre du comparateur y est", true, headings.every((heading) => report.some((line) => line.startsWith(heading))));
  run("rapport : les titres des résultats en font partie", true, REPORT_RESULT_HEADINGS.every((heading) => headings.includes(heading)));

  const same = diffReports(report, report.map((line) => (line.startsWith("Durée") ? "Durée : 9,9 s." : line)));
  run("différence : la durée seule ne compte pas", true, same.identical);
  run.same("différence : les anomalies lues", { refusals: 0, interruptions: 0 }, reportAnomalies(report));

  // Une ligne d'une bille changée : rangée sous sa bille, hors des résultats.
  const marbleLine = report.findIndex((line) => line.startsWith("  Posée"));
  const marbleChanged = report.map((line, index) => (index === marbleLine ? "  Posée 99 fois." : line));
  const byMarble = diffReports(report, marbleChanged);
  run("différence : une ligne de bille, une ligne changée", 1, byMarble.changedLines);
  run("différence : une ligne de bille, hors des résultats", false, byMarble.resultsChanged);
  run("différence : une ligne de bille, sous sa bille", report[marbleLine - 1].replace(/\.$/, ""), contextLabel(byMarble.groups[0].context));
  run.same("différence : avant et après", { before: [report[marbleLine].trim()], after: ["Posée 99 fois."] }, {
    before: byMarble.groups[0].before.map((line) => line.trim()),
    after: byMarble.groups[0].after.map((line) => line.trim()),
  });

  // Les dernières lignes, sans paragraphe à elles : chacune sous son propre titre.
  const interruptionLine = report.findIndex((line) => line.startsWith(REPORT_HEADINGS.interruptions));
  const interrupted = diffReports(report, report.map((line, index) => (index === interruptionLine ? `${REPORT_HEADINGS.interruptions}2.` : line)));
  run.same(
    "différence : une interruption changée, une ligne, sous son titre",
    { changed: 1, context: REPORT_HEADINGS.interruptions },
    { changed: interrupted.changedLines, context: interrupted.groups[0].context.heading }
  );

  // Le score final changé : un résultat.
  const scoreLine = report.indexOf(REPORT_HEADINGS.score) + 1;
  const scoreChanged = diffReports(report, report.map((line, index) => (index === scoreLine ? "Moyenne 1." : line)));
  run("différence : le score final est un résultat", true, scoreChanged.resultsChanged);
  run("différence : sous son titre", "Score final", contextLabel(scoreChanged.groups[0].context));
  // Une ligne en plus, puis une en moins : chacune d'un seul côté.
  const added = diffReports(report, [...report.slice(0, scoreLine), "Ligne nouvelle.", ...report.slice(scoreLine)]);
  run.same("différence : une ligne ajoutée", { before: [], after: ["Ligne nouvelle."] }, { before: added.groups[0].before, after: added.groups[0].after });
  run("différence : une interruption lue", 3, reportAnomalies(report.map((line) => (line.startsWith(REPORT_HEADINGS.interruptions) ? `${REPORT_HEADINGS.interruptions}3.` : line))).interruptions);
}
