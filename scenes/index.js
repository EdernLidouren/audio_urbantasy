// Registre id -> chemin de fichier de scène. Donnée neutre, aucun import :
// consultée par scenes/load.js pour charger une scène PAR ID (ex. target
// d'une porte, voir doc/scene-format.md), plutôt que par chemin explicite.

export default {
  demo: "scenes/demo.json",
  demo2: "scenes/demo2.json",
  demo3: "scenes/demo3.json",
  town_square: "scenes/town-square.json",
  town_square_town_hall_main: "scenes/town-square-town-hall-main.json",
  town_square_town_hall_mayor_office: "scenes/town-square-town-hall-mayor-office.json",
  clock_tower_main: "scenes/clock-tower-main.json",
  clock_tower_weight_shaft: "scenes/clock-tower-weight-shaft.json",
  clock_tower_weight_shaft_mirror_space: "scenes/clock-tower-weight-shaft-mirror-space.json",
};
