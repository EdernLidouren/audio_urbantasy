// Statut « pot inerte » (inertPot), une RÈGLE de partie
// (marbles/content/definitions/). Donnée pure : les champs sont décrits dans
// marbles/content/statuses/index.js.
export default {
  // Un VERROU : les billes du pot n'agissent plus (entrée, résolution, réactions).
  stacking: "unique",
  duration: { kind: "game" },
  behaviors: [{ type: "lock", lock: "pot" }],
};
