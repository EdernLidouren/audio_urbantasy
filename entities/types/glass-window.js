
export default {
  nameKey: "entity.glass_window.name",
  descriptionKey: "entity.glass_window.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/glass_window_1_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
  // Surlignage audio de proximité (voir entities/model.md) : une fenêtre se
  // repère nettement une fois à portée.
  highlight: true,
  action: [
    {
      kind: "applyEffects",
      condition: { type: "variable", scope: "entity", name: "isOpen", equals: false },
      effects: [
        { type: "playSound", path: "assets/sounds/effects/window_blinds_open" },
        { type: "setVariable", scope: "entity", name: "isOpen", value: true }
      ],
    },
    {
      kind: "applyEffects",
      condition: { type: "variable", scope: "entity", name: "isOpen", equals: true },
      effects: [
        { type: "playSound", path: "assets/sounds/effects/window_blinds_close" },
        { type: "setVariable", scope: "entity", name: "isOpen", value: false }
      ],
    },
  ],
};
