// Archétype "magic_mirror" — un miroir vu en perception surnaturelle,
// générique comme mirror.js (textes propres à une instance :
// magic_mirror.<instance>.*) : SURNATUREL, présent EN
// perception seulement, donc exempté de l'étouffement mondain. Point de
// passage vers l'espace miroir : l'action (condition passe-miroir,
// destination, son de passage) est déclarée PAR INSTANCE, elle dépend de
// la scène (voir scenes/clock-tower-weight-shaft.json et
// scenes/clock-tower-weight-shaft-mirror-space.json).
export default {
  nameKey: "magic_mirror.default.name",
  descriptionKey: "magic_mirror.default.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/magic_mirror_1_beacon", loop: true },
  },
  presence: [{ when: { type: "perceptionActive" }, present: true }],
  blocksMovement: false,
  observable: true,
  interactable: true,
};
