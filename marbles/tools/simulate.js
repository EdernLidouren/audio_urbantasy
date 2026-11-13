// SIMULATEUR du jeu des billes, au terminal : des milliers de parties à graine,
// jouées par un joueur automatique, et un rapport. Outil de la boîte à outils des
// billes (doc/marbles-tools.md), jamais chargé par le jeu. Il mesure, il ne change
// aucune règle ni aucune valeur.
//
//   node marbles/tools/simulate.js --games 1000 --player greedy
//   node marbles/tools/simulate.js --player random --random-bag 13 --max-copies 2
//   node marbles/tools/simulate.js --bag-file marbles/tools/examples/bag.txt --turns 12
//   node marbles/tools/simulate.js --games 200 --export resultats.csv
//   node marbles/tools/simulate.js --definition free
//
// Options :
//   --games <n>            nombre de parties (1000)
//   --seed <graine>        graine de départ (1) ; chaque partie a sa graine dérivée
//   --player <id>          random, greedy (défaut), greedy-no-replacement
//   --max-placements <n>   glouton : poses envisagées par tour après le premier (1)
//   --drawn-value <x>      glouton : valeur d'une bille gagnée en main, en points
//                          d'Impact, décimale permise (marbles/tools/drawn-value.js)
//   --random-bag <n>       un sac aléatoire de n billes par partie, tirées dans la table
//   --max-copies <n>       avec --random-bag : exemplaires d'une même bille au plus
//                          (sans limite par défaut)
//   --bag-file <chemin>    le sac d'un fichier (ids séparés par espaces, virgules ou
//                          lignes, # commente ; ou liste JSON). Sans --random-bag ni
//                          --bag-file : le sac de la définition.
//   --definition <id|fichier>  la définition de partie : l'id d'une définition du
//                          registre, ou un fichier JSON de même forme
//                          (marbles/tools/definition-option.js) ; celle du jeu par défaut
//   --hand-size <n>, --throws <n>, --pot <n>, --first-draw <n>, --draw <n>, --turns <n>
//                          surcharges des valeurs de la définition, pour cette
//                          simulation seulement
//   --export <chemin>      résultats bruts : .json (un fichier) ou .csv (deux
//                          fichiers, <nom>-games.csv et <nom>-marbles.csv)
//
// Mêmes options, même rapport, au caractère près, sauf la dernière ligne (durée).

import { readFile, writeFile } from "node:fs/promises";
import { installFileFetch } from "../../tools/node-fetch.js";
import { parseArgs } from "./args.js";

function integerOption(option, name) {
  const value = option(name);
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new Error(`${name} attend un entier, pas "${value}".`);
  return Number(value);
}

// Les options, toutes à valeur ; la ligne de commande se lit strictement (args.js).
const KNOWN_OPTIONS = [
  "--games",
  "--seed",
  "--player",
  "--max-placements",
  "--drawn-value",
  "--random-bag",
  "--max-copies",
  "--bag-file",
  "--definition",
  "--hand-size",
  "--throws",
  "--pot",
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
const { readDefinitionOption } = await import("./definition-option.js");
const name = (id) => t(`marble.${id}.name`);

try {
  const { option } = parseArgs(process.argv.slice(2), { values: KNOWN_OPTIONS });

  const seedOption = option("--seed") ?? "1";
  const seed = /^\d+$/.test(seedOption) ? Number(seedOption) : seedOption;
  let bagMode = { kind: "test" };
  if (option("--max-copies") !== undefined && option("--random-bag") === undefined) throw new Error("--max-copies ne vaut qu'avec --random-bag.");
  // L'extension de l'export, vérifiée avant de jouer : pas une simulation entière
  // perdue pour une faute de frappe.
  const exportOption = option("--export");
  if (exportOption !== undefined && !exportOption.endsWith(".json") && !exportOption.endsWith(".csv")) throw new Error("--export attend un chemin en .json ou en .csv.");
  if (option("--random-bag") !== undefined) bagMode = { kind: "random", size: integerOption(option, "--random-bag"), maxCopies: integerOption(option, "--max-copies") ?? null };
  else if (option("--bag-file") !== undefined) {
    const source = option("--bag-file");
    bagMode = { kind: "list", source, marbles: parseBagText(await readFile(source, "utf-8")) };
  }
  const settings = {};
  for (const [flag, setting] of [["--hand-size", "handSize"], ["--throws", "throws"], ["--pot", "potCapacity"], ["--first-draw", "firstTurnDraw"], ["--draw", "drawPerTurn"], ["--turns", "turns"]]) {
    const value = integerOption(option, flag);
    if (value !== undefined) settings[setting] = value;
  }
  const maxPlacements = integerOption(option, "--max-placements");
  const drawnValueOption = option("--drawn-value");
  if (drawnValueOption !== undefined && !/^\d+([.,]\d+)?$/.test(drawnValueOption)) throw new Error(`--drawn-value attend un nombre, pas "${drawnValueOption}".`);
  const playerOptions = {};
  if (maxPlacements !== undefined) playerOptions.maxPlacements = maxPlacements;
  if (drawnValueOption !== undefined) playerOptions.drawnValue = Number(drawnValueOption.replace(",", "."));

  const started = performance.now();
  const result = simulate({
    games: integerOption(option, "--games") ?? 1000,
    seed,
    player: option("--player") ?? "greedy",
    playerOptions,
    bagMode,
    definition: await readDefinitionOption(option("--definition")),
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
    } else {
      // Un .csv : l'extension est vérifiée à la lecture des options.
      const base = exportPath.slice(0, -".csv".length);
      const csv = toCsv({ ...result, summary });
      await writeFile(`${base}-games.csv`, csv.games, "utf-8");
      await writeFile(`${base}-marbles.csv`, csv.marbles, "utf-8");
      console.log(`Export : ${base}-games.csv et ${base}-marbles.csv.`);
    }
  }
  console.log(`Durée : ${seconds.toFixed(1).replace(".", ",")} s.`);
} catch (error) {
  console.log(`Erreur : ${error.message}`);
  process.exitCode = 1;
}
