// Archétype "office_table" — table de réunion (voir
// scenes/town-square-town-hall-meeting-room.json). Mobilier observable,
// jamais interactif : un beacon continu, rien d'autre.
export default {
  nameKey: "entity.office_table.name",
  descriptionKey: "entity.office_table.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/table_1_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
