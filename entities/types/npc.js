// Archétype "npc" — voir entities/types/index.js pour le registre complet et
// entities/model.md pour le vocabulaire du modèle d'entité. Donnée pure :
// aucun import.
//
// "Un passant" : beacon (LOCALISATION, continu, signal "tic tic") + vocal
// (EXPRESSION, sifflement occasionnel, défauts globaux — aucune surcharge
// d'intervalle ici, contrairement à dog.js). Son de sifflement PROVISOIRE
// (placeholder générique, aucun asset "sifflement" dédié pour l'instant —
// même logique que box_of_nails_beacon réutilisé ailleurs).
//
// gait:"shoes" + sounds.movement — EXACTEMENT le même pas que le joueur
// (entities/player.js), pour rendre le npc audible en déplacement (il
// n'avait aucun son de pas jusqu'ici : voir entities/model.md, "Surfaces de
// sol et son de pas" — un archétype SANS sounds.movement ne pose jamais de
// pas, quel que soit le sol). ATTENTION : sur un sol SPÉCIAL (dirt/grass,
// ex. level/demo.json — le cas de l'habitant qui erre le jour), c'est LE
// SOL qui domine et qui joue à la place (dirt_walk/grass_walk) : gait est
// alors ignoré, exactement comme pour le joueur sur ce même sol
// aujourd'hui. Le pas "shoes" ne s'entend distinctement que sur un sol
// NEUTRE (ex. level/demo2.json, qui ne déclare pas de defaultSurface et
// retombe donc sur "concrete", neutre — voir core/surfaces.js).
export default {
  nameKey: "entity.npc.name",
  descriptionKey: "entity.npc.description",
  gait: "shoes",
  sounds: {
    beacon: { path: "assets/sounds/entities/npc_beacon_1.mp3", loop: true },
    vocal: { path: "assets/sounds/entities/box_of_nails_beacon_1.mp3", loop: false },
    movement: { path: "assets/sounds/footsteps/shoes_walk", loop: false },
  },
  blocksMovement: false,
  observable: true,
  // interactable:true (anticipe "parler", voir entities/model.md) : candidat
  // à entrée dès aujourd'hui, action encore générique (stub) pour l'instant.
  interactable: true,
};
