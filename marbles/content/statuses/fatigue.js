// Statut « fatigue » (fatigue). Donnée pure : les champs sont décrits dans
// marbles/content/statuses/index.js.
export default {
  // Un statut négatif : Lancers −1 par intensité, le prochain tour.
  stacking: "intensity",
  duration: { kind: "nextTurn" },
  behaviors: [{ type: "stat", stat: "throws", amount: -1 }],
};
