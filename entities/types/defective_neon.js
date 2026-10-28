// Archétype "defective_neon" — un néon qui grésille sous un courant qui
// n'est pas tout à fait de l'électricité. Même présence de nuit, même
// balise et mêmes grésillements d'allumage et d'extinction que le néon
// ordinaire (voir neon.js), plus un vocal "neon_malfunction" qui le
// distingue à l'oreille. Donnée pure : aucun import.
//
// Le scénario du sifflement (il se dérègle, puis éclate et libère le
// ghosten) se déclare sur l'INSTANCE (defective_neon_1_v,
// scenes/main-street.json) : il lit la variable "phase", que seule une
// instance déclare (voir doc/scripting.md/"Variables"). Sans ce
// scénario, un néon défectueux n'est qu'un néon qui grésille.
export default {
  nameKey: "entity.defective_neon.name",
  descriptionKey: "entity.defective_neon.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/neon_beacon", loop: true },
    vocal: {
      path: "assets/sounds/effects/neon_malfunction",
      vocalInterval: 12000,
      vocalIntervalVariation: 2000,
      pitchVariation: 0.2,
    },
    enterSound: { path: "assets/sounds/effects/electrical_flickering" },
    exitSound: { path: "assets/sounds/effects/electrical_flickering" },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
  presence: [{ when: { type: "timeRange", from: 22, to: 6 }, present: true }],
};
