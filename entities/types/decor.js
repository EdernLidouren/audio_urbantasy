// Archétype "decor" — voir entities/types/index.js pour le registre complet
// et entities/model.md pour le vocabulaire du modèle d'entité. Donnée pure :
// aucun import.
//
// Preset d'exemple, non utilisé dans demo.json : positionné et purement
// décoratif. Aucune interaction (ni observable, ni interactable, pas de
// descriptionKey) — exemple de référence des QUATRE combinaisons valides du
// système d'interaction niveau 0 (voir view/interaction.js,
// entities/model.md) : celle où AUCUNE capacité n'est portée.

export default {
  nameKey: "entity.decor.name",
  sounds: {
    beacon: { path: "assets/sounds/items/box_of_nails_beacon_1.mp3", loop: true },
  },
  blocksMovement: true,
  observable: false,
  interactable: false,
};
