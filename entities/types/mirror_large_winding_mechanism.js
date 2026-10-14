// Archétype "mirror_large_winding_mechanism" — mécanisme d'attraction, côté miroir (voir
// level/clock-tower-weight-shaft-mirror-space.json). Pendant inversé de
// l'entité de même position dans le puits des contrepoids. Beacon continu,
// observable, jamais interactif.
export default {
  nameKey: "entity.mirror_large_winding_mechanism.name",
  descriptionKey: "entity.mirror_large_winding_mechanism.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/reversed_large_weight_machine_1_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
