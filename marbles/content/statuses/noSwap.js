// Statut « échange interdit » (noSwap), une RÈGLE de partie
// (marbles/content/definitions/), utilisable aussi par une bille. Donnée pure : les
// champs sont décrits dans marbles/content/statuses/index.js.
export default {
  // Un VERROU : l'échange est refusé.
  stacking: "unique",
  duration: { kind: "game" },
  behaviors: [{ type: "lock", lock: "swap" }],
};
