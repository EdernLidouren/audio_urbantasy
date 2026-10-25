// Archétype "motorised_billboard" — panneau publicitaire à lames rotatives.
// Son message change à chaque heure de jeu, pioché dans la série
// "billboard_ads" (rotations/, voir doc/entity-model.md/"Messages en
// rotation") et lu dans sa description par {message}. VOCAL SEUL, aucun
// beacon : le moteur des lames tourne à intervalle fixe (10 s, aucune
// variation), assez régulier pour qu'on le repère à l'oreille, varié en
// hauteur pour ne pas sonner comme une boucle.
export default {
  nameKey: "entity.motorised_billboard.name",
  descriptionKey: "entity.motorised_billboard.description",
  messageRotation: "billboard_ads",
  sounds: {
    vocal: {
      path: "assets/sounds/decor/motorised_sign_1_vocal",
      loop: false,
      vocalInterval: 10000,
      vocalIntervalVariation: 0,
      pitchVariation: 0.2,
    },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
