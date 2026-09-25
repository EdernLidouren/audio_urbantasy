// Archétype "clock_tower_mirror" — miroir mural ORDINAIRE du puits des
// contrepoids (voir level/clock-tower-weight-shaft.json). Présent HORS
// perception seulement (condition "not", voir doc/scripting.md/"not") :
// superposé au miroir magique (clock_tower_magic_mirror.js), qui prend sa
// place quand la perception s'active. Mondain : reste soumis à
// l'étouffement de perception. Observable, jamais interactif.
export default {
  nameKey: "entity.clock_tower_mirror.name",
  descriptionKey: "entity.clock_tower_mirror.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/mirror_1_beacon", loop: true },
  },
  presence: [{ when: { type: "not", condition: { type: "perceptionActive" } }, present: true }],
  blocksMovement: false,
  observable: true,
  interactable: false,
};
