// Archétype "buddy" — le compagnon de test prédéfini (voir
// core/state.js/createTestCompanion). Distinct de "dog" (dog.js) : nameKey
// partagé ("Chien"), mais SANS beacon (retiré à la demande — le
// compagnon suit le joueur de trop près, le "tic tic" continu gênait
// l'écoute du reste de la scène) : on le repère à son pas et à sa voix
// (vocal/movement), suffisants vu sa proximité constante avec le joueur en
// "follow" (voir core/behaviors/follow.js). vocal et movement repris tels
// quels de dog.js (même famille de son).
//
// Ni gait ni naturalWalk déclarés (voir entities/model.md, "Surfaces de sol
// et son de pas") : la résolution du pas retombe directement sur le son
// PROPRE de l'entité (sounds.movement.path, dog_medium_walk), comme
// dog.js. Ce fichier a autrefois déclaré gait:"heavy_boots" +
// naturalWalk:"barefoot" pour DÉMONTRER la chaîne de résolution complète
// sur sol neutre, sur l'hypothèse qu'aucun des deux pools n'existait —
// devenu FAUX depuis l'ajout de "barefoot_walk" (voir ses assets), qui
// court-circuitait la résolution avant "son propre" et faisait marcher le
// compagnon pieds nus au lieu de chien (bug corrigé en retirant ces deux
// champs, jamais en les ajustant : la démonstration n'a plus sa place ici).

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
      path: "assets/sounds/footsteps/dog_medium_walk",
      loop: false,
      pitchVariation: 0.08,
      // Aucun movementGain : voir dog.js — volume porté par les fichiers
      // source, plus de compensation logicielle.
    },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
