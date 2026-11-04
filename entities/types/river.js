
export default {
  nameKey: "entity.river.name",
  descriptionKey: "entity.river.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/river_beacon_1.mp3", loop: true }
  },
  // Joué seulement là où une instance rend la rivière infranchissable
  // (`blocksMovement`, ex. river_1_v de scenes/town-square.json).
  collisionSound: "assets/sounds/effects/water_collision",
  blocksMovement: false,
  observable: true,
  interactable: false,
};
