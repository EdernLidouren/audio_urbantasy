// BOÎTE À OUTILS DES BILLES — la SORTIE D'UNE FICHE texte (fiche du set, fiche des
// mécaniques), commune à leurs lignes de commande : au terminal, ou dans un fichier
// (`--out <fichier>`) qu'elle n'écrase qu'avec `--force`.
//   code 0 : écrite ; code 1 : le fichier existe déjà ; code 2 : option inconnue.

import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "./args.js";

// `label` : le nom de la fiche dans les messages (« Fiche du set ») ; `build` : sa
// construction, appelée seulement si les options sont bonnes.
export async function outputSheet(label, build, argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv, { values: ["--out"], flags: ["--force"] });
  } catch (error) {
    console.error(`${label} : ${error.message}`);
    process.exit(2);
  }
  const sheet = build();
  const out = args.option("--out");
  if (out === undefined) {
    process.stdout.write(sheet);
  } else if (existsSync(out) && !args.flag("--force")) {
    console.error(`${label} : ${out} existe déjà ; --force pour l'écraser.`);
    process.exitCode = 1;
  } else {
    await writeFile(out, sheet, "utf-8");
    console.log(`${label} écrite : ${out}.`);
  }
}
