// Statut « usure accélérée » (acceleratedWear). Donnée pure : les champs sont décrits dans
// marbles/content/statuses/index.js.

export default {
  // Un statut négatif : usure de phase +1 par intensité, le prochain tour.
  stacking: "intensity",
  duration: { kind: "nextTurn" },
  behaviors: [{ type: "modifier", point: "phaseWear", operation: "add", value: 1 }],
};
