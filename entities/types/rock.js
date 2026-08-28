// Archétype "rock" — voir entities/types/index.js pour le registre complet
// et entities/model.md pour le vocabulaire du modèle d'entité. Donnée pure :
// aucun import.
//
// blocksMovement est exploité par core/reduce.js (résolution de collision
// joueur/entité) : voir core/level.js pour le bakage dans l'entité parsée.
// collisionSound (optionnel, hors de `sounds` : ce n'est pas un rôle du
// modèle d'entité, juste une clé d'asset jouée par la vue quand le CORE
// signale player.blockedBy === cette entité) — dormant si l'entité n'est
// pas blocksMovement.

export default {
  label: "entity.rock",
  descriptionKey: "entity.rock.description",
  sounds: {
    beacon: { path: "assets/sounds/entities/big_rock_beacon_1.mp3", loop: true },
  },
  collisionSound: "assets/sounds/entities/big_rock_collision_1.mp3",
  blocksMovement: true,
  observable: true,
  interactable: false,
};
