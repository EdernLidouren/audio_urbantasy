// Archétype "crate" — COLLECTIBLE PERSISTANT (voir doc/entity-model.md,
// "Collectible persistant") : contrairement à "money" (ramassage,
// l'entité disparaît — voir entities/types/money.js, core/money.js/
// pickupEntity), une caisse looté reste dans le monde, changée d'état
// (entity.consumed, voir core/state.js/markConsumed) — jamais retirée.
// Contenu et idempotence : core pur (core/money.js/lootEntity).
//
// Deux effets POST-ACTIVATION composables, DÉCLARÉS par l'entité — jamais
// codés en dur pour "crate" spécifiquement (voir view/interaction.js,
// view/audio/city-scene.js) :
//   - consumedDescriptionKey (cascade instance -> type, comme
//     descriptionKey — voir core/scene.js) : description alternative une
//     fois consumed, lue par view/interaction.js/resolveDescription. Reste
//     OBSERVABLE/INTERACTABLE après consommation (contrairement à "devenir
//     dormant" ci-dessous) — seul son état PERÇU change.
//   - muteOnConsumed (registre SEULEMENT, voir view/audio/city-scene.js/
//     muteConsumedBeacons) : arrête PERMANEMMENT le beacon continu dès que
//     consumed passe à true. Un son DIFFÉRENT (un autre fichier) n'est PAS
//     supporté — seule son ABSENCE l'est.
// "Devenir dormant" n'est PAS un champ de cet archétype : ça se déclare
// avec le système de présence EXISTANT (core/presence.js), en ajoutant une
// règle { when: { type: "consumed" }, present: false } à l'INSTANCE qui
// veut cet effet (voir scenes/demo2.json, "crate-warehouse") — cet
// archétype n'en déclare AUCUNE par défaut : silence perceptible SEUL par
// défaut (desc + beacon), pas dormance — une caisse looté reste
// observable/interactable tant qu'aucune instance ne surcharge `presence`.
export default {
  nameKey: "entity.crate.name",
  descriptionKey: "entity.crate.description",
  consumedDescriptionKey: "entity.crate.consumed_description",
  // Pool réutilisé (déjà utilisé par money.js/npc.js, voir leurs
  // commentaires) : aucun son "caisse" dédié pour l'instant.
  sounds: {
    beacon: { path: "assets/sounds/items/box_of_nails_beacon_1.mp3", loop: true },
  },
  muteOnConsumed: true,
  blocksMovement: false,
  observable: true,
  interactable: true,
  // Surlignage audio de proximité (voir doc/entity-model.md) : une caisse se
  // repère nettement une fois à portée, consumed ou non (muteOnConsumed
  // coupe le beacon lui-même, pas ce flag).
  highlight: true,
  action: { kind: "loot", amount: 100 },
};
