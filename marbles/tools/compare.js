// COMPARATEUR DE SIMULATIONS du jeu des billes, au terminal : les mêmes simulations
// jouées sur un commit (le dernier par défaut) et sur le code en cours, et ce qui
// change entre les deux rapports. Outil de la boîte à outils des billes
// (doc/marbles-tools.md), jamais chargé par le jeu. Il ne touche ni au dépôt ni à
// l'index : le commit est extrait dans un dossier temporaire (git archive), effacé
// à la fin.
//
//   node marbles/tools/compare.js
//   node marbles/tools/compare.js --ref main
//   node marbles/tools/compare.js --games 300
//   node marbles/tools/compare.js --save comparaison
//
// Options :
//   --ref <commit>     le côté « avant » : un commit, une branche, une étiquette (HEAD)
//   --games <n>        parties par simulation (1000)
//   --seed <graine>    graine de départ (1)
//   --save <dossier>   garde les rapports : <dossier>/avant/<simulation>.txt et
//                      <dossier>/apres/<simulation>.txt
//
// Les six simulations de référence (RUNS) : les trois joueurs, sur le sac de départ et
// sur des sacs aléatoires de 13 billes (2 exemplaires au plus). Toutes tournent en
// parallèle, chacune dans son processus.
//
// La sortie : une ligne par simulation (identique, ou combien de lignes changent et
// si les résultats en font partie), le détail des lignes changées sous leur
// contexte (section, bille), puis un bilan : rapports identiques, résultats
// (score final, Impact par tour), actions refusées et enchaînements
// interrompus. Code de sortie 1 si une simulation échoue, 0 sinon, même si des
// lignes changent : c'est à la lecture de dire si un changement est voulu.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { installFileFetch } from "../../tools/node-fetch.js";
import { parseArgs } from "./args.js";

// Avant d'importer le rapport, dont les modules chargent les textes par fetch (voir
// tools/node-fetch.js).
installFileFetch();
const { contextLabel, diffReports, reportAnomalies } = await import("./report-diff.js");

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
// Ce qu'il faut du commit pour que son simulateur tourne : ses outils, son moteur,
// ses billes, ses textes et ce qu'ils importent. Ni les sons, ni les scènes.
const EXTRACTED = ["core", "config", "data", "lib", "marbles", "tools", "view"];
const RANDOM_BAG = ["--random-bag", "13", "--max-copies", "2"];
const RUNS = [
  { id: "random", label: "aléatoire, sac de départ", args: ["--player", "random"] },
  { id: "greedy", label: "glouton, sac de départ", args: ["--player", "greedy"] },
  { id: "greedy-no-replacement", label: "glouton sans remplacement, sac de départ", args: ["--player", "greedy-no-replacement"] },
  { id: "rb-random", label: "aléatoire, sacs aléatoires", args: ["--player", "random", ...RANDOM_BAG] },
  { id: "rb-greedy", label: "glouton, sacs aléatoires", args: ["--player", "greedy", ...RANDOM_BAG] },
  { id: "rb-greedy-no-replacement", label: "glouton sans remplacement, sacs aléatoires", args: ["--player", "greedy-no-replacement", ...RANDOM_BAG] },
];

// Les options, toutes à valeur ; la ligne de commande se lit strictement (args.js).
const KNOWN_OPTIONS = ["--ref", "--games", "--seed", "--save"];

