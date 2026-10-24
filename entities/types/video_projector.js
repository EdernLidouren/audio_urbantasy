// Archétype "video_projector" — vidéoprojecteur qu'on allume et éteint.
// Beacon CONDITIONNEL (voir doc/entity-model.md/"Sons conditionnels") :
// il ne tourne que tant que la variable d'entité `isOn` vaut true. L'action
// ne touche jamais au son directement : elle bascule `isOn` (approche B,
// deux candidates aux conditions opposées, voir doc/scripting.md/"Actions
// multiples filtrées par condition") et le beacon suit l'état au tick
// suivant — un état sauvegardé retrouve donc le bon son au chargement.
//
// Une variable ne cascade jamais type -> instance : CHAQUE instance déclare
// sa propre `isOn` (sinon le chargement échoue), par exemple allumée au
// départ et mémorisée dans la sauvegarde :
//   "variables": [{ "name": "isOn", "type": "flag", "initial": true }]
//
// Montée en régime et ralentissement (beaconFadeMs, beaconFadeRate) : à
// l'allumage, le ventilateur part grave et lent puis rejoint son régime ;
// à l'extinction, il ralentit en s'éteignant. L'interrupteur, joué par
// l'action, marque le début de la rampe.
const IS_ON = { type: "variable", scope: "entity", name: "isOn", equals: true };
const IS_OFF = { type: "variable", scope: "entity", name: "isOn", equals: false };

export default {
  nameKey: "entity.video_projector.name",
  descriptionKey: "entity.video_projector.description",
  sounds: {
    // Légèrement audible depuis l'autre face d'une scène recto/verso (voir
    // config/tuning-values.js/beaconCrossFaceGain) : un appareil bruyant.
    beacon: {
      path: "assets/sounds/furniture/video_projector_1_beacon",
      loop: true,
      condition: IS_ON,
      beaconCrossFaceGain: 0.3,
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
