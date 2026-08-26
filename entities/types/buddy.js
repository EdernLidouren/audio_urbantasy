// Archétype "buddy" — le compagnon de test prédéfini (voir
// core/state.js/createTestCompanion). Distinct de "dog" (dog.js) :
// label partagé ("Chien"), mais son PROPRE beacon — npc_beacon plutôt que
// le placeholder générique — pour le suivre facilement à l'oreille pendant
// qu'il apprend à suivre le joueur (voir core/behaviors/follow.js). vocal
// et movement repris tels quels de dog.js (même famille de son).

export default {
  label: "entity.dog",
  descriptionKey: "entity.buddy.description",
  sounds: {
    beacon: { path: "assets/sounds/entities/npc_beacon_1.mp3", loop: true },
    vocal: {
      path: "assets/sounds/entities/dog_medium_vocal",
      loop: false,
      vocalInterval: 6000,
      vocalIntervalVariation: 2000,
      pitchVariation: 0.15,
    },
    movement: {
      path: "assets/sounds/footsteps/dog_medium_walk",
      loop: false,
      pitchVariation: 0.08,
      // movementGain:10 : voir dog.js, même fichier source, même écart
      // d'amplitude mesuré.
      movementGain: 10,
    },
  },
  blocksMovement: false,
  enterable: false,
};
