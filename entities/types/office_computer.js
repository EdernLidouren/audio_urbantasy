
// Interaction : quelques frappes au clavier, jouées sur l'ordinateur
// (playSound diégétique, positionné et suivi). Le cooldown d'interaction
// (interactCooldownMs, voir view/interaction.js) empêche la rafale.
export default {
  nameKey: "entity.office_computer.name",
  descriptionKey: "entity.office_computer.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/computer_1_beacon", loop: true }
  },
  action: {
    kind: "applyEffects",
    effects: [{ type: "playSound", path: "assets/sounds/furniture/keyboard_typing" }],
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
  interactCooldownMs: 2000,
};
