// Archétype "large_machinery" — grosse machinerie d'intérieur (rouages,
// pièces métalliques en mouvement continu, voir level/clock-tower-main.json).
// Décor sonore observable, jamais interactif. Le beacon par défaut est un
// rouage lent ; une instance en choisit un autre par fusion (voir
// doc/entity-model.md/"Cascade de sounds").
export default {
  nameKey: "entity.large_machinery.name",
  descriptionKey: "entity.large_machinery.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/large_gear_1_beacon", loop: true, beaconGain: 1.5 },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
