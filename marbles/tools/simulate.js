// SIMULATEUR du jeu des billes, au terminal : des milliers de parties à graine,
// jouées par un joueur automatique, et un rapport. Outil de la boîte à outils des
// billes (doc/marbles-tools.md), jamais chargé par le jeu. Il mesure, il ne change
// aucune règle ni aucune valeur.
//
//   node marbles/tools/simulate.js --games 1000 --player greedy
//   node marbles/tools/simulate.js --player random --random-bag 13 --max-copies 2
//   node marbles/tools/simulate.js --bag treasure
//   node marbles/tools/simulate.js --bag marbles/tools/examples/bag.txt --turns 12
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
//   --bag <id|fichier>     un sac préfait, ou le sac d'un fichier (format du jeu en
//                          JSON, ou liste d'ids), fourni comme sac du joueur
//   --unchecked            avec --bag : sans les règles de construction
//   --random-bag <n>       un sac généré de n billes par partie, tirées dans la table
//   --max-copies <n>       avec --random-bag : exemplaires d'une même bille au plus
//                          (sans limite par défaut)
//                          Sans --bag ni --random-bag : le sac de la définition (le
//                          sac de départ pour un sac du joueur). Détail :
//                          marbles/tools/bag-option.js
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

import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { installFileFetch } from "../../tools/node-fetch.js";
import { parseArgs } from "./args.js";
// Sans texte à charger : importé avant installFileFetch.
import { BAG_FLAG_OPTIONS, BAG_VALUE_OPTIONS, readBagChoice } from "./bag-option.js";

function integerOption(option, name) {
  const value = option(name);
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new Error(`${name} attend un entier, pas "${value}".`);
  return Number(value);
}

// Les options à valeur (et --unchecked, sans valeur) ; la ligne de commande se lit
// strictement (args.js).
const KNOWN_OPTIONS = [
  "--games",
  "--seed",
  "--player",
  "--max-placements",
  "--drawn-value",
  ...BAG_VALUE_OPTIONS,
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
const { simulate } = await import("./simulation.js");
const { summarize } = await import("./stats.js");
const { buildReport } = await import("./report.js");
const { toCsv, toJson } = await import("./export.js");
const { readDefinitionOption } = await import("./definition-option.js");
const name = (id) => t(`marble.${id}.name`);

try {
  const { option, flag } = parseArgs(process.argv.slice(2), { values: KNOWN_OPTIONS, flags: BAG_FLAG_OPTIONS });

  const seedOption = option("--seed") ?? "1";
  const seed = /^\d+$/.test(seedOption) ? Number(seedOption) : seedOption;
  const bagMode = readBagChoice(option, flag, (path) => readFileSync(path, "utf-8"));
  // L'extension de l'export, vérifiée avant de jouer : pas une simulation entière
  // perdue pour une faute de frappe.
  const exportOption = option("--export");
  if (exportOption !== undefined && !exportOption.endsWith(".json") && !exportOption.endsWith(".csv")) throw new Error("--export attend un chemin en .json ou en .csv.");
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
