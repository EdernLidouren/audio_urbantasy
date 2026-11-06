// Jeu des billes : déplacement du curseur entre la main et le triangle. Pur,
// sans DOM ni son. La géométrie est celle du triangle, la main en dessous :
//
//            pointe
//   base gauche   base droite
//         main (1 à 5)
//
// Haut et bas changent d'étage ; gauche et droite passent d'une base à
// l'autre, ou descendent de la pointe vers la base de ce côté. Dans la main,
// gauche et droite parcourent les billes : c'est l'écran qui s'en charge
// (view/marbles/screen.js), avec le comportement de bordure des menus.

// "lastBase" : la dernière base visitée, pour revenir là où l'on était.
const MOVES = {
  hand: { up: "lastBase" },
  leftBase: { up: "apex", down: "hand", right: "rightBase" },
  rightBase: { up: "apex", down: "hand", left: "leftBase" },
  apex: { down: "lastBase", left: "leftBase", right: "rightBase" },
};

export const INITIAL_CURSOR = { place: "hand", handIndex: 0, lastBase: "leftBase" };

// Le curseur après un pas dans `direction` (up, down, left, right), ou null
// s'il n'y a rien par là.
export function stepCursor(cursor, direction) {
  const target = MOVES[cursor.place][direction];
  if (!target) return null;
  const place = target === "lastBase" ? cursor.lastBase : target;
  const lastBase = place === "leftBase" || place === "rightBase" ? place : cursor.lastBase;
  return { ...cursor, place, lastBase };
}

// La zone d'une place : "hand" ou "triangle". Changer de zone s'annonce.
export function zoneOf(place) {
  return place === "hand" ? "hand" : "triangle";
}
