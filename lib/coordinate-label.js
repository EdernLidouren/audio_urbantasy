// Brique portable : traduit des coordonnées de GRILLE (0-indexées, internes)
// en langage humain. Aucune connaissance d'aucun jeu, d'aucune grille
// concrète ni d'aucune préférence utilisateur (reçues en PARAMÈTRE par
// l'appelant, ex. view/menus/city-map-menu.js — jamais lues ici) : dépose
// ce fichier tel quel dans un autre projet.
//
// Convention d'entrée : x/y INTERNES 0-indexés, x = colonne (0 à gauche),
// y = ligne (0 en HAUT, convention écran/tableau standard — voir
// level/city-map.js). Ce module ne fait QUE la PRÉSENTATION :
//   - 1-indexer (0 n'a de sens qu'en informatique) ;
//   - éventuellement alphabétiser x (1=A, 2=B, ..., 26=Z, 27=AA, ...) ;
//   - éventuellement inverser le sens de y.
// Par défaut (aucune option) : (0,0) -> "1 - <hauteur>" (coin HAUT gauche,
// x=1 = colonne la plus à gauche, y compté DEPUIS LE BAS — voir
// formatCoordinateY) ; la case bas-gauche de la grille est donc "1 - 1".

// Alphabet base-26 SANS zéro (numérotation "tableur" : 1=A, 2=B, ..., 26=Z,
// 27=AA, 28=AB, ...) — n : entier >= 1.
export function alphaLabel(n) {
  let label = "";
  let value = n;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

// Coordonnée x affichée : 1-indexée, alphabétisée si `alpha` (voir
// alphaLabel ci-dessus), sinon un nombre tel quel.
export function formatCoordinateX(x, alpha) {
  const oneIndexed = x + 1;
  return alpha ? alphaLabel(oneIndexed) : String(oneIndexed);
}

// Coordonnée y affichée : 1-indexée, DEPUIS LE BAS par défaut (`inverted`
// falsy -> la ligne du BAS de la grille est "1", celle du haut est
// `height`) — c'est ce qui fait que (0,0), la case interne HAUT-gauche, ne
// s'affiche PAS "1 - 1" par défaut : seule la case BAS-gauche l'est.
// `inverted` (vrai) bascule le sens : la ligne du HAUT devient "1", celle
// du bas `height` — "comptée à l'envers" du défaut.
export function formatCoordinateY(y, height, inverted) {
  return String(inverted ? y + 1 : height - y);
}

// "<x> - <y>" — la forme complète ("A - 1" / "1 - 1"), options par nom
// (alphaX/invertY, toutes deux fausses par défaut ici — c'est l'appelant
// qui leur donne leur propre défaut via ses préférences, voir
// config/preferences.js).
export function formatCoordinate(x, y, height, { alphaX = false, invertY = false } = {}) {
  return `${formatCoordinateX(x, alphaX)} - ${formatCoordinateY(y, height, invertY)}`;
}
