// Archétype "storm_drain" — bouche d'égout au bas d'un trottoir. Son beacon
// (l'eau qui s'y engouffre) ne coule que par temps PLUVIEUX, pluie OU orage :
// beacon conditionnel (voir doc/entity-model.md/"Sons conditionnels"), la
// grille reste présente et observable par temps sec, simplement muette.
// La condition lit l'état météo courant (core/weather.js) : testable via le
// menu debug météo (Shift+W).
export default {
  nameKey: "entity.storm_drain.name",
  descriptionKey: "entity.storm_drain.description",
  sounds: {
    beacon: {
      path: "assets/sounds/decor/water_drain",
      loop: true,
      condition: { type: "anyOf", conditions: [{ type: "weather", state: "rain" }, { type: "weather", state: "stormy" }] },
    },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
