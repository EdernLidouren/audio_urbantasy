// VÉRIFICATION GÉNÉRALE au terminal, avec Node : la seule commande à lancer
// après une session de travail, code ou contenu.
//
//   node tools/verify.js        (ou verify.bat, à la racine du projet)
//
// Enchaîne, dans cet ordre :
//   1. syntaxe : `node --check` sur chaque fichier .js du projet, vue
//      comprise (une faute de syntaxe dans la vue ne se verrait sinon qu'en
//      ouvrant le jeu) ;
//   2. vérifications du core (tools/run-checks.js) ;
//   3. audit du contenu (tools/run-content-audit.js) — ses avertissements
//      de nommage sont comptés sur sa ligne, sans le faire échouer ;
//   4. parité i18n fr/en (tools/check_i18n_parity.py, avec Python) ;
//   5. audit de la doc (tools/doc-audit.js) : fichiers, identifiants et
//      sections cités par la doc et les commentaires ;
//   6. exports sans usage (tools/dead-exports.js) : un RAPPORT, jamais un
//      échec — ses comptes sur une ligne, le détail en lançant l'outil.
// Toutes les étapes tournent, même après un échec : un seul passage dit tout
// ce qui ne va pas. Une étape réussie tient en une ligne ; une étape en
// échec affiche sa sortie complète. Code de sortie 1 si une étape échoue.
// Ne couvre pas la trace audio, qui a besoin du navigateur
// (tools/audio-trace.js).

import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

// Dossiers jamais contrôlés : bibliothèques vendues telles quelles, notes
// personnelles, sons, outils de l'environnement.
const SKIPPED_DIRECTORIES = new Set([".git", ".claude", "node_modules", "vendor", "dev", "assets"]);

// Nombre de `node --check` lancés en même temps : assez pour que l'étape de
// syntaxe dure une seconde ou deux, pas assez pour saturer la machine.
const SYNTAX_CHECK_CONCURRENCY = 8;

function listJsFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) files.push(...listJsFiles(join(directory, entry.name)));
    } else if (entry.name.endsWith(".js")) {
      files.push(join(directory, entry.name));
    }
  }
  return files;
}

// Lance une commande depuis la racine du projet ; rend { code, output }
// (sorties standard et d'erreur mêlées, dans l'ordre). Commande introuvable
// -> code null et le message de l'erreur.
function run(command, args, env = {}) {
  return new Promise((resolve) => {
    let output = "";
    const child = spawn(command, args, { cwd: ROOT, env: { ...process.env, ...env } });
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", (error) => resolve({ code: null, output: error.message }));
    child.on("close", (code) => resolve({ code, output }));
  });
}

// Ligne de résumé d'une sortie : la dernière qui correspond à `pattern`
// (ex. le récapitulatif des vérifications, suivi d'une ligne secondaire),
// sinon la dernière ligne.
function summaryLine(output, pattern) {
  const lines = output.trim().split(/\r?\n/);
  const matching = pattern ? lines.filter((line) => pattern.test(line)) : [];
  return (matching.length > 0 ? matching[matching.length - 1] : lines[lines.length - 1]) ?? "";
}

async function checkSyntax() {
  const files = listJsFiles(ROOT);
  const failures = [];
  let next = 0;
  async function worker() {
    while (next < files.length) {
      const file = files[next++];
      const { code, output } = await run(process.execPath, ["--check", file]);
      if (code !== 0) failures.push(`${relative(ROOT, file)}\n${output.trim()}`);
    }
  }
  await Promise.all(Array.from({ length: SYNTAX_CHECK_CONCURRENCY }, worker));
  return failures.length === 0
    ? { ok: true, summary: `${files.length} fichiers sans erreur de syntaxe` }
    : { ok: false, summary: `${failures.length} fichier(s) en erreur sur ${files.length}`, output: failures.join("\n\n") };
}

// `summary` : motif de la ligne de résumé (voir summaryLine).
async function runStep(command, args, { env, summary } = {}) {
  const { code, output } = await run(command, args, env);
  if (code === null) return { ok: false, summary: `impossible de lancer ${command} (${output})`, output: "" };
  const line = summaryLine(output, summary);
  return code === 0 ? { ok: true, summary: line } : { ok: false, summary: line, output };
}

const STEPS = [
  { name: "syntaxe", run: checkSyntax },
  { name: "vérifications du core", run: () => runStep(process.execPath, ["tools/run-checks.js"], { summary: /^Récapitulatif/ }) },
  { name: "audit du contenu", run: () => runStep(process.execPath, ["tools/run-content-audit.js"], { summary: /^Audit du contenu/ }) },
  // PYTHONUTF8 : sans lui, Python écrit dans la page de code de Windows et
  // les accents arrivent illisibles.
  {
    name: "parité i18n",
    run: () => runStep("python", ["tools/check_i18n_parity.py"], { env: { PYTHONUTF8: "1" }, summary: /synchrone|divergence/ }),
  },
  { name: "audit de la doc", run: () => runStep(process.execPath, ["tools/doc-audit.js"], { summary: /^Audit de la doc/ }) },
  { name: "exports sans usage", run: () => runStep(process.execPath, ["tools/dead-exports.js"], { summary: /^Exports sans usage/ }) },
];

let allOk = true;
for (const step of STEPS) {
  const result = await step.run();
  allOk &&= result.ok;
  console.log(`${result.ok ? "OK    " : "ÉCHEC "} ${step.name} : ${result.summary}`);
  if (!result.ok && result.output) console.log(`\n${result.output.trim()}\n`);
}
console.log(allOk ? "\nTout est vert." : "\nAu moins une étape a échoué (détail ci-dessus).");
process.exitCode = allOk ? 0 : 1;