// Un programme, sa sortie standard en texte ; une erreur claire s'il échoue.
// `stdin` : un flux à brancher sur son entrée.
function exec(command, commandArgs, { cwd = ROOT, stdin = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd, stdio: [stdin === null ? "ignore" : "pipe", "pipe", "pipe"] });
    const out = [];
    const err = [];
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    if (stdin !== null) stdin.pipe(child.stdin);
    child.on("error", reject);
    child.on("close", (code) => {
      const stdout = Buffer.concat(out).toString("utf-8");
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} ${commandArgs.join(" ")} a échoué (code ${code}) :\n${stdout}${Buffer.concat(err).toString("utf-8")}`));
    });
  });
}

// Le commit extrait dans `dir` : git archive, déballé par tar, sans toucher au dépôt.
async function extract(ref, dir) {
  const archive = spawn("git", ["archive", "--format=tar", ref, "--", ...EXTRACTED], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  const failed = new Promise((_, reject) => {
    const err = [];
    archive.stderr.on("data", (chunk) => err.push(chunk));
    archive.on("close", (code) => {
      if (code !== 0) reject(new Error(`git archive ${ref} a échoué (code ${code}) : ${Buffer.concat(err).toString("utf-8")}`));
    });
  });
  await Promise.race([exec("tar", ["-x", "-f", "-", "-C", dir], { stdin: archive.stdout }), failed]);
}

// Le simulateur sous la racine `root` : marbles/tools/simulate.js, ou, dans un
// commit d'avant l'arborescence propre aux billes, tools/marbles/simulate.js.
const SIMULATOR_PATHS = [
  ["marbles", "tools", "simulate.js"],
  ["tools", "marbles", "simulate.js"],
];
function simulatorIn(root) {
  const found = SIMULATOR_PATHS.map((parts) => join(root, ...parts)).find((path) => existsSync(path));
  if (found === undefined) throw new Error(`comparateur : aucun simulateur sous ${root}.`);
  return found;
}

// Une simulation, depuis la racine `root` (le code en cours, ou le commit extrait).
async function simulate(root, entry, games, seed) {
  const output = await exec(process.execPath, [simulatorIn(root), "--games", String(games), "--seed", String(seed), ...entry.args], { cwd: root });
  return output.replace(/\r\n/g, "\n").trimEnd().split("\n");
}

const plural = (count, one, many) => (count === 1 ? one : many);

async function main() {
  const { option } = parseArgs(process.argv.slice(2), { values: KNOWN_OPTIONS });
  const ref = option("--ref") ?? "HEAD";
  const gamesOption = option("--games") ?? "1000";
  if (!/^\d+$/.test(gamesOption) || Number(gamesOption) < 1) throw new Error(`--games attend un entier >= 1, pas "${gamesOption}".`);
  const games = Number(gamesOption);
  const seed = option("--seed") ?? "1";
  const saveDir = option("--save");

  const commit = (await exec("git", ["rev-parse", "--short", "--verify", `${ref}^{commit}`])).trim();
  // Fichiers suivis modifiés depuis ce commit, et fichiers nouveaux : sans eux, les
  // deux côtés sont le même code.
  const modified = (await exec("git", ["diff", "--name-only", commit, "--", ...EXTRACTED])).trim();
  const untracked = (await exec("git", ["ls-files", "--others", "--exclude-standard", "--", ...EXTRACTED])).trim();
  console.log(`Comparaison des simulations : ${ref} (${commit}) avant, le code en cours après.`);
  if (modified === "" && untracked === "") console.log("Le code en cours est celui de ce commit : les rapports seront identiques.");
  console.log(`${games} parties par simulation, graine de départ ${seed}, ${RUNS.length} simulations.`);
  console.log("");

  const started = performance.now();
  const beforeRoot = await mkdtemp(join(tmpdir(), "marbles-compare-"));
  try {
    await extract(ref, beforeRoot);
    const reports = await Promise.all(
      RUNS.map(async (entry) => {
        const [before, after] = await Promise.all([simulate(beforeRoot, entry, games, seed), simulate(ROOT, entry, games, seed)]);
        return { entry, before, after, diff: diffReports(before, after) };
      })
    );

    if (saveDir !== undefined) {
      for (const side of ["avant", "apres"]) await mkdir(join(saveDir, side), { recursive: true });
      for (const { entry, before, after } of reports) {
        await writeFile(join(saveDir, "avant", `${entry.id}.txt`), `${before.join("\n")}\n`, "utf-8");
        await writeFile(join(saveDir, "apres", `${entry.id}.txt`), `${after.join("\n")}\n`, "utf-8");
      }
    }

    for (const { entry, diff } of reports) {
      if (diff.identical) {
        console.log(`${entry.label} : identique.`);
        continue;
      }
      const lines = `${diff.changedLines} ${plural(diff.changedLines, "ligne change", "lignes changent")}`;
      console.log(`${entry.label} : ${lines}, ${diff.resultsChanged ? "dont des RÉSULTATS" : "aucune dans les résultats"}.`);
      for (const group of diff.groups) {
        console.log(`  ${contextLabel(group.context)} :`);
        for (const line of group.before) console.log(`    avant : ${line.trim()}`);
        for (const line of group.after) console.log(`    après : ${line.trim()}`);
      }
    }

    console.log("");
    console.log("Bilan.");
    const identical = reports.filter(({ diff }) => diff.identical).length;
    console.log(`Rapports identiques : ${identical} sur ${reports.length}.`);
    const withResults = reports.filter(({ diff }) => diff.resultsChanged).map(({ entry }) => entry.label);
    console.log(
      withResults.length === 0
        ? "Résultats (score final, Impact par tour) : identiques partout."
        : `Résultats (score final, Impact par tour) : changent pour ${withResults.join(" ; ")}.`
    );
    for (const [field, words] of [
      ["refusals", "Actions refusées"],
      ["interruptions", "Enchaînements interrompus"],
    ]) {
      const counts = reports.map(({ entry, after }) => ({ label: entry.label, count: reportAnomalies(after)[field] }));
      const anomalies = counts.filter(({ count }) => count !== 0);
      console.log(anomalies.length === 0 ? `${words} après : 0 partout.` : `${words} après : ${anomalies.map(({ label, count }) => `${label} ${count ?? "illisible"}`).join(" ; ")}. ANOMALIE.`);
    }
    if (saveDir !== undefined) console.log(`Rapports gardés dans ${saveDir}.`);
    console.log(`Durée : ${((performance.now() - started) / 1000).toFixed(1).replace(".", ",")} s.`);
  } finally {
    await rm(beforeRoot, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.log(`Erreur : ${error.message}`);
  process.exitCode = 1;
}
