// Archétype "cumuloLupus" — entité SURNATURELLE (voir core/presence.js/
// "perceptionActive", entities/types/ghost.js pour le même patron) : un
// loup de brume, errant. VOCAL SEUL, aucun beacon (comme hound.js) — on ne
// le localise pas, on l'entend passer. sounds.movement (comme dog.js) :
// pas de fumée, cadencé par la distance parcourue, dormant tant que
// l'instance n'a pas de behavior. Aucun `behavior` par défaut ici,
// volontairement (voir dog.js) : se déclare à l'INSTANCE (level/*.json).
// Donnée pure : aucun import.
export default {
  label: "entity.cumulo_lupus",
  descriptionKey: "entity.cumulo_lupus.description",
  sounds: {
    vocal: { path: "assets/sounds/entities/spectral_wolf_vocal", loop: false, pitchVariation: 0.15 },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
  presence: [{ when: { type: "perceptionActive" }, present: true }],
};
