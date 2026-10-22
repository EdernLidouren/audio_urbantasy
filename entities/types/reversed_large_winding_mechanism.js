// Archétype "reversed_large_winding_mechanism" — mécanisme d'attraction, côté miroir (voir
// scenes/clock-tower-weight-shaft-mirror-side.json). Pendant inversé de
// l'entité de même position dans le puits des contrepoids. Beacon continu,
// observable, jamais interactif.
export default {
  nameKey: "entity.reversed_large_winding_mechanism.name",
  descriptionKey: "entity.reversed_large_winding_mechanism.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/reversed_large_weight_machine_1_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
