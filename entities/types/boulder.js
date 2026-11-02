// Archétype "boulder" — rocher détaché de la paroi, l'entité minable la
// plus COMMUNE (voir doc/entity-model.md/"Minage", core/mining.js). Il
// livre surtout de la roche ordinaire : le fond commun pèse autant que sa
// table propre (config/spawn-values.js, "mining_common" et "boulder").
// Sans le kit de minage, l'action refuse et le dit (condition +
// refusalEffects, voir doc/scripting.md/"Actions"). Résistance (`hits`) :
// PROVISOIRE, 1 à 5 coups pour les tests. Son de destruction : celui du
// rocher pour l'instant, faute de son propre.
export default {
  nameKey: "entity.boulder.name",
  descriptionKey: "entity.boulder.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/boulder_1_beacon", loop: true },
    hit: { path: "assets/sounds/effects/boulder_mining" },
    break: { path: "assets/sounds/effects/boulder_destruction" },
  },
  mineable: {
    distribution: { tables: [{ table: "mining_common", weight: 1 }, { table: "boulder", weight: 1 }] },
    hits: { min: 1, max: 5 },
    count: { min: 1, max: 2 },
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
  // Surlignage audio de proximité (voir doc/entity-model.md) : une prise à
  // frapper se repère nettement une fois à portée, comme un conteneur.
  highlight: true,
  action: {
    kind: "mine",
    condition: { type: "hasImprovement", id: "mining_kit" },
    refusalEffects: [{ type: "announce", key: "interaction.mineNeedsTools" }],
  },
};
