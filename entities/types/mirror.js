// Archétype "mirror" — miroir ORDINAIRE, générique : tous les miroirs du
// jeu fonctionnent pareil (premier exemple : scenes/clock-tower-weight-
// shaft.json). Présent HORS perception seulement (condition "not", voir
// doc/scripting.md/"not") : superposé à un miroir magique (magic_mirror.js)
// au même x, qui prend sa place quand la perception s'active. Une instance
// qui a besoin d'un nom ou d'une description propres les déclare sous
// mirror.<instance>.* (même modèle que door.*, voir doc/i18n.md). Mondain : reste soumis à
// l'étouffement de perception. Observable, jamais interactif.
export default {
  nameKey: "mirror.default.name",
  descriptionKey: "mirror.default.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/mirror_1_beacon", loop: true },
  },
  presence: [{ when: { type: "not", condition: { type: "perceptionActive" } }, present: true }],
  blocksMovement: false,
  observable: true,
  interactable: false,
};
