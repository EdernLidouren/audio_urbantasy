// BOÎTE À OUTILS DES BILLES — la FICHE DU SET, au terminal : un fichier texte qui liste
// toutes les billes du jeu telles qu'elles sont (noms, familles, rareté, calibre,
// usure, descriptions en français et en anglais, effets tels que la fiche du jeu les
// dit, sacs préfaits), pour travailler le contenu hors du code. Sa construction :
// marbles/tools/set-sheet-builder.js.
//
//   node marbles/tools/set-sheet.js                           -> la fiche au terminal
//   node marbles/tools/set-sheet.js --out <fichier>           -> l'écrit dans ce
//                                                                fichier ; refuse d'en
//                                                                écraser un
//   node marbles/tools/set-sheet.js --out <fichier> --force   -> l'écrase
//
// Exemple : node marbles/tools/set-sheet.js --out "dev/gameplay/marbles/set de billes 4.txt"

import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { installFileFetch } from "../../tools/node-fetch.js";
import { parseArgs } from "./args.js";

// Les textes du jeu se chargent par fetch : branché sur le disque AVANT d'importer
// les modules qui les lisent.
installFileFetch();
const { buildSetSheet } = await import("./set-sheet-builder.js");

let args;
try {
  args = parseArgs(process.argv.slice(2), { values: ["--out"], flags: ["--force"] });
} catch (error) {
  console.error(`Fiche du set : ${error.message}`);
  process.exit(2);
}
const sheet = buildSetSheet();
const out = args.option("--out");
if (out === undefined) {
  process.stdout.write(sheet);
} else if (existsSync(out) && !args.flag("--force")) {
  console.error(`Fiche du set : ${out} existe déjà ; --force pour l'écraser.`);
  process.exitCode = 1;
} else {
  await writeFile(out, sheet, "utf-8");
  console.log(`Fiche du set écrite : ${out}.`);
}
