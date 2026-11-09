// BOÎTE À OUTILS DES BILLES — la VALEUR D'UNE BILLE GAGNÉE EN MAIN pour le joueur
// glouton (tools/marbles/players.js), en points d'Impact. Le glouton ne voit que
// l'Impact du tour : sans elle, une bille qui pioche ne vaudrait rien pour lui. Il
// ajoute cette valeur à l'Impact prévu pour chaque bille que son plan piocherait.
//
// Calculée sur le rapport glouton de RÉFÉRENCE (avant la Pioche : sac de test,
// 1 000 parties, graine 1) : score moyen 164,825 pour 13 billes piochées par
// partie (5 au premier tour, puis 1 à chacun des 8 suivants), soit 164,825 / 13 =
// 12,68 points par bille. Une mesure, pas une règle : le simulateur la surcharge
// par --drawn-value.
export const MARBLES_DRAWN_VALUE = 12.68;
