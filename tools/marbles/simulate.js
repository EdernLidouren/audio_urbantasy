// SIMULATEUR du jeu des billes, au terminal : des milliers de parties à graine,
// jouées par un joueur automatique, et un rapport. Outil de la boîte à outils des
// billes (doc/marbles-tools.md), jamais chargé par le jeu. Il mesure, il ne change
// aucune règle ni aucune valeur.
//
//   node tools/marbles/simulate.js --games 1000 --player greedy
//   node tools/marbles/simulate.js --player random --random-bag 13 --max-copies 2
//   node tools/marbles/simulate.js --bag-file tools/marbles/examples/bag.txt --turns 12
//   node tools/marbles/simulate.js --games 200 --export resultats.csv
//
// Options :
//   --games <n>            nombre de parties (1000)
//   --seed <graine>        graine de départ (1) ; chaque partie a sa graine dérivée
//   --player <id>          random, greedy (défaut), greedy-no-replacement
//   --max-placements <n>   glouton : poses envisagées par tour après le premier (1)
//   --drawn-value <x>      glouton : valeur d'une bille gagnée en main, en points
//                          d'Impact, décimale permise (tools/marbles/drawn-value.js)
//   --random-bag <n>       un sac aléatoire de n billes par partie, tirées dans la table
//   --max-copies <n>       avec --random-bag : exemplaires d'une même bille au plus
//                          (sans limite par défaut)
//   --bag-file <chemin>    le sac d'un fichier (ids séparés par espaces, virgules ou
//                          lignes, # commente ; ou liste JSON). Sans --random-bag ni
//                          --bag-file : le sac de test.
//   --hand-size <n>, --throws <n>, --first-draw <n>, --draw <n>, --turns <n>
//                          surcharges des réglages, pour cette simulation seulement
//   --export <chemin>      résultats bruts : .json (un fichier) ou .csv (deux
//                          fichiers, <nom>-games.csv et <nom>-marbles.csv)
//
// Mêmes options, même rapport, au caractère près, sauf la dernière ligne (durée).

import { readFile, writeFile } from "node:fs/promises";
import { installFileFetch } from "../node-fetch.js";

const args = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function integerOption(name) {
  const value = option(name);
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new Error(`${name} attend un entier, pas "${value}".`);
  return Number(value);
}

const KNOWN_OPTIONS = [
  "--games",
  "--seed",
  "--player",
  "--max-placements",
  "--drawn-value",
  "--random-bag",
  "--max-copies",
  "--bag-file",
  "--hand-size",
  "--throws",
  "--first-draw",
  "--draw",
  "--turns",
  "--export",
];

installFileFetch();
const { t } = await import("../../data/i18n/index.js");
const { simulate, parseBagText } = await import("./simulation.js");
const { summarize } = await import("./stats.js");
const { buildReport } = await import("./report.js");
const { toCsv, toJson } = await import("./export.js");
const name = (id) => t(`marble.${id}.name`);

try {
  for (const arg of args) if (arg.startsWith("--") && !KNOWN_OPTIONS.includes(arg)) throw new Error(`option inconnue ${arg}.`);

  const seedOption = option("--seed") ?? "1";
  const seed = /^\d+$/.test(seedOption) ? Number(seedOption) : seedOption;
  let bagMode = { kind: "test" };
  if (option("--max-copies") !== undefined && option("--random-bag") === undefined) throw new Error("--max-copies ne vaut qu'avec --random-bag.");
  // L'extension de l'export, vérifiée avant de jouer : pas une simulation entière
  // perdue pour une faute de frappe.
  const exportOption = option("--export");
  if (exportOption !== undefined && !exportOption.endsWith(".json") && !exportOption.endsWith(".csv")) throw new Error("--export attend un chemin en .json ou en .csv.");
  if (option("--random-bag") !== undefined) bagMode = { kind: "random", size: integerOption("--random-bag"), maxCopies: integerOption("--max-copies") ?? null };
  else if (option("--bag-file") !== undefined) {
    const source = option("--bag-file");
    bagMode = { kind: "list", source, marbles: parseBagText(await readFile(source, "utf-8")) };
  }
  const settings = {};
  for (const [flag, setting] of [["--hand-size", "maxHandSize"], ["--throws", "throwsPerTurn"], ["--first-draw", "firstTurnDraw"], ["--draw", "drawPerTurn"], ["--turns", "turnCount"]]) {
    const value = integerOption(flag);
    if (value !== undefined) settings[setting] = value;
  }
  const maxPlacements = integerOption("--max-placements");
  const drawnValueOption = option("--drawn-value");
  if (drawnValueOption !== undefined && !/^\d+([.,]\d+)?$/.test(drawnValueOption)) throw new Error(`--drawn-value attend un nombre, pas "${drawnValueOption}".`);
  const playerOptions = {};
  if (maxPlacements !== undefined) playerOptions.maxPlacements = maxPlacements;
  if (drawnValueOption !== undefined) playerOptions.drawnValue = Number(drawnValueOption.replace(",", "."));

  const started = performance.now();
  const result = simulate({
    games: integerOption("--games") ?? 1000,
    seed,
    player: option("--player") ?? "greedy",
    playerOptions,
    bagMode,
    settings,
  });
  const summary = summarize(result);
  const seconds = (performance.now() - started) / 1000;

  for (const line of buildReport({ params: result.params, summary, name })) console.log(line);

  const exportPath = option("--export");
  if (exportPath !== undefined) {
    if (exportPath.endsWith(".json")) {
      await writeFile(exportPath, toJson({ ...result, summary }), "utf-8");
      console.log(`Export : ${exportPath}.`);
    } else if (exportPath.endsWith(".csv")) {
      const base = exportPath.slice(0, -".csv".length);
      const csv = toCsv({ ...result, summary });
      await writeFile(`${base}-games.csv`, csv.games, "utf-8");
      await writeFile(`${base}-marbles.csv`, csv.marbles, "utf-8");
      console.log(`Export : ${base}-games.csv et ${base}-marbles.csv.`);
    } else {
      throw new Error("--export attend un chemin en .json ou en .csv.");
    }
  }
  console.log(`Durée : ${seconds.toFixed(1).replace(".", ",")} s.`);
} catch (error) {
  console.log(`Erreur : ${error.message}`);
  process.exitCode = 1;
}
