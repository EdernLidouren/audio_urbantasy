// Statut « coup double » (doubleStrike). Donnée pure : les champs sont décrits dans
// marbles/content/statuses/index.js.
export default {
  // L'Impact du tour doublé, après son calcul habituel. Unique, ce tour.
  stacking: "unique",
  duration: { kind: "turn" },
  behaviors: [{ type: "modifier", point: "impact", operation: "multiply", value: 2 }],
};
