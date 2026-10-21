// Archétype "object" — voir entities/types/index.js pour le registre complet
// et doc/entity-model.md pour le vocabulaire du modèle d'entité. Donnée pure :
// aucun import.

export default {
  nameKey: "entity.object.name",
  descriptionKey: "entity.object.description",
  sounds: {
    beacon: { path: "assets/sounds/items/box_of_nails_beacon_1.mp3", loop: true },
  },
  blocksMovement: false,
  observable: true,
  // interactable:true (la description elle-même dit "semble fouillable",
  // voir i18n) : candidat à Entrée. Aucune action déclarée ici : une
  // instance qui veut un effet concret (fouille, ramassage...) déclare la
  // sienne (voir doc/scripting.md/"Actions").
  interactable: true,
  // Surlignage audio de proximité (voir doc/entity-model.md) : un objet à
  // fouiller se repère nettement une fois à portée.
  highlight: true,
};
