// Registre id -> chemin de fichier de scène. Donnée neutre, aucun import :
// consultée par scenes/load.js pour charger une scène PAR ID (ex. target
// d'une porte, voir doc/scene-format.md), plutôt que par chemin explicite.

export default {
  demo: "scenes/demo.json",
  demo2: "scenes/demo2.json",
  demo3: "scenes/demo3.json",
  town_square: "scenes/town-square.json",
  main_street: "scenes/main-street.json",
  town_square_town_hall_main: "scenes/town-square-town-hall-main.json",
  town_square_town_hall_mayor_office: "scenes/town-square-town-hall-mayor-office.json",
  town_square_town_hall_meeting_room: "scenes/town-square-town-hall-meeting-room.json",
  town_square_town_hall_storeroom: "scenes/town-square-town-hall-storeroom.json",
  clock_tower_main: "scenes/clock-tower-main.json",
  clock_tower_weight_shaft: "scenes/clock-tower-weight-shaft.json",
  clock_tower_weight_shaft_mirror_side: "scenes/clock-tower-weight-shaft-mirror-side.json",
};

// Scènes PRINCIPALES : les grandes zones de la ville, celles que pointent
// les cases de la carte (map/city-map.js). Toute autre scène est une
// SOUS-SCÈNE (un intérieur, un étage, l'envers d'un lieu). Déclarées à la
// main, jamais déduites ; ici plutôt que dans le fichier de chaque scène,
// parce qu'une sauvegarde fige un monde à sa première visite (doc/save.md) :
// un drapeau recopié dans le monde ne suivrait jamais un changement d'avis.
// Vérifié par l'audit du contenu (tools/content-audit.js) : chaque id
// existe ci-dessus, chaque case de la carte pointe vers l'une d'elles, et
// une action "confirm" ne relie que deux d'entre elles. La démo en fait
// partie (scène de test, lancée par « Ville test ») : ses sous-scènes s'y
// rattachent, même si elle ne figure plus sur la carte.
export const MAIN_SCENE_IDS = ["town_square", "main_street", "demo"];

// Rattachement de chaque SOUS-SCÈNE à sa scène principale : celle où elle se
// trouve géographiquement, pas celle d'où l'on vient (un lieu à deux
// entrées garde un seul quartier). La carte s'ouvre sur la case de cette
// scène principale (view/menus/city-map-menu.js) : depuis le fond du
// clocher, resélectionner sa case ramène sur la grand-place, un retour
// propre qui ne laisse jamais le joueur perdu. Vérifié par l'audit du
// contenu : toute scène est soit principale, soit rattachée ici à une
// scène principale, jamais les deux ni aucune.
export const MAIN_SCENE_OF = {
  demo2: "demo",
  demo3: "demo",
  town_square_town_hall_main: "town_square",
  town_square_town_hall_mayor_office: "town_square",
  town_square_town_hall_meeting_room: "town_square",
  town_square_town_hall_storeroom: "town_square",
  clock_tower_main: "town_square",
  clock_tower_weight_shaft: "town_square",
  clock_tower_weight_shaft_mirror_side: "town_square",
};
