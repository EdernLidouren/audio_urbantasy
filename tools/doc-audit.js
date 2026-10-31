// AUDIT DE LA DOC au terminal, avec Node — outil de développement, jamais
// chargé par le jeu. Vérifie que ce que la doc et les commentaires CITENT
// existe encore, au lieu de le découvrir en lisant une doc périmée :
//   - chaque CHEMIN de fichier cité (`core/world-load.js`, un chemin
//     relatif "./<fichier>", `doc/save.md`...) existe ;
//   - chaque IDENTIFIANT cité derrière un fichier de code
//     (`core/world-load.js/prepareLoadedWorld`, ou
//     `` `core/state.js`/`travelToWorld` `` dans la doc) apparaît encore dans
//     ce fichier ;
//   - chaque SECTION citée derrière un fichier de doc
//     (`doc/scripting.md`/"Triggers") est encore un titre de ce fichier.
//
//   node tools/doc-audit.js
//
// Sources lues : doc/*.md, CLAUDE.md, et les commentaires (`//`) de tout
// fichier .js du projet (vendor/, assets/ et dev/ exceptés). Un chemin
// relatif ("./<fichier>", "../<fichier>") se résout depuis le fichier qui
// le cite, tout autre chemin depuis la racine du projet (voir
// resolveCitation).
//
// Ignorés, par construction : les chemins de sons ("assets/...", vérifiés
// par l'audit du contenu), les motifs ("scenes/*.json", "<domaine>.md"),
// les URL. Limite assumée : un identifiant est cherché comme MOT dans le
// fichier, pas comme déclaration — un nom resté dans un commentaire du
// fichier cité passe pour présent.
//
// Code de sortie 1 s'il reste au moins un problème.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, dirname, resolve, sep } from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SKIPPED_DIRECTORIES = new Set([".git", ".claude", "node_modules", "vendor", "dev", "assets"]);

// Un chemin cité : segments de dossier puis un fichier à extension connue.
// Préfixe facultatif "./" ou "../" (un ou plusieurs).
const EXTENSIONS = "json|js|md|py|bat|html";
const PATH = String.raw`(?:\.\.?\/)*(?:[A-Za-z0-9_.-]+(?<!\.(?:${EXTENSIONS}))\/)*[A-Za-z0-9_.-]+\.(?:${EXTENSIONS})(?![\w-])`;
// Ce qui suit éventuellement un chemin : "/nom" ou "`/`nom`" (un
// identifiant), "/"Titre"" ou "`/"Titre"" (une section de doc).
const CITATION = new RegExp(String.raw`(${PATH})(?:\`?\/\`?([A-Za-z_$][\w$]*)(?![\w$]|\.[A-Za-z])\`?|\`?\/"([^"\n]+)")?`, "g");

function listFiles(directory, accept) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) files.push(...listFiles(join(directory, entry.name), accept));
    } else if (accept(entry.name)) {
      files.push(join(directory, entry.name));
    }
  }
  return files;
}

// Texte à auditer d'un fichier : tout le Markdown, ou seulement les
// commentaires `//` d'un fichier de code (une chaîne du code n'est pas une
// citation). Rend [{ line, text }].
function citedText(file) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  if (file.endsWith(".md")) return lines.map((text, index) => ({ line: index + 1, text }));
  const out = [];
  lines.forEach((text, index) => {
    const at = text.indexOf("//");
    // "://" d'une URL dans une chaîne : pas un commentaire.
    if (at >= 0 && text[at - 1] !== ":") out.push({ line: index + 1, text: text.slice(at + 2) });
  });
  return out;
}

