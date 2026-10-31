// Archétype "metal_sign" — panneau d'avertissement métallique sur pied.
// Décor sonore observable, jamais interactif. Ce qu'il annonce varie par
// panneau : chaque instance donne son texte par sa propre description (ex.
// warning_sign_1_r de scenes/old-quarries.json, devant le chevalement).
export default {
  nameKey: "entity.metal_sign.name",
  descriptionKey: "entity.metal_sign.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/metal_sign_1_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
