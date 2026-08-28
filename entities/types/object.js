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
  observable: true,
  // interactable:true (anticipe "ramasser"/"fouiller" — la description
  // elle-même dit "semble fouillable", voir i18n) : candidat à entrée dès
  // aujourd'hui, même si l'action reste le stub générique tant que les
  // types d'action ne sont pas différenciés (voir view/interaction.js).
  interactable: true,
};
