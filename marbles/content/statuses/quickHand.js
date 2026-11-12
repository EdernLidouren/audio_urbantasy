// Statut « main vive » (quickHand). Donnée pure : les champs sont décrits dans
// marbles/content/statuses/index.js.

export default {
  // Pioche du début de tour +1 par intensité, 2 tours.
  stacking: "intensity",
  duration: { kind: "turns", count: 2 },
  behaviors: [{ type: "modifier", point: "turnDraw", operation: "add", value: 1 }],
};
