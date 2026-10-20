// Archétype "broken_computer" — ordinateur cassé (voir
// scenes/town-square-town-hall-storeroom.json). Observable, jamais
// interactif. VOCAL SEUL, aucun beacon (comme machine_1.js) : un
// grésillement électrique de temps en temps, sans repère continu.
export default {
  nameKey: "entity.broken_computer.name",
  descriptionKey: "entity.broken_computer.description",
  sounds: {
    vocal: {
      path: "assets/sounds/effects/electrical_flickering",
      loop: false,
      vocalInterval: 7000,
      vocalIntervalVariation: 3000,
    },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
