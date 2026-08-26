// Archétype "decor" — voir entities/types/index.js pour le registre complet
// et entities/model.md pour le vocabulaire du modèle d'entité. Donnée pure :
// aucun import.
//
// Preset d'exemple, non utilisé dans demo.json : positionné et purement
// décoratif. Aucune interaction (enterable:false, pas de descriptionKey) —
// seuls les archétypes avec descriptionKey sont concernés par l'interaction
// "describe".

export default {
  label: "entity.decor",
  sounds: {
    beacon: { path: "assets/sounds/entities/box_of_nails_beacon_1.mp3", loop: true },
  },
  blocksMovement: true,
  enterable: false,
};
