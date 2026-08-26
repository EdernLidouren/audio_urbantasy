// Archétype "object" — voir entities/types/index.js pour le registre complet
// et entities/model.md pour le vocabulaire du modèle d'entité. Donnée pure :
// aucun import.

export default {
  label: "entity.object",
  descriptionKey: "entity.object.description",
  sounds: {
    beacon: { path: "assets/sounds/entities/box_of_nails_beacon_1.mp3", loop: true },
  },
  blocksMovement: false,
  enterable: false,
};
