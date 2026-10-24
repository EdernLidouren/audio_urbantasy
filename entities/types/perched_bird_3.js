// Archétype "perched_bird_3" — même oiseau posé et farouche que
// perched_bird_1.js (voir son en-tête), avec la voix de bird_3.
export default {
  nameKey: "entity.perched_bird.name",
  descriptionKey: "entity.perched_bird.description",
  sounds: {
    vocal: {
      path: "assets/sounds/entities/bird_3_vocal",
      loop: false,
      vocalInterval: 2500,
      vocalIntervalVariation: 1200,
      pitchVariation: 0.12,
    },
    exitSound: { path: "assets/sounds/entities/bird_taking_off_fly" },
  },
  startle: {},
  action: { kind: "applyEffects", effects: [{ type: "startle" }] },
  blocksMovement: false,
  observable: true,
  interactable: true,
};
