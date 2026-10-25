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
// partie : c'est une case de la carte, même hors plan.
export const MAIN_SCENE_IDS = ["town_square", "main_street", "demo"];
