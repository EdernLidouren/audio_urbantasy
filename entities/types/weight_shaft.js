// Archétype "weight_shaft" — puits des contrepoids d'un clocher (voir
// level/clock-tower-weight-shaft.json). Beacon continu de poulie + vocal
// intermittent de câble (comme un PNJ : localisation ET expression).
// Observable, jamais interactif.
export default {
  nameKey: "entity.weight_shaft.name",
  descriptionKey: "entity.weight_shaft.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/pulley_1_beacon", loop: true },
    vocal: {
      path: "assets/sounds/decor/rope_1_vocal",
      loop: false,
      vocalInterval: 8000,
      vocalIntervalVariation: 3000,
    },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
