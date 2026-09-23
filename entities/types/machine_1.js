// Archétype "machine_1" — installation électrique d'intérieur (voir
// level/clock-tower-main.json). VOCAL SEUL, aucun beacon (comme hound.js) :
// on ne la localise pas en continu, on l'entend rugir par intermittence.
// Observable, jamais interactive.
export default {
  nameKey: "entity.machine_1.name",
  descriptionKey: "entity.machine_1.description",
  sounds: {
    vocal: {
      path: "assets/sounds/decor/machine_1_vocal",
      loop: false,
      vocalInterval: 15000,
      vocalIntervalVariation: 3000,
    },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
