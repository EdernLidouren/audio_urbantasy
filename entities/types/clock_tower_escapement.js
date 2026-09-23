// Archétype "clock_tower_escapement" — échappement d'un clocher, le balancier
// qui bat la mesure (voir level/clock-tower-weight-shaft.json). Beacon
// continu, observable, jamais interactif.
export default {
  nameKey: "entity.clock_tower_escapement.name",
  descriptionKey: "entity.clock_tower_escapement.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/clock_4_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
