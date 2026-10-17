// Renommages de contenu à appliquer aux SAUVEGARDES existantes (voir
// core/save.js/migrateSave, doc/save.md). Une sauvegarde garde le monde tel
// qu'il était à la première visite : nom de type, clés i18n et chemins de
// sons y sont figés. Renommer l'un d'eux dans le contenu sans l'ajouter ici
// laisse les anciennes parties pointer vers quelque chose qui n'existe plus.
//
// Donnée pure, aucun import. Chaque table : { ancien: nouveau }. Les
// renommages successifs s'enchaînent (a -> b puis b -> c : une sauvegarde
// qui porte encore `a` reçoit `c`) ; une boucle fait échouer le chargement
// du module (core/save.js), jamais une migration silencieusement fausse.
// Une entrée ne s'enlève jamais : une sauvegarde très ancienne peut encore
// en avoir besoin.

// Valeur du champ `type` des entités (registre entities/types/index.js).
export const RENAMED_ENTITY_TYPES = {
  film_projector: "video_projector",
  office_water_fountain: "office_water_cooler",
};

// Clés i18n (nameKey, descriptionKey, titleKey, clés d'annonce...),
// remplacées partout où elles apparaissent comme valeur exacte.
export const RENAMED_I18N_KEYS = {
  "entity.film_projector.name": "entity.video_projector.name",
  "entity.film_projector.description": "entity.video_projector.description",
  "entity.office_water_fountain.name": "entity.office_water_cooler.name",
  "entity.office_water_fountain.description": "entity.office_water_cooler.description",
  // Vocabulaire unique « scène » (ancien dossier level/).
  "level.clock_tower_main.name": "scene.clock_tower_main.name",
  "level.clock_tower_weight_shaft.name": "scene.clock_tower_weight_shaft.name",
  "level.clock_tower_weight_shaft_mirror_space.name": "scene.clock_tower_weight_shaft_mirror_space.name",
  "level.default.title": "scene.default.name",
  "level.demo.title": "scene.demo.name",
  "level.demo2.name": "scene.demo2.name",
  "level.demo3.name": "scene.demo3.name",
  "level.town_square.name": "scene.town_square.name",
  "level.town_square_town_hall_main.name": "scene.town_square_town_hall_main.name",
  "level.town_square_town_hall_mayor_office.name": "scene.town_square_town_hall_mayor_office.name",
};

// Chemins de sons (pools, sans suffixe de variante — voir assets/manifest.json),
// remplacés partout où ils apparaissent comme valeur exacte.
export const RENAMED_ASSET_PATHS = {
  "assets/sounds/furniture/film_projector_1_beacon": "assets/sounds/furniture/video_projector_1_beacon",
  "assets/sounds/furniture/office_water_fountain_1_beacon": "assets/sounds/furniture/office_water_cooler_1_beacon",
};
