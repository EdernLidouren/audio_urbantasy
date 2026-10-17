// Archétype "mirror_clock_tower_escapement" — anti-échappement, côté miroir (voir
// scenes/clock-tower-weight-shaft-mirror-space.json). Pendant inversé de
// l'entité de même position dans le puits des contrepoids. Beacon continu,
// observable, jamais interactif.
export default {
  nameKey: "entity.mirror_clock_tower_escapement.name",
  descriptionKey: "entity.mirror_clock_tower_escapement.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/reversed_clock_4_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
