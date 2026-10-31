// Archétype "rock" — voir entities/types/index.js pour le registre complet
// et doc/entity-model.md pour le vocabulaire du modèle d'entité. Donnée pure :
// aucun import.
//
// blocksMovement est exploité par core/reduce.js (résolution de collision
// joueur/entité) : voir core/entity-parse.js pour le bakage dans l'entité parsée.
// collisionSound (optionnel, hors de `sounds` : ce n'est pas un rôle du
// modèle d'entité, juste une clé d'asset jouée par la vue quand le CORE
// signale player.blockedBy === cette entité) — dormant si l'entité n'est
// pas blocksMovement.

export default {
  nameKey: "entity.rock.name",
  descriptionKey: "entity.rock.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/big_rock_1_beacon_1.mp3", loop: true },
  },
  collisionSound: "assets/sounds/effects/big_rock_collision_1.mp3",
  blocksMovement: true,
  observable: true,
  interactable: false,
};
