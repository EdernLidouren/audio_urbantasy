// Archétype "large_winding_mechanism" — mécanisme de remontage des
// contrepoids d'un clocher (voir level/clock-tower-weight-shaft.json).
// Beacon continu, observable, jamais interactif.
export default {
  nameKey: "entity.large_winding_mechanism.name",
  descriptionKey: "entity.large_winding_mechanism.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/large_weight_machine_1_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
