// Archétype "money" — une somme ramassable au sol (voir view/interaction.js,
// ACTION_HANDLERS.pickup ; core/money.js/pickupEntity). Test de bout en bout
// du premier kind d'action différenciée (voir entities/model.md,
// "Interaction (niveau 0)"). observable : petite description de flaveur,
// pas requise par le système lui-même (une entité interactable sans
// description resterait mécaniquement identique).
//
// amount:5 — défaut de l'archétype, comme tout autre champ `action` :
// surchargeable par instance en redéclarant `action` EN ENTIER (cascade
// remplace, jamais de fusion profonde — même principe que `behavior`,
// `presence`), voir core/scene.js.

export default {
  nameKey: "entity.money.name",
  descriptionKey: "entity.money.description",
  sounds: {
    beacon: { path: "assets/sounds/items/box_of_nails_beacon_1.mp3", loop: true },
    // Son de RAMASSAGE (rôle `pickup`, voir doc/entity-model.md/"Vocabulaire
    // de sons") : déclaré par archétype, jamais imposé.
    pickup: { path: "assets/sounds/effects/coin" },
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
  // Surlignage audio de proximité (voir entities/model.md) : une somme au
  // sol se repère nettement une fois à portée.
  highlight: true,
  action: { kind: "pickup", amount: 5 },
};
