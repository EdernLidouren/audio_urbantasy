// Archétype "blood_pyramidion" — pyramidion sanglant, SURNATUREL (présent en
// perception seulement, comme ghost.js). Une entité minable (voir
// doc/entity-model.md/"Minage") au butin FIXE (`drops`) : ni tirage, ni table.
// Traversable : c'est son rayon qui alimente un champ de force, pas lui qui
// barre le chemin. Le rayon est une balise à part, posée au même x (voir
// scenes/old-quarries-underground-1-flooded-gallery-mirror-side.json). Sons de
// coup et de destruction : ceux du gros rocher, faute de sons propres.
export default {
  nameKey: "entity.blood_pyramidion.name",
  descriptionKey: "entity.blood_pyramidion.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/large_boulder_1_beacon", loop: true },
    hit: { path: "assets/sounds/effects/boulder_mining" },
    break: { path: "assets/sounds/effects/boulder_destruction" },
  },
  mineable: {
    drops: { hematite: 3, quartz: 1 },
    hits: 3,
  },
  presence: [{ when: { type: "perceptionActive" }, present: true }],
  blocksMovement: false,
  observable: true,
  interactable: true,
  // Surlignage audio de proximité (voir doc/entity-model.md) et cadence de
  // frappe : les mêmes que les autres entités minables.
  highlight: true,
  interactCooldownMs: 200,
  action: {
    kind: "mine",
    condition: { type: "hasImprovement", id: "mining_kit" },
    refusalEffects: [{ type: "announce", key: "interaction.mineNeedsTools" }],
  },
};
