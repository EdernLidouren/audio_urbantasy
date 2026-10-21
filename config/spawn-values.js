// Tables de DISTRIBUTION de collectibles + constantes du cycle de collecte
// (voir core/distribution.js, core/spawn.js). Donnée pure, ZÉRO import,
// même patron que config/weather-values.js : le moteur ne fait que LIRE.
//
// Une table, DEUX formes :
//   - { <objet du sac (core/items.js/ITEM_REGISTRY)>: <poids> } — le poids
//     est un NOMBRE, ou le NOM d'un niveau de rareté ("rare"), qui vaut le
//     poids de ce niveau (RARITY_LEVELS ci-dessous) ;
//   - { fromTag: <étiquette> } — table DÉDUITE : tous les objets portant
//     cette étiquette (core/tags.js), chacun pondéré par SA rareté
//     (ITEM_REGISTRY.rarity, 1 à 5). Un objet ajouté ou dont la rareté
//     change met la table à jour tout seul.
// Dans une table { objet: poids }, la clé RÉSERVÉE `nothing` est une issue
// "rien" pondérée comme les autres (voir core/distribution.js/NOTHING).
// Poids RELATIFS normalisés au tirage (voir core/weather.js/pickTransition,
// réutilisé tel quel), jamais des pourcentages. Une source (conteneur,
// plage) RÉFÉRENCE une table par son nom ({ table: "default" }), déclare
// la sienne inline ({ items: { ... } }) ou en combine plusieurs
// ({ tables: [{ table | items, weight? }] }) — voir doc/entity-model.md/
// "Collecte".
//
// Validées au chargement (core/distribution.js/validateSpawnTables) :
// chaque objet doit exister dans ITEM_REGISTRY, tout nom de niveau doit
// exister, au moins un poids positif — une table cassée échoue au
// démarrage, jamais un tirage vide en jeu.

// Niveaux de rareté, dans l'ordre : la rareté 1 d'un objet est le premier
// (commun), la 5 le dernier (légendaire). Le poids de chaque niveau sert aux
// tables (voir plus haut). Valeurs de départ, à ajuster à l'usage : un objet
// légendaire sort environ cent fois moins souvent qu'un commun.
export const RARITY_LEVELS = [
  { name: "common", weight: 100 },
  { name: "uncommon", weight: 40 },
  { name: "rare", weight: 15 },
  { name: "epic", weight: 5 },
  { name: "legendary", weight: 1 },
];

export const DEFAULT_SPAWN_TABLE = "default";

export const SPAWN_TABLES = {
  default: { apple: 80, coin: 20 },
  // Tous les composants électroniques (collection "electronics"), chacun
  // selon sa rareté.
  electronics: { fromTag: "electronic" },
};

// Heure de jeu (0-23) du re-garnissage quotidien : un cycle commence à
// CETTE heure chaque jour (voir core/spawn.js/spawnCycleAt).
export const SPAWN_CYCLE_HOUR = 0;

// Nombre de collectibles posés par PLAGE et par cycle, si la plage ne
// déclare pas son propre `count`.
export const SPAWN_RANGE_DEFAULT_COUNT = 3;

// Nombre de TIRAGES par CONTENEUR et par cycle (objets tous lâchés au sol à
// la fouille ; un tirage "nothing" n'en donne aucun), si le conteneur ne
// déclare pas son propre `count`.
export const SPAWN_CONTAINER_DEFAULT_COUNT = 2;
