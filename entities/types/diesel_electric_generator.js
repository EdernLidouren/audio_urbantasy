// Archétype "diesel_electric_generator" — groupe électrogène qu'on démarre
// et qu'on arrête. MÊME mécanique que le vidéoprojecteur (voir
// entities/types/video_projector.js) : beacon CONDITIONNEL qui ne tourne
// que tant que la variable d'entité `isOn` vaut true, et deux actions aux
// conditions opposées qui basculent `isOn` (approche B, voir
// doc/scripting.md/"Actions multiples filtrées par condition") ; le son
// suit l'état au tick suivant, un état sauvegardé retrouve donc le bon son
// au chargement.
//
// Une variable ne cascade jamais type -> instance : CHAQUE instance déclare
// sa propre `isOn`, éteinte au départ et mémorisée dans la sauvegarde
// (`persistent` vaut true par défaut) :
//   "variables": [{ "name": "isOn", "type": "flag", "initial": false }]
//
// Démarrage et arrêt avec les réglages du vidéoprojecteur (beaconFadeMs,
// beaconFadeRate) : le moteur part grave et lent puis rejoint son régime,
// et ralentit en s'éteignant.
const IS_ON = { type: "variable", scope: "entity", name: "isOn", equals: true };
const IS_OFF = { type: "variable", scope: "entity", name: "isOn", equals: false };

export default {
  nameKey: "entity.diesel_electric_generator.name",
  descriptionKey: "entity.diesel_electric_generator.description",
  sounds: {
    beacon: {
      path: "assets/sounds/furniture/electric_generator_1_beacon",
      loop: true,
      condition: IS_ON,
      beaconFadeMs: 2500,
      beaconFadeRate: 0.3,
    },
  },
  action: [
    {
      kind: "applyEffects",
      condition: IS_ON,
      effects: [
        { type: "playSound", path: "assets/sounds/effects/switch_off" },
        { type: "setVariable", scope: "entity", name: "isOn", value: false },
      ],
    },
    {
      kind: "applyEffects",
      condition: IS_OFF,
      effects: [
        { type: "playSound", path: "assets/sounds/effects/switch_on" },
        { type: "setVariable", scope: "entity", name: "isOn", value: true },
      ],
    },
  ],
  blocksMovement: false,
  observable: true,
  interactable: true,
};
