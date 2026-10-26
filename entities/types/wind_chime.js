// Archétype "wind_chime" — carillon éolien suspendu. Sa balise ne sonne
// QUE par temps venteux (son conditionnel sur la météo, voir
// doc/entity-model.md/"Sons conditionnels (balise et proximité)") : sans
// vent, le carillon se tait, mais reste là et s'observe. Ni action ni
// obstacle. Fondu court (beaconFadeMs) quand le vent se lève ou retombe :
// le carillon s'éveille et s'apaise au lieu de démarrer et couper net.
export default {
  nameKey: "entity.wind_chime.name",
  descriptionKey: "entity.wind_chime.description",
  sounds: {
    beacon: {
      path: "assets/sounds/furniture/wind_chime_1_beacon",
      loop: true,
      condition: { type: "weather", state: "windy" },
      beaconFadeMs: 500,
    },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
