// Archétype "office_supply_box" — boîte de fournitures de bureau (voir
// scenes/town-square-town-hall-storeroom.json). CONTENEUR DE COLLECTE
// régénérant (voir doc/entity-model.md/"Collecte", core/spawn.js), comme
// "bush" : regarni à chaque cycle quotidien (minuit). Deux tirages par
// fouille, chacun : une chance sur deux de tomber sur la table des
// composants électroniques, une sur deux de ne rien donner — une boîte
// peut donc lâcher zéro, un ou deux composants. Beacon continu.
export default {
  nameKey: "entity.office_supply_box.name",
  descriptionKey: "entity.office_supply_box.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/box_1_beacon", loop: true },
  },
  container: {
    distribution: {
      tables: [
        { table: "electronics", weight: 1 },
        { items: { nothing: 1 }, weight: 1 },
      ],
    },
    count: 2,
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
  action: { kind: "search" },
};
