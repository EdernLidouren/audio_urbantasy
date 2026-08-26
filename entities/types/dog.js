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
//
// sounds.movement (rôle "movement", voir entities/model.md) : cadencé par la
// distance parcourue, exactement comme le joueur — dormant tant que
// l'instance n'a pas de behavior (un chien immobile ne pose jamais de pas).
// movementGain:10 compense un fichier source (dog_medium_walk) enregistré à
// une amplitude crête ~10x plus faible que concrete_walk (pas du joueur) ou
// dog_medium_vocal (l'aboiement) — mesuré, pas estimé (voir historique de
// session) : sans ce gain, le pas du chien se déclenche bien mais reste
// quasi inaudible sous l'ambiance.
//
// "Chien important" : porte les TROIS rôles de son positionné (voir
// entities/model.md) — beacon (LOCALISATION, continu, placeholder générique
// comme object/decor/fountain), vocal (EXPRESSION, aboiements sporadiques,
// pool dog_medium_vocal — un fichier différent à chaque occurrence, voir
// resolveAsset) et movement (le pas). Interval/variation du vocal
// SURCHARGÉS ici (plus fréquent que le défaut global : un chien aboie
// davantage qu'un vocal générique) — beacon/vocal/movement se résolvent
// tous les trois INDÉPENDAMMENT (voir entities/model.md, "Paramètres
// sonores").

export default {
  label: "entity.dog",
  descriptionKey: "entity.dog.description",
  sounds: {
    beacon: { path: "assets/sounds/entities/box_of_nails_beacon_1.mp3", loop: true },
    vocal: {
      path: "assets/sounds/entities/dog_medium_vocal",
      loop: false,
      vocalInterval: 6000,
      vocalIntervalVariation: 2000,
      pitchVariation: 0.15,
    },
    movement: {
      path: "assets/sounds/footsteps/dog_medium_walk",
      loop: false,
      pitchVariation: 0.08,
      // movementGain:10 compense un fichier source (dog_medium_walk)
      // enregistré à une amplitude crête ~10x plus faible que concrete_walk
      // (pas du joueur) ou dog_medium_vocal (l'aboiement) — mesuré, pas
      // estimé (voir historique de session) : sans ce gain, le pas se
      // déclenche bien mais reste quasi inaudible sous l'ambiance.
      movementGain: 10,
    },
  },
  blocksMovement: false,
  enterable: false,
};
