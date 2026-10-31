// EXPORTS SANS USAGE, au terminal avec Node — outil de développement, jamais
// chargé par le jeu. Un RAPPORT, pas une vérification : un export
// qu'aucun autre fichier ne cite est soit du code mort, soit un export
// superflu (la fonction ne sert que dans son propre fichier), soit un
// point d'entrée gardé exprès (une API de console, un mécanisme de lib/
// prêt pour un autre jeu). À trier à la main, jamais retiré en aveugle.
//
//   node tools/dead-exports.js
//
// Trois catégories :
//   - "sans usage" : le nom n'apparaît nulle part ailleurs que dans son
//     fichier, ni même dans son fichier hors de sa déclaration ;
//   - "seulement dans son fichier" : utilisé en interne, l'`export` est de
//     trop ;
//   - "seulement par les vérifications ou les outils" (core/checks/,
//     lib/checks/, tools/) : à garder si la vérification le justifie.
//
// Déclarations lues : `export function|const|let|var|class <nom>` et les
// listes `export { a, b as c }` (réexports compris : un fichier comme
// lib/audio.js réexporte, l'original est alors utilisé par lui). Les
// exports par défaut ne sont pas suivis. Un nom est "utilisé" ailleurs s'il
// apparaît comme mot hors commentaire dans un autre fichier .js du projet,
// ou dans index.html. Limite assumée : un homonyme (un autre `parse` dans
// un autre fichier) passe pour un usage.
//
// Sources des exports : tous les .js du projet sauf tools/ (ses exports
// sont l'API de console des outils) et l'outillage des vérifications (voir
// isCheckInfrastructure) ; sources des usages : tous les .js, tools/ et
// vérifications compris.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, resolve, sep } from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SKIPPED_DIRECTORIES = new Set([".git", ".claude", "node_modules", "vendor", "dev", "assets"]);

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

// Le code sans ses commentaires `//` (un nom cité dans un commentaire n'est
// pas un usage) ni ses blocs /* */. "://" d'une URL dans une chaîne reste.
function codeOf(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => {
      const at = line.search(/(?<!:)\/\//);
      return at >= 0 ? line.slice(0, at) : line;
    })
    .join("\n");
}

// Noms exportés par un fichier (déclarations et listes).
function exportedNames(code) {
  const names = new Set();
  for (const match of code.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    names.add(match[1]);
  }
  for (const match of code.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name && name !== "default") names.add(name);
    }
  }
  return names;
}

// Fichiers faits pour les seules vérifications : leurs fixtures
// (core/checks/, lib/checks/) et leur moteur (lib/check.js). Leurs exports
// ne servent qu'aux vérifications, par construction : jamais rapportés.
const isCheckInfrastructure = (file) =>
  /[\\/](?:core|lib)[\\/]checks[\\/]/.test(file) || file === join(ROOT, "lib", "check.js");

const isCheckOrTool = (file) => /[\\/](?:core|lib)[\\/]checks[\\/]/.test(file) || file.startsWith(join(ROOT, "tools") + sep);

export function findDeadExports() {
  const files = listJsFiles(ROOT);
  const code = new Map(files.map((file) => [file, codeOf(readFileSync(file, "utf8"))]));
  const html = existsSync(join(ROOT, "index.html")) ? readFileSync(join(ROOT, "index.html"), "utf8") : "";
  const word = (name) => new RegExp(String.raw`(?<![\w$])${name.replace(/\$/g, "\\$")}(?![\w$])`, "g");

  const report = { unused: [], internalOnly: [], checksOnly: [] };
  for (const file of files) {
    if (file.startsWith(join(ROOT, "tools") + sep) || isCheckInfrastructure(file)) continue;
    for (const name of exportedNames(code.get(file))) {
      const pattern = word(name);
      const users = files.filter((other) => other !== file && pattern.test(code.get(other)) && ((pattern.lastIndex = 0), true));
      pattern.lastIndex = 0;
      if (word(name).test(html)) continue;
      const entry = `${relative(ROOT, file)} : ${name}`;
      if (users.length === 0) {
        const ownUses = (code.get(file).match(word(name)) ?? []).length;
        (ownUses > 1 ? report.internalOnly : report.unused).push(entry);
      } else if (users.every(isCheckOrTool)) {
        report.checksOnly.push(`${entry} (${users.map((user) => relative(ROOT, user)).join(", ")})`);
      }
    }
  }
  return report;
}

// Lancé directement : le rapport. Toujours code de sortie 0 (un rapport,
// pas une vérification).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { unused, internalOnly, checksOnly } = findDeadExports();
  const section = (title, entries) => {
    if (entries.length === 0) return;
    console.log(`\n${title} (${entries.length}) :`);
    for (const entry of entries) console.log(`  ${entry}`);
  };
  section("Sans usage", unused);
  section("Seulement dans son fichier (export de trop)", internalOnly);
  section("Seulement par les vérifications ou les outils", checksOnly);
  console.log(
    `\nExports sans usage : ${unused.length} sans usage, ${internalOnly.length} seulement dans leur fichier, ${checksOnly.length} seulement par les vérifications ou les outils.`
  );
}
