// Archétype "large_boulder" — énorme rocher qui barre le chemin : une entité
// minable (voir doc/entity-model.md/"Minage", core/mining.js) ET bloquante.
// Tant que le joueur n'a pas le kit de minage, il bute dessus et l'action
// refuse (condition + refusalEffects) ; une fois brisé, il est retiré du
// monde et la route est libre pour de bon. Il se mine comme un rocher : même
// butin, mêmes sons de coup et de destruction, mais il résiste plus longtemps
// et donne davantage.
export default {
  nameKey: "entity.large_boulder.name",
  descriptionKey: "entity.large_boulder.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/large_boulder_1_beacon", loop: true },
    hit: { path: "assets/sounds/effects/boulder_mining" },
    break: { path: "assets/sounds/effects/boulder_destruction" },
  },
  collisionSound: "assets/sounds/effects/boulder_collision",
  mineable: {
    distribution: { tables: [{ table: "mining_common", weight: 1 }, { table: "boulder", weight: 1 }] },
    hits: { min: 5, max: 6 },
    count: { min: 2, max: 4 },
  },
  blocksMovement: true,
  observable: true,
  interactable: true,
  // Surlignage audio de proximité (voir doc/entity-model.md) : une prise à
  // frapper se repère nettement une fois à portée, comme un conteneur.
  highlight: true,
  // Délai entre deux coups (interactCooldownMs, voir view/interaction.js) :
  // le même que les autres entités minables, pour enchaîner en rythme.
  interactCooldownMs: 200,
  action: {
    kind: "mine",
    condition: { type: "hasImprovement", id: "mining_kit" },
    refusalEffects: [{ type: "announce", key: "interaction.mineNeedsTools" }],
  },
};
