// Archétype "broken_computer" — ordinateur cassé (voir
// scenes/town-square-town-hall-storeroom.json). VOCAL SEUL, aucun beacon
// (comme machine_1.js) : un grésillement électrique de temps en temps, sans
// repère continu. CONTENEUR DE COLLECTE NON régénérant (voir
// doc/entity-model.md/"Collecte", core/spawn.js/containerStatus) : on le
// démonte UNE fois, puis il ne reste plus rien à récupérer. Trois tirages,
// chacun : trois chances sur quatre de tomber sur un composant électronique,
// une sur quatre de ne rien donner.
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
  container: {
    distribution: {
      tables: [
        { table: "electronics", weight: 3 },
        { items: { nothing: 1 }, weight: 1 },
      ],
    },
    count: 3,
    regenerates: false,
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
  action: { kind: "search" },
};
