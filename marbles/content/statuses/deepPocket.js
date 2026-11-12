// Statut « poche profonde » (deepPocket). Donnée pure : les champs sont décrits dans
// marbles/content/statuses/index.js.
export default {
  // Capacité du pot +1 par intensité, toute la partie.
  stacking: "intensity",
  duration: { kind: "game" },
  behaviors: [{ type: "stat", stat: "potCapacity", amount: 1 }],
};
