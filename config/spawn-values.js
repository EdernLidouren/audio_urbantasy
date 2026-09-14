// Tables de DISTRIBUTION de collectibles + constantes du cycle de collecte
// (voir core/distribution.js, core/spawn.js). Donnée pure, ZÉRO import,
// même patron que config/weather-values.js : le moteur ne fait que LIRE.
//
// Une table = { <objet du sac (core/items.js/ITEM_REGISTRY)>: <poids> } —
// poids RELATIFS normalisés au tirage (voir core/weather.js/pickTransition,
// réutilisé tel quel), jamais des pourcentages. Une source (conteneur,
// plage) RÉFÉRENCE une table par son nom ({ table: "default" }) ou déclare
// la sienne inline ({ items: { ... } }) — voir doc/entity-model.md/
// "Collecte".
//
// Validées au chargement (core/distribution.js/validateSpawnTables) :
// chaque objet doit exister dans ITEM_REGISTRY, au moins un poids positif —
// une table cassée échoue au démarrage, jamais un tirage vide en jeu.

export const DEFAULT_SPAWN_TABLE = "default";

export const SPAWN_TABLES = {
  default: { apple: 80, coin: 20 },
};

// Heure de jeu (0-23) du re-garnissage quotidien : un cycle commence à
// CETTE heure chaque jour (voir core/spawn.js/spawnCycleAt).
export const SPAWN_CYCLE_HOUR = 0;

// Nombre de collectibles posés par PLAGE et par cycle, si la plage ne
// déclare pas son propre `count`.
export const SPAWN_RANGE_DEFAULT_COUNT = 3;

// Nombre d'objets stockés par CONTENEUR et par cycle (tous lâchés au sol à
// la fouille), si le conteneur ne déclare pas son propre `count`.
export const SPAWN_CONTAINER_DEFAULT_COUNT = 2;
