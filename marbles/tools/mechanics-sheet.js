// BOÎTE À OUTILS DES BILLES — la FICHE DES MÉCANIQUES, au terminal : un fichier texte
// qui recense ce avec quoi une bille peut s'écrire (vocabulaire, mots-clés,
// conditions, montants calculés, filtres, cibles, évènements et valeurs de partie,
// statuts, définitions de partie), avec les billes du set qui s'en servent, pour
// concevoir le contenu hors du code. Sa construction :
// marbles/tools/mechanics-sheet-builder.js ; sa sortie : marbles/tools/sheet-output.js.
//
//   node marbles/tools/mechanics-sheet.js                           -> au terminal
//   node marbles/tools/mechanics-sheet.js --out <fichier>           -> l'écrit dans ce
//                                                                      fichier ; refuse
//                                                                      d'en écraser un
//   node marbles/tools/mechanics-sheet.js --out <fichier> --force   -> l'écrase
//
// Exemple : node marbles/tools/mechanics-sheet.js --out "dev/gameplay/marbles/mécaniques.txt"

import { installFileFetch } from "../../tools/node-fetch.js";
import { outputSheet } from "./sheet-output.js";

// Les textes du jeu se chargent par fetch : branché sur le disque AVANT d'importer
// les modules qui les lisent.
installFileFetch();
const { buildMechanicsSheet } = await import("./mechanics-sheet-builder.js");

await outputSheet("Fiche des mécaniques", () => buildMechanicsSheet());
