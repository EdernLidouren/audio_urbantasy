// Statut « fragilité » (brittleness). Donnée pure : les champs sont décrits dans
// marbles/content/statuses/index.js.

export default {
  // Un statut négatif : Fêlures +1 par intensité, 3 tours.
  stacking: "intensity",
  duration: { kind: "turns", count: 3 },
  behaviors: [{ type: "modifier", point: "crack", operation: "add", value: 1 }],
};
