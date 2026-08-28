// Archétype "fountain" — voir entities/types/index.js pour le registre
// complet et entities/model.md. Donnée pure : aucun import.
//
// Balise CONTINUE (beaconMode par défaut, non déclaré ici — voir
// entities/model.md) : sert de point de comparaison avec bird.js
// (intermittent). Son provisoire : même placeholder générique que
// object/dog/decor, aucun asset "fontaine" dédié pour l'instant.

export default {
  label: "entity.fountain",
  descriptionKey: "entity.fountain.description",
  sounds: {
    beacon: { path: "assets/sounds/entities/box_of_nails_beacon_1.mp3", loop: true },
  },
  blocksMovement: true,
  observable: true,
  interactable: false,
};
