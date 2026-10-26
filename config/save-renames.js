// Renommages de contenu à appliquer aux SAUVEGARDES existantes (voir
// core/save.js/migrateSave, doc/save.md). Une sauvegarde garde le monde tel
// qu'il était à la première visite : nom de type, clés i18n, chemins de
// sons et ids de scènes y sont figés. Renommer l'un d'eux dans le contenu sans l'ajouter ici
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
  // Familles i18n : miroirs génériques, entités inversées.
  clock_tower_mirror: "mirror",
  clock_tower_magic_mirror: "magic_mirror",
  mirror_weight_shaft: "reversed_weight_shaft",
  mirror_large_winding_mechanism: "reversed_large_winding_mechanism",
  mirror_clock_tower_escapement: "reversed_clock_tower_escapement",
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
  // Familles i18n : passage.*, mirror.*, magic_mirror.*, entités inversées.
  "entity.clock_tower_mirror.name": "mirror.default.name",
  "entity.clock_tower_mirror.description": "mirror.default.description",
  "door.clock_tower_magic_mirror.name": "magic_mirror.default.name",
  "door.clock_tower_magic_mirror.description": "magic_mirror.default.description",
  "door.clock_tower_magic_mirror.pass_refusal": "magic_mirror.default.pass_refusal",
  "entity.mirror_weight_shaft.name": "entity.reversed_weight_shaft.name",
  "entity.mirror_weight_shaft.description": "entity.reversed_weight_shaft.description",
  "entity.mirror_large_winding_mechanism.name": "entity.reversed_large_winding_mechanism.name",
  "entity.mirror_large_winding_mechanism.description": "entity.reversed_large_winding_mechanism.description",
  "entity.mirror_clock_tower_escapement.name": "entity.reversed_clock_tower_escapement.name",
  "entity.mirror_clock_tower_escapement.description": "entity.reversed_clock_tower_escapement.description",
  "entity.passage.name": "passage.default.name",
  "entity.passage.description": "passage.default.description",
  "door.default_passage.name": "passage.default.name",
  "door.town_hall_passage.description": "passage.town_hall.description",
  "door.clocktower_passage.description": "passage.clock_tower.description",
  // Les passages de Main Street ne s'appellent plus « trottoir » : le nom
  // ordinaire « passage » dit qu'on peut l'emprunter.
  "passage.sidewalk.name": "passage.default.name",
  // Objets : nom en feuille `.name` sous le namespace de l'objet, comme sa
  // description (voir doc/i18n.md) — figé dans un objet posé au sol.
  "item.combat_boots": "item.combat_boots.name",
  "item.high_heels": "item.high_heels.name",
  "item.key_bronze": "item.key_bronze.name",
  "item.leather_boots": "item.leather_boots.name",
  "item.sneakers": "item.sneakers.name",
  // « côté miroir » plutôt que « espace miroir » (voir RENAMED_SCENE_IDS).
  "scene.clock_tower_weight_shaft_mirror_space.name": "scene.clock_tower_weight_shaft_mirror_side.name",
};

// Chemins de sons (pools, sans suffixe de variante — voir assets/manifest.json),
// remplacés partout où ils apparaissent comme valeur exacte.
export const RENAMED_ASSET_PATHS = {
  "assets/sounds/furniture/film_projector_1_beacon": "assets/sounds/furniture/video_projector_1_beacon",
  "assets/sounds/furniture/office_water_fountain_1_beacon": "assets/sounds/furniture/office_water_cooler_1_beacon",
  "assets/sounds/doors/passage_wind_beacon": "assets/sounds/doors/passage_outdoor_1_beacon",
  "assets/sounds/doors/passage_indoor_beacon": "assets/sounds/doors/passage_indoor_1_beacon",
  "assets/sounds/decor/traffic_signal_relay": "assets/sounds/decor/traffic_signal_relay_1_beacon",
};

// Ids de scène (scenes/index.js) : la clé du monde dans la partie
// (session.worlds), le monde actif (activeWorldId), et toute valeur exacte
// qui cite la scène (cible d'un "teleport", id recopié dans le monde).
export const RENAMED_SCENE_IDS = {
  clock_tower_weight_shaft_mirror_space: "clock_tower_weight_shaft_mirror_side",
};
