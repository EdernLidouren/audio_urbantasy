// Statut « lustre » (luster). Donnée pure : les champs sont décrits dans
// marbles/content/statuses/index.js.

export default {
  // Polissages +1 par intensité, toute la partie.
  stacking: "intensity",
  duration: { kind: "game" },
  behaviors: [{ type: "modifier", point: "polish", operation: "add", value: 1 }],
};
