// Archétype "force_field" — champ de force, SURNATUREL (présent en perception
// seulement, comme ghost.js) et infranchissable. Observable, sans action : on
// ne le fait pas céder directement. Ce qui l'éteint se déclare par instance,
// avec sa présence. Hors perception, le champ absent ne bloque plus : une
// scène qui y tient lui superpose un "unseen_force_field" (voir ce type).
export default {
  nameKey: "entity.force_field.name",
  descriptionKey: "entity.force_field.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/force_field_1_beacon", loop: true },
  },
  collisionSound: "assets/sounds/effects/force_field_collision",
  presence: [{ when: { type: "perceptionActive" }, present: true }],
  blocksMovement: true,
  observable: true,
  interactable: false,
};