// Titres d'un fichier Markdown, sans les "#" ni les accents graves.
const headingsCache = new Map();
function headingsOf(file) {
  if (!headingsCache.has(file)) {
    const headings = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => /^#{1,6}\s/.test(line))
      .map((line) => line.replace(/^#{1,6}\s+/, "").replace(/[`"]/g, "").trim());
    headingsCache.set(file, headings);
  }
  return headingsCache.get(file);
}

const contentCache = new Map();
function contentOf(file) {
  if (!contentCache.has(file)) contentCache.set(file, readFileSync(file, "utf8"));
  return contentCache.get(file);
}

// Une section citée existe si un titre la contient (le titre peut être
// plus long : « Séquences : wait — pas un effet » pour une citation
// "Séquences : wait").
// Un paragraphe qui s'ouvre en gras (« **Parsing TOTAL** : ... ») sert
// aussi d'ancre.
function hasSection(file, title) {
  const wanted = title.replace(/[`"]/g, "").trim();
  if (headingsOf(file).some((heading) => heading.includes(wanted))) return true;
  return contentOf(file).replace(/[`"]/g, "").includes(`**${wanted}`);
}

const isFile = (path) => existsSync(path) && statSync(path).isFile();
const PROJECT_ROOT = ROOT.replace(/[\\/]$/, "");

// Fichiers du projet par NOM (sans dossier), pour une citation qui ne donne
// que le nom : "main-menu.js" depuis un fichier voisin, ou un nom unique
// dans le projet.
let filesByName = null;
function projectFilesNamed(name) {
  if (!filesByName) {
    filesByName = new Map();
    for (const file of listFiles(ROOT, () => true)) {
      const base = file.slice(file.lastIndexOf(sep) + 1);
      if (!filesByName.has(base)) filesByName.set(base, []);
      filesByName.get(base).push(file);
    }
  }
  return filesByName.get(name) ?? [];
}

// Le fichier du projet dont le chemin finit par `cited` ("behaviors/
// wander.js" -> core/behaviors/wander.js), ou null.
function projectFileEndingWith(cited) {
  const segments = cited.split("/");
  const name = segments[segments.length - 1];
  for (let start = 0; start < segments.length; start++) {
    const suffix = sep + segments.slice(start).join(sep);
    const found = projectFilesNamed(name).find((file) => file.endsWith(suffix));
    if (found) return found;
  }
  return null;
}

// Fichier désigné par une citation, depuis le fichier `source` qui la porte :
//   - "./<fichier>", "../<fichier>" : relatif au fichier qui cite ;
//   - "<dossier>/<fichier>" : depuis la racine, sinon depuis le fichier qui
//     cite, sinon le fichier du projet dont le chemin finit ainsi ;
//   - "<fichier>" seul : à côté du fichier qui cite, sinon un fichier de ce
//     nom dans le projet.
// Rend le chemin, null s'il n'existe pas, undefined s'il sort du projet.
function resolveCitation(cited, source) {
  const here = dirname(source);
  if (cited.startsWith(".")) {
    const target = resolve(here, cited);
    if (!target.startsWith(PROJECT_ROOT + sep)) return undefined;
    return isFile(target) ? target : null;
  }
  if (cited.includes("/")) {
    for (const base of [ROOT, here]) {
      const target = resolve(base, cited);
      if (isFile(target)) return target;
    }
    return projectFileEndingWith(cited);
  }
  const sibling = resolve(here, cited);
  if (isFile(sibling)) return sibling;
  const named = projectFilesNamed(cited);
  return named.length === 1 ? named[0] : named.length > 1 ? named[0] : null;
}

export function auditDocs() {
  const sources = [
    ...listFiles(join(ROOT, "doc"), (name) => name.endsWith(".md")),
    join(ROOT, "CLAUDE.md"),
    ...listFiles(ROOT, (name) => name.endsWith(".js")),
  ];
  const problems = [];
  for (const source of sources) {
    const where = relative(ROOT, source);
    let previous = "";
    for (const { line, text } of citedText(source)) {
      const continuesCutName = previous.trimEnd().endsWith("-");
      previous = text;
      for (const match of text.matchAll(CITATION)) {
        if (continuesCutName && text.slice(0, match.index).trim() === "") continue;
        const [, cited, identifier, section] = match;
        if (cited.startsWith("assets/") || text.includes("://")) continue;
        // Un MOTIF (un nom de domaine entre chevrons devant ".check.js",
        // une étoile devant "-values.js", des points de suspension) ou un
        // nom coupé par un retour à la ligne (voir continuesCutName) : pas
        // une citation de fichier.
        const before = text[match.index - 1];
        if (before !== undefined && "<>*{}-".includes(before)) continue;
        if (/^\.(?!\.?\/)/.test(cited) || cited.startsWith("-")) continue;
        const target = resolveCitation(cited, source);
        if (target === undefined) continue; // hors du projet : un exemple, pas un fichier
        if (target === null) {
          problems.push({ where: `${where}:${line}`, kind: "fichier introuvable", detail: cited });
          continue;
        }
        if (identifier && /\.(js|py)$/.test(target) && !new RegExp(String.raw`(?<![\w$])${identifier.replace(/\$/g, "\\$")}(?![\w$])`).test(contentOf(target))) {
          problems.push({ where: `${where}:${line}`, kind: "identifiant absent du fichier", detail: `${cited}/${identifier}` });
        }
        if (section && target.endsWith(".md") && !hasSection(target, section)) {
          problems.push({ where: `${where}:${line}`, kind: "section introuvable", detail: `${cited}/"${section}"` });
        }
      }
    }
  }
  return { problems, sources: sources.length };
}

// Lancé directement (node tools/doc-audit.js) : rapport et code de sortie.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { problems, sources } = auditDocs();
  for (const { where, kind, detail } of problems) console.log(`${where} — ${kind} : ${detail}`);
  console.log(
    problems.length === 0
      ? `Audit de la doc : aucun problème (${sources} fichiers lus).`
      : `Audit de la doc : ${problems.length} problème(s) sur ${sources} fichiers lus.`
  );
  process.exitCode = problems.length === 0 ? 0 : 1;
}
