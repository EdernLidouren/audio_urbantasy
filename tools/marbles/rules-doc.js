// BOÎTE À OUTILS DES BILLES — le DOCUMENT DE RÈGLES (doc/marbles-rules.md), tenu à
// jour par le jeu lui-même :
//   - son ANNEXE, la liste des billes de test et de leurs effets, est GÉNÉRÉE depuis
//     la table des billes (marbles/types/), avec les fiches du jeu en français
//     (view/marbles/card.js), entre ses deux marqueurs ; elle ne s'écrit jamais à la
//     main ;
//   - chaque MOT-CLÉ déclaré (core/marbles.js/MARBLE_KEYWORDS) doit y figurer, sous la
//     forme « Nom : description. », sa description étant celle du jeu (les touches E et
//     Maj+E) mot pour mot.
//
//   node tools/marbles/rules-doc.js            -> vérifie (annexe à jour, mots-clés) ;
//                                                 code 1 sinon (tools/verify.js)
//   node tools/marbles/rules-doc.js --write    -> réécrit l'annexe, puis vérifie
//
// Après avoir changé une bille, un mot-clé ou leurs textes : --write, puis relire.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { installFileFetch } from "../node-fetch.js";

installFileFetch();

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DOC = `${ROOT}doc/marbles-rules.md`;
const START = "<!-- annexe des billes : début -->";
const END = "<!-- annexe des billes : fin -->";

const { t, setLocale } = await import("../../data/i18n/index.js");
const { marbleCard } = await import("../../view/marbles/card.js");
const { MARBLE_KEYWORDS } = await import("../../core/marbles.js");
const { GAME_RULES } = await import("./game-rules.js");
const { MARBLE_SIZES } = await import("../../config/marbles-values.js");

setLocale("fr");

// Les espaces insécables des textes français deviennent des espaces : le document
// s'écrit avec des espaces ordinaires.
const plain = (text) => text.replace(/[  ]/g, " ");

// L'annexe : une sous-section par bille, dans l'ordre de la table, sa ligne de liste
// (nom, calibre, usure maximale), puis chaque champ de sa fiche.
function annex() {
  const lines = [];
  for (const marble of Object.keys(GAME_RULES.types)) {
    const name = plain(t(`marble.${marble}.name`));
    const size = t(`marbles.size.${MARBLE_SIZES[GAME_RULES.types[marble].size]}.name`);
    const line = plain(t("marbles.list.line", { name, size, maxWear: GAME_RULES.maxWearOf(marble) }));
    const { above, below } = marbleCard(marble, line, GAME_RULES, t, { timeless: true });
    lines.push(`### ${name}`, "", `${line}.`, "", ...[...above, ...below].map((field) => `- ${plain(field)}`), "");
  }
  return lines.join("\n");
}

// Le document avec son annexe régénérée.
function withAnnex(doc) {
  const start = doc.indexOf(START);
  const end = doc.indexOf(END);
  if (start < 0 || end < start) throw new Error(`document de règles : marqueurs de l'annexe introuvables (${START}, ${END}).`);
  return `${doc.slice(0, start + START.length)}\n\n${annex()}\n${doc.slice(end)}`;
}

// Les fautes du document : annexe périmée, mot-clé absent ou description différente.
function problems(doc) {
  const found = [];
  if (withAnnex(doc) !== doc) found.push("annexe périmée : lancer node tools/marbles/rules-doc.js --write");
  const text = plain(doc);
  for (const keyword of MARBLE_KEYWORDS) {
    const expected = `${plain(t(keyword.texts.name))} : ${plain(t(keyword.texts.description))}`;
    if (!text.includes(expected)) found.push(`mot-clé absent ou différent : « ${expected} »`);
  }
  return found;
}

let doc = await readFile(DOC, "utf-8");
if (process.argv.includes("--write")) {
  doc = withAnnex(doc);
  await writeFile(DOC, doc, "utf-8");
}
const found = problems(doc);
for (const problem of found) console.log(`- ${problem}`);
console.log(
  found.length === 0
    ? `Document de règles : à jour (${Object.keys(GAME_RULES.types).length} billes, ${MARBLE_KEYWORDS.length} mots-clés).`
    : `Document de règles : ${found.length} problème(s).`
);
process.exitCode = found.length === 0 ? 0 : 1;
