// BOÎTE À OUTILS DES BILLES — la FICHE DU SET, au terminal : un fichier texte qui liste
// toutes les billes du jeu telles qu'elles sont (noms, familles, rareté, calibre,
// usure, descriptions en français et en anglais, effets tels que la fiche du jeu les
// dit, sacs préfaits), pour travailler le contenu hors du code. Sa construction :
// marbles/tools/set-sheet-builder.js ; sa sortie : marbles/tools/sheet-output.js.
//
//   node marbles/tools/set-sheet.js                           -> la fiche au terminal
//   node marbles/tools/set-sheet.js --out <fichier>           -> l'écrit dans ce
//                                                                fichier ; refuse d'en
//                                                                écraser un
//   node marbles/tools/set-sheet.js --out <fichier> --force   -> l'écrase
//
// Exemple : node marbles/tools/set-sheet.js --out "dev/gameplay/marbles/set de billes 4.txt"

import { installFileFetch } from "../../tools/node-fetch.js";
import { outputSheet } from "./sheet-output.js";

// Les textes du jeu se chargent par fetch : branché sur le disque AVANT d'importer
// les modules qui les lisent.
installFileFetch();
const { buildSetSheet } = await import("./set-sheet-builder.js");

await outputSheet("Fiche du set", () => buildSetSheet());
