// Statut « un lancer de moins » (oneThrowLess), une RÈGLE de partie
// (marbles/content/definitions/). Donnée pure : les champs sont décrits dans
// marbles/content/statuses/index.js.
export default {
  // Lancers −1, toute la partie.
  stacking: "unique",
  duration: { kind: "game" },
  behaviors: [{ type: "stat", stat: "throws", amount: -1 }],
};
