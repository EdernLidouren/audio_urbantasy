// Archétype "wood_bench" — banc public de bois. Mobilier de rue : beacon
// continu, non interactif (s'y asseoir n'a pas encore de sens en jeu),
// jamais bloquant, comme la chaise (entities/types/chair.js).
export default {
  nameKey: "entity.wood_bench.name",
  descriptionKey: "entity.wood_bench.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/bench_1_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
