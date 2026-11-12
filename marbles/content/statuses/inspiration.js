// Statut « inspiration » (inspiration). Donnée pure : les champs sont décrits dans
// marbles/content/statuses/index.js.

export default {
  // Pioches par effet +1 : une charge, qui s'ajoute à chaque nouvelle application.
  stacking: "duration",
  duration: { kind: "charges", count: 1 },
  behaviors: [{ type: "modifier", point: "effectDraw", operation: "add", value: 1 }],
};
