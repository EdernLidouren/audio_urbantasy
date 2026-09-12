// Archétype "bush" — CONTENEUR DE COLLECTE régénérant (voir
// doc/entity-model.md/"Collecte", core/spawn.js) : un buisson fouillable
// qui se garnit à chaque cycle quotidien d'un objet tiré dans sa
// distribution. Contrairement à "crate" (collectible persistant, consommé
// une fois pour toutes), il n'est jamais `consumed` : fouillé -> vide
// jusqu'au cycle suivant. `container.distribution` cascade instance -> type
// : une instance peut référencer une autre table standard ou déclarer la
// sienne inline. Beacon : pool tree_beacon réutilisé (aucun son "buisson"
// dédié pour l'instant).
export default {
  nameKey: "entity.bush.name",
  descriptionKey: "entity.bush.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/tree_beacon", loop: true },
  },
  container: { distribution: { table: "default" } },
  blocksMovement: false,
  observable: true,
  interactable: true,
  highlight: true,
  action: { kind: "search" },
};
