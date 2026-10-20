// Archétype "office_supply_box" — boîte de fournitures de bureau (voir
// scenes/town-square-town-hall-storeroom.json). Mobilier observable, jamais
// interactif : un beacon continu, rien d'autre.
export default {
  nameKey: "entity.office_supply_box.name",
  descriptionKey: "entity.office_supply_box.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/box_1_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
