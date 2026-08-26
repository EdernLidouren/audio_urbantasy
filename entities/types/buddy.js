// Archétype "buddy" — le compagnon de test prédéfini (voir
// core/state.js/createTestCompanion). Distinct de "dog" (dog.js) :
// label partagé ("Chien"), mais son PROPRE beacon — npc_beacon plutôt que
// le placeholder générique — pour le suivre facilement à l'oreille pendant
// qu'il apprend à suivre le joueur (voir core/behaviors/follow.js). vocal
// et movement repris tels quels de dog.js (même famille de son).
//
// gait:"heavy_boots" + naturalWalk:"barefoot" — démontrent la CHAÎNE
// COMPLÈTE de résolution du pas sur sol NEUTRE (voir entities/model.md,
// "Surfaces de sol et son de pas") : NI "heavy_boots_walk" NI
// "barefoot_walk" n'existent aujourd'hui, donc la résolution dégrade
// proprement, cran par cran, jusqu'au pas naturel "son propre" de l'entité
// (sounds.movement.path, dog_medium_walk) — sans qu'aucun nouveau fichier
// soit requis, comportement audible du compagnon INCHANGÉ. Retire ces
// champs le jour où l'un des deux fichiers existe réellement : le
// compagnon se mettra alors à l'utiliser automatiquement, sans toucher à
// la vue.

export default {
  label: "entity.dog",
  descriptionKey: "entity.buddy.description",
  gait: "heavy_boots",
  naturalWalk: "barefoot",
  sounds: {
    beacon: { path: "assets/sounds/entities/npc_beacon_1.mp3", loop: true },
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
  enterable: false,
};
