// Archétype "memorial_stone" — stèle commémorative de pierre polie. Décor
// sonore observable, jamais interactif. Générique par nature (comme
// statue.js) : chaque stèle PARTICULIÈRE donne son inscription par sa
// propre description d'instance (ex. memorial_stone_1_r de
// scenes/old-quarries.json, en mémoire des disparus des galeries).
export default {
  nameKey: "entity.memorial_stone.name",
  descriptionKey: "entity.memorial_stone.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/stone_slab_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
