// Archétype "miravi" — oiseau de proie de verre, SURNATUREL (présent en
// perception seulement, comme ghost.js), rencontré côté miroir (voir
// level/clock-tower-weight-shaft-mirror-space.json). Aucun beacon : on
// l'entend crier (vocal) et battre des ailes (movement, cadencé par la
// distance parcourue ; isFlying à l'instance, le sol survolé est ignoré —
// voir doc/entity-model.md/"Surfaces de sol et son de pas"). Aucun
// behavior par défaut : il se déclare à l'instance (voir dog.js).
export default {
  nameKey: "entity.miravi.name",
  descriptionKey: "entity.miravi.description",
  sounds: {
    vocal: {
      path: "assets/sounds/entities/miravi_vocal",
      loop: false,
      vocalInterval: 5000,
      vocalIntervalVariation: 2000,
      pitchVariation: 0.2,
      vocalGain: 2,
    },
    movement: {
      path: "assets/sounds/footsteps/entities/bird_large_fly",
      loop: false,
      movementGain: 2,
    },
  },
  // Profil de hauteur ALLÉGÉ (isFlying, voir config/tuning-values.js) : le
  // passe-haut par défaut (5500 Hz) vide ses cris, dont l'énergie est sous
  // cette fréquence. Surcharge limitée au miravi : les petits oiseaux gardent
  // le profil global.
  flyingHighpassHz: 800,
  flyingVolumeFactor: 1,
  flyingReverbSend: 0.5,
  presence: [{ when: { type: "perceptionActive" }, present: true }],
  blocksMovement: false,
  observable: true,
  interactable: false,
};
