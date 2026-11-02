// Archétype "geode" — géode prise dans la roche, entité minable RARE
// (voir doc/entity-model.md/"Minage", core/mining.js). Rare à trouver,
// elle récompense : sa table propre pèse cinq fois le fond commun
// (config/spawn-values.js, "mining_common" et "geode") et elle donne
// toujours au moins deux objets.
// Sans le kit de minage, l'action refuse et le dit (condition +
// refusalEffects, voir doc/scripting.md/"Actions"). Résistance (`hits`) :
// 4 à 7 coups, provisoire. Son de destruction : celui du
// rocher pour l'instant, faute de son propre.
export default {
  nameKey: "entity.geode.name",
  descriptionKey: "entity.geode.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/geode_1_beacon", loop: true },
    hit: { path: "assets/sounds/effects/geode_mining" },
    break: { path: "assets/sounds/effects/boulder_destruction" },
  },
  mineable: {
    distribution: { tables: [{ table: "mining_common", weight: 1 }, { table: "geode", weight: 5 }] },
    hits: { min: 4, max: 7 },
    count: { min: 2, max: 3 },
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
  // Surlignage audio de proximité (voir doc/entity-model.md) : une prise à
  // frapper se repère nettement une fois à portée, comme un conteneur.
  highlight: true,
  // Délai entre deux coups (interactCooldownMs, voir view/interaction.js) :
  // bien plus court que le défaut, pour enchaîner les coups en rythme.
  interactCooldownMs: 200,
  action: {
    kind: "mine",
    condition: { type: "hasImprovement", id: "mining_kit" },
    refusalEffects: [{ type: "announce", key: "interaction.mineNeedsTools" }],
  },
};
