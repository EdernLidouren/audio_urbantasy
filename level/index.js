// Registre id -> chemin de fichier de niveau. Donnée neutre, aucun import :
// consultée par level/load.js pour charger un niveau PAR ID (ex. target
// d'une porte, voir level/schema.md), plutôt que par chemin explicite.

export default {
  demo: "level/demo.json",
  demo2: "level/demo2.json",
  demo3: "level/demo3.json",
  town_square: "level/town-square.json",
  town_square_town_hall_main: "level/town-square-town-hall-main.json",
  town_square_town_hall_mayor_office: "level/town-square-town-hall-mayor-office.json",
  clock_tower_main: "level/clock-tower-main.json",
  clock_tower_weight_shaft: "level/clock-tower-weight-shaft.json",
  clock_tower_weight_shaft_mirror_space: "level/clock-tower-weight-shaft-mirror-space.json",
};
