// Archétype "office_chair" — chaise de bureau (voir
// scenes/town-square-town-hall-mayor-office.json). Mobilier observable, jamais
// interactif, même preset que chair.js avec son propre beacon.
export default {
  nameKey: "entity.office_chair.name",
  descriptionKey: "entity.office_chair.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/office_chair_1_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
