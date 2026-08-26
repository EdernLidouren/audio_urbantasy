// Archétype "npc" — voir entities/types/index.js pour le registre complet et
// entities/model.md pour le vocabulaire du modèle d'entité. Donnée pure :
// aucun import.

export default {
  label: "entity.npc",
  descriptionKey: "entity.npc.description",
  sounds: {
    beacon: { path: "assets/sounds/entities/npc_beacon_1.mp3", loop: true },
  },
  blocksMovement: false,
  enterable: false,
};
