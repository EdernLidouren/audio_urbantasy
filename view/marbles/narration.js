// Jeu des billes : tout ce qui se DIT, à partir de l'état, du journal
// (core/marbles-content.js, en-tête) et de la prévision (core/marbles-forecast.js).
// Pur : rend du texte, n'annonce rien. `t` est reçu en paramètre, pour que l'écran et
// le kit terminal (tools/marbles/play.js) disent exactement les mêmes phrases.
//
// MODULES (view/marbles/narration/), ce fichier n'étant que leur point d'entrée :
// - effects.js  : le vocabulaire et les effets (noms, compteurs, describeEffect,
//                 describePrinted, outcomeLine), dont les autres sont faits ;
// - focus.js    : les lignes de curseur et d'état (bille, main, emplacement, sac,
//                 pot, défausse, tour) ;
// - forecast.js : la prévision et la confirmation (placementLines, describeOverview) ;
// - journal.js  : le journal en étapes (buildSteps, resolutionSteps) et la question
//                 d'un choix (describeChoicePrompt).
// Les autres modules importent d'ici, jamais des modules eux-mêmes ; les modules de la
// narration s'importent entre eux directement.

export * from "./narration/effects.js";
export * from "./narration/focus.js";
export * from "./narration/forecast.js";
export * from "./narration/journal.js";
