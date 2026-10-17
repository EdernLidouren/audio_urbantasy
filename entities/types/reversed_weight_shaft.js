// Archétype "reversed_weight_shaft" — puits inversé, côté miroir (voir
// scenes/clock-tower-weight-shaft-mirror-space.json). Pendant inversé de
// l'entité de même position dans le puits des contrepoids. Beacon continu
// + vocal intermittent de câbles organiques, observable, jamais interactif.
export default {
  nameKey: "entity.reversed_weight_shaft.name",
  descriptionKey: "entity.reversed_weight_shaft.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/reversed_pulley_1_beacon", loop: true },
    // Mêmes réglages que le vocal du puits normal (weight_shaft.js).
    vocal: {
      path: "assets/sounds/decor/organic_rope_1_vocal",
      loop: false,
      vocalInterval: 8000,
      vocalIntervalVariation: 3000,
    },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
