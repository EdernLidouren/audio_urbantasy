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
//   - ZONE RÉELLE : { sceneId, nameKey, descriptionKey, spawnX } — sceneId
//     référence scenes/index.js (chargeable via scenes/load.js) ; nameKey/
//     descriptionKey sont des CLÉS i18n, jamais des chaînes déjà résolues
//     (même convention que entities/types/*.js) ; spawnX est le point de
//     TÉLÉPORTATION PAR DÉFAUT de cette case — pas forcément le
//     playerStart de la scène (une même zone pourrait un jour avoir plusieurs
//     entrées ; playerStart reste réservé à l'arrivée PAR PORTE).
//     `onMapWhen` (optionnel) : une CONDITION du script (même format que
//     partout, voir doc/scripting.md/"Conditions") qui décide si la zone
//     figure sur le plan du joueur. Absente -> toujours sur le plan.
//     Fausse -> zone HORS PLAN : nom et description remplacés par "Hors
//     plan", jamais sélectionnable (voir view/menus/city-map-menu.js). Le
//     joueur peut pourtant s'y trouver, arrivé par une porte : la carte
//     l'y situe, sans la révéler.
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

// La grand-place, au centre de la carte, à son point de départ habituel
// (playerStart de scenes/town-square.json).
const TOWN_SQUARE_ZONE = {
  sceneId: "town_square",
  nameKey: "scene.town_square.name",
  descriptionKey: "cityMap.town_square.description",
  spawnX: 26,
};

// La rue commerçante, à gauche de la grand-place, à son point de départ
// habituel (playerStart de scenes/main-street.json).
const MAIN_STREET_ZONE = {
  sceneId: "main_street",
  nameKey: "scene.main_street.name",
  descriptionKey: "cityMap.main_street.description",
  spawnX: 25,
};

// Grille littérale, lisible d'un coup d'œil (une ligne de source = une
// ligne de la carte, jamais générée par boucle) : la grand-place au centre
// (x:2, y:2), la rue commerçante à sa gauche (x:1, y:2) ; tout le reste en
// chantier. La scène de démo (scène de test, lancée par « Ville test ») n'y
// figure plus.
export const CITY_MAP_GRID = [
  [UNDER_CONSTRUCTION, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION],
  [UNDER_CONSTRUCTION, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION],
  [UNDER_CONSTRUCTION, MAIN_STREET_ZONE, TOWN_SQUARE_ZONE, UNDER_CONSTRUCTION, UNDER_CONSTRUCTION],
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
  return Boolean(cell) && cell.sceneId !== undefined;
}

export function isCityMapUnderConstruction(cell) {
  return Boolean(cell) && cell.underConstruction === true;
}

// Coordonnées de la case dont `sceneId` correspond, ou `null` si cette scène
// n'est pas (encore) représenté sur la carte — filet, jamais une exception :
// une scène hors carte ne doit pas empêcher d'ouvrir le menu (voir
// view/menus/city-map-menu.js, repli sur (0,0) dans ce cas).
export function findCityMapCoordinates(sceneId) {
  for (let y = 0; y < CITY_MAP_GRID.length; y++) {
    for (let x = 0; x < CITY_MAP_GRID[y].length; x++) {
      const cell = CITY_MAP_GRID[y][x];
      if (isRealCityMapZone(cell) && cell.sceneId === sceneId) return { x, y };
    }
  }
  return null;
}
