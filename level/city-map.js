// Carte de la ville : topologie en GRILLE fixe, déclarée à la main (JAMAIS
// dérivée) — source de vérité UNIQUE de la géographie, consommée par
// view/menus/city-map-menu.js (navigation + sélection) et, plus tard, par
// une éventuelle téléportation de bord de map (pas codée ici). Donnée pure,
// aucun import — même statut que entities/types/*.js.
//
// Grille CITY_MAP_WIDTH × CITY_MAP_HEIGHT, indexée [y][x] (y = ligne, 0 en
// haut ; x = colonne, 0 à gauche) — CITY_MAP_GRID[y][x] est TOUJOURS l'ordre
// d'accès, jamais l'inverse (voir cityMapCellAt ci-dessous, seul point
// d'accès recommandé). Chaque case a l'une de TROIS natures, jamais
// confondues (voir isRealCityMapZone/isCityMapUnderConstruction) :
//   - ZONE RÉELLE : { levelId, nameKey, descriptionKey, spawnX } — levelId
//     référence level/index.js (chargeable via level/load.js) ; nameKey/
//     descriptionKey sont des CLÉS i18n, jamais des chaînes déjà résolues
//     (même convention que entities/types/*.js) ; spawnX est le point de
//     TÉLÉPORTATION PAR DÉFAUT de cette case — pas forcément le
//     playerStart du niveau (une même zone pourrait un jour avoir plusieurs
//     entrées ; playerStart reste réservé à l'arrivée PAR PORTE).
//   - EN CHANTIER : le marqueur UNDER_CONSTRUCTION ci-dessous — case connue
//     de la topologie, pas encore reliée à un contenu réel, JAMAIS
//     sélectionnable.
//   - VIDE : `null` — aucune case à cet endroit, jamais rien à annoncer de
//     plus qu'un "vide" neutre, jamais sélectionnable.

export const CITY_MAP_WIDTH = 5;
export const CITY_MAP_HEIGHT = 5;

// Partagé (une seule instance, jamais recréée par case) : une case "en
// chantier" ne porte aucune donnée propre, comparer par IDENTITÉ suffit
// (voir isCityMapUnderConstruction) — pas un nouvel objet par case.
const UNDER_CONSTRUCTION = { underConstruction: true };

// Seule case réelle du test : reliée à "demo" (l'ancienne scène de départ,
// avant town_square — voir main.js/startTestCityGame), au point d'entrée
// déjà existant (playerStart de level/demo.json).
const DEMO_ZONE = { levelId: "demo", nameKey: "level.demo.title", descriptionKey: "cityMap.demo.description", spawnX: 2 };

// Grille littérale, lisible d'un coup d'œil (une ligne de source = une
// ligne de la carte, jamais générée par boucle) — TEST : une seule zone
// réelle en (x:1, y:2), juste à gauche du centre (2,2) ; tout le reste en
// chantier (voir le prompt d'origine, "CARTE DE LA VILLE").
export const CITY_MAP_GRID = [
  [UNDER_CONSTRUCTION, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION],
  [UNDER_CONSTRUCTION, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION],
  [UNDER_CONSTRUCTION, DEMO_ZONE, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION],
  [UNDER_CONSTRUCTION, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION],
  [UNDER_CONSTRUCTION, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION],
];

// Case à (x, y), ou `undefined` hors grille (jamais d'exception) — filet
// défensif pour un appelant qui bornerait mal son curseur ; le menu-carte
// borne déjà le sien (voir view/menus/city-map-menu.js), ce filet ne
// devrait donc jamais être exercé en jeu normal.
export function cityMapCellAt(x, y) {
  const row = CITY_MAP_GRID[y];
  return row ? row[x] : undefined;
}

export function isRealCityMapZone(cell) {
  return Boolean(cell) && cell.levelId !== undefined;
}

export function isCityMapUnderConstruction(cell) {
  return Boolean(cell) && cell.underConstruction === true;
}

// Coordonnées de la case dont `levelId` correspond, ou `null` si ce lieu
// n'est pas (encore) représenté sur la carte — filet, jamais une exception :
// un lieu hors carte ne doit pas empêcher d'ouvrir le menu (voir
// view/menus/city-map-menu.js, repli sur (0,0) dans ce cas).
export function findCityMapCoordinates(levelId) {
  for (let y = 0; y < CITY_MAP_GRID.length; y++) {
    for (let x = 0; x < CITY_MAP_GRID[y].length; x++) {
      const cell = CITY_MAP_GRID[y][x];
      if (isRealCityMapZone(cell) && cell.levelId === levelId) return { x, y };
    }
  }
  return null;
}
