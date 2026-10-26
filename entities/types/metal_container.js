// Archétype "metal_container" — grande caisse de métal. Conteneur de
// collecte RÉGÉNÉRANT (voir doc/entity-model.md/"Collecte") : fouillable une
// fois par jour, regarni au cycle suivant. Sa table dédiée,
// "metal_container" (config/spawn-values.js), est PROVISOIRE en attendant
// son vrai contenu. Balise continue : le battant métallique.
export default {
  nameKey: "entity.metal_container.name",
  descriptionKey: "entity.metal_container.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/metal_container_1_close", loop: true },
  },
  container: { distribution: { table: "metal_container" } },
  blocksMovement: false,
  observable: true,
  interactable: true,
  // Surlignage audio de proximité, comme la poubelle.
  highlight: true,
  action: { kind: "search" },
};
