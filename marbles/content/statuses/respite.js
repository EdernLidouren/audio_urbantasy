// Statut « répit » (respite). Donnée pure : les champs sont décrits dans
// marbles/content/statuses/index.js.

export default {
  // Usure de phase ×0 : les billes jouent leur phase sans s'user. Unique, ce tour.
  stacking: "unique",
  duration: { kind: "turn" },
  behaviors: [{ type: "modifier", point: "phaseWear", operation: "multiply", value: 0 }],
};
