// Archétype "metal_fence" — haut grillage métallique. Décor sonore
// observable, jamais interactif. Franchissable par défaut : une instance
// qui doit barrer le chemin le déclare (`"blocksMovement": true`), comme
// au verso des anciennes carrières (scenes/old-quarries.json). Le son de
// collision ne joue que pour une telle instance (voir entities/types/rock.js).
export default {
  nameKey: "entity.metal_fence.name",
  descriptionKey: "entity.metal_fence.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/metal_fence_1_beacon", loop: true },
  },
  collisionSound: "assets/sounds/effects/metal_fence_collision",
  blocksMovement: false,
  observable: true,
  interactable: false,
};
