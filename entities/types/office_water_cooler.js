// Archétype "office_water_cooler" — fontaine à eau de bureau. Beacon
// continu ; Entrée verse de l'eau (playSound diégétique, positionné et
// suivi). Cooldown d'interaction par défaut (interactCooldownMs, voir
// view/interaction.js).
export default {
  nameKey: "entity.office_water_cooler.name",
  descriptionKey: "entity.office_water_cooler.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/office_water_cooler_1_beacon", loop: true },
  },
  action: {
    kind: "applyEffects",
    effects: [{ type: "playSound", path: "assets/sounds/effects/pouring_water" }],
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
};
