// Archétype "buddy" — le compagnon de test prédéfini (voir
// core/state.js/createTestCompanion). Distinct de "dog" (dog.js) : nameKey
// partagé ("Chien"), mais SANS beacon (le compagnon suit le joueur de trop
// près, un "tic tic" continu gênerait l'écoute du reste de la scène) : on
// le repère à son pas et à sa voix
// (vocal/movement), suffisants vu sa proximité constante avec le joueur en
// "follow" (voir core/behaviors/follow.js). vocal et movement repris tels
// quels de dog.js (même famille de son).
//
// Ni gait ni naturalWalk déclarés (voir doc/entity-model.md, "Surfaces de sol
// et son de pas") : la résolution du pas retombe directement sur le son
// PROPRE de l'entité (sounds.movement.path, dog_medium_walk), comme
// dog.js. Ne pas lui en ajouter : un gait ou un naturalWalk dont le pool
// existe (ex. "barefoot_walk") court-circuite la résolution AVANT le son
// propre, et ferait marcher le compagnon pieds nus au lieu de chien.

export default {
  nameKey: "entity.dog.name",
  descriptionKey: "entity.buddy.description",
  sounds: {
    vocal: {
      path: "assets/sounds/entities/dog_medium_vocal",
      loop: false,
      vocalInterval: 6000,
      vocalIntervalVariation: 2000,
      pitchVariation: 0.15,
    },
    movement: {
      path: "assets/sounds/footsteps/entities/dog_medium_walk",
      loop: false,
      pitchVariation: 0.08,
      // Aucun movementGain : voir dog.js — volume porté par les fichiers
      // source, sans compensation logicielle.
    },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
