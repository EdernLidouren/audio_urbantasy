// Archétype "traffic_light" — feu de signalisation de carrefour. Beacon
// continu : le cliquetis du relais qui commute les feux. Interaction : le
// bouton d'appel piéton, qui déclenche le signal sonore de traversée
// (playSound diégétique, positionné sur le feu). Le signal dure plusieurs
// secondes : le cooldown d'interaction (interactCooldownMs, voir
// view/interaction.js) le laisse finir avant qu'un nouvel appui ne le
// relance, comme un vrai bouton d'appel déjà enclenché. Gain x2 sur le
// signal : le fichier est au plafond de son volume, impossible à remonter
// sans l'abîmer.
export default {
  nameKey: "entity.traffic_light.name",
  descriptionKey: "entity.traffic_light.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/traffic_signal_relay_1_beacon", loop: true },
  },
  action: {
    kind: "applyEffects",
    effects: [{ type: "playSound", path: "assets/sounds/effects/accessible_pedestrian_signal", gain: 2 }],
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
  interactCooldownMs: 10000,
};
