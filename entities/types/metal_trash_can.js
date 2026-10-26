// Archétype "metal_trash_can" — poubelle de rue en métal. Conteneur de
// collecte RÉGÉNÉRANT (voir doc/entity-model.md/"Collecte") : fouillable une
// fois par jour, regarni au cycle suivant. Sa table dédiée,
// "metal_trash_can" (config/spawn-values.js), est PROVISOIRE en attendant
// son vrai contenu. Balise continue : le métal qui résonne.
export default {
  nameKey: "entity.metal_trash_can.name",
  descriptionKey: "entity.metal_trash_can.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/trash_can_1_beacon", loop: true },
  },
  container: { distribution: { table: "metal_trash_can" } },
  blocksMovement: false,
  observable: true,
  interactable: true,
  // Surlignage audio de proximité (voir doc/entity-model.md) : une source à
  // fouiller se repère nettement une fois à portée, comme le buisson.
  highlight: true,
  action: { kind: "search" },
};
