// Archétype "hound" — voir entities/types/index.js pour le registre complet
// et entities/model.md pour le vocabulaire du modèle d'entité. Donnée pure :
// aucun import.
//
// "Chien décor" : VOCAL SEUL, aucun beacon — délibérément (voir
// entities/model.md, "beacon vs vocal") : on n'a pas besoin de le
// localiser, seulement de l'entendre aboyer occasionnellement en fond,
// donc pas de son de repérage inutile. Pas de movement non plus (immobile,
// jamais de behavior). Cadence du vocal : défaut GLOBAL (aucune surcharge
// ici, contrairement à dog.js) — plus rare/imprévisible qu'un chien
// "important". Aucune compensation de gain : dog_medium_vocal est déjà à
// une amplitude comparable aux autres sons du jeu (contrairement à
// dog_medium_walk, voir dog.js).

export default {
  label: "entity.hound",
  descriptionKey: "entity.hound.description",
  sounds: {
    vocal: { path: "assets/sounds/entities/dog_medium_vocal", loop: false, pitchVariation: 0.15 },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
