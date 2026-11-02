// Archétype "ore_vein" — filon de minerai, entité minable PEU COMMUNE
// (voir doc/entity-model.md/"Minage", core/mining.js). Il livre surtout du
// métal : sa table propre pèse deux fois le fond commun
// (config/spawn-values.js, "mining_common" et "ore_vein"), et il donne un
// peu plus qu'un rocher.
// Sans le kit de minage, l'action refuse et le dit (condition +
// refusalEffects, voir doc/scripting.md/"Actions"). Résistance (`hits`) :
// 3 à 6 coups, provisoire. Son de destruction : celui du
// rocher pour l'instant, faute de son propre.
export default {
  nameKey: "entity.ore_vein.name",
  descriptionKey: "entity.ore_vein.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/ore_vein_1_beacon", loop: true },
    hit: { path: "assets/sounds/effects/ore_vein_mining" },
    break: { path: "assets/sounds/effects/boulder_destruction" },
  },
  mineable: {
    distribution: { tables: [{ table: "mining_common", weight: 1 }, { table: "ore_vein", weight: 2 }] },
    hits: { min: 3, max: 6 },
    count: { min: 1, max: 3 },
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
