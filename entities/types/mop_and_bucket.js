// Archétype "mop_and_bucket" — seau et serpillère (voir
// scenes/town-square-town-hall-storeroom.json). Mobilier observable, jamais
// interactif : un beacon continu, rien d'autre.
export default {
  nameKey: "entity.mop_and_bucket.name",
  descriptionKey: "entity.mop_and_bucket.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/metal_bucket_1_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
