// Statut « amorti » (cushion). Donnée pure : les champs sont décrits dans
// marbles/content/statuses/index.js.
export default {
  // Les pertes de Vitesse réduites de 1 par intensité, 3 tours.
  stacking: "intensity",
  duration: { kind: "turns", count: 3 },
  behaviors: [{ type: "modifier", point: "speedLoss", operation: "add", value: -1 }],
};
