// Archétype "clock_tower_magic_mirror" — le même miroir vu en perception
// surnaturelle (voir clock_tower_mirror.js) : SURNATUREL, présent EN
// perception seulement, donc exempté de l'étouffement mondain. Point de
// passage vers l'espace miroir : l'action (condition passe-miroir,
// destination, son de passage) est déclarée PAR INSTANCE, elle dépend de
// la scène (voir level/clock-tower-weight-shaft.json et
// level/clock-tower-weight-shaft-mirror-space.json).
export default {
  nameKey: "door.clock_tower_magic_mirror.name",
  descriptionKey: "door.clock_tower_magic_mirror.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/magic_mirror_1_beacon", loop: true },
  },
  presence: [{ when: { type: "perceptionActive" }, present: true }],
  blocksMovement: false,
  observable: true,
  interactable: true,
};
