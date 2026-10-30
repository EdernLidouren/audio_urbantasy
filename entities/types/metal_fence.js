// Archétype "metal_fence" — haut grillage métallique. Décor sonore
// observable, jamais interactif. Franchissable par défaut : une instance
// qui doit barrer le chemin le déclare (`"blocksMovement": true`), comme
// au verso des anciennes carrières (scenes/old-quarries.json).
export default {
  nameKey: "entity.metal_fence.name",
  descriptionKey: "entity.metal_fence.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/metal_fence_1_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
