// Archétype "wind_chime" — carillon éolien suspendu. Sa balise ne sonne
// QUE par temps venteux (son conditionnel sur la météo, voir
// doc/entity-model.md/"Sons conditionnels (balise et proximité)") : sans
// vent, le carillon se tait, mais reste là et s'observe. Ni action ni
// obstacle.
export default {
  nameKey: "entity.wind_chime.name",
  descriptionKey: "entity.wind_chime.description",
  sounds: {
    beacon: {
      path: "assets/sounds/furniture/wind_chime_1_beacon",
      loop: true,
      condition: { type: "weather", state: "windy" },
    },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
