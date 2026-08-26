// Archétype "bird" — voir entities/types/index.js pour le registre complet
// et entities/model.md pour le vocabulaire du modèle d'entité (dont
// beaconMode). Donnée pure : aucun import.
//
// Balise INTERMITTENTE (sounds.beacon.beaconMode) : rejouée en one-shot
// toutes les beaconInterval ± beaconIntervalVariation ms (défauts globaux,
// non surchargés ici) plutôt qu'une boucle permanente — sert de point de
// comparaison avec une balise continue (voir fountain.js). Son provisoire :
// pool de vocalises du chien, sans rapport thématique — aucun asset
// "oiseau" dédié pour l'instant, même logique que dog.js réutilisant
// box_of_nails_beacon pour sa propre balise.

export default {
  label: "entity.bird",
  descriptionKey: "entity.bird.description",
  sounds: {
    beacon: {
      path: "assets/sounds/entities/dog_medium_vocal",
      loop: false,
      beaconMode: "intermittent",
    },
  },
  blocksMovement: false,
  enterable: false,
};
