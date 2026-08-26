// Archétype "dog" — voir entities/types/index.js pour le registre complet et
// entities/model.md pour le vocabulaire du modèle d'entité. Donnée pure :
// aucun import.
//
// Aucun `behavior` par défaut ici, volontairement : le comportement se
// déclare à l'INSTANCE (level/*.json), jamais comme défaut d'archétype — sinon
// une instance voulant rester immobile hériterait malgré elle d'un wander.
// Deux instances "dog" peuvent donc se comporter différemment (l'une avec
// behavior:{kind:"wander"}, l'autre sans) sans code spécial, seulement par ce
// que chaque instance déclare (voir level/demo.json).

export default {
  label: "entity.dog",
  descriptionKey: "entity.dog.description",
  sounds: {
    beacon: { path: "assets/sounds/entities/box_of_nails_beacon_1.mp3", loop: true },
  },
  blocksMovement: false,
  enterable: false,
};
