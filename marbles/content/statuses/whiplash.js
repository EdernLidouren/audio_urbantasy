// Statut « coup de fouet » (whiplash). Donnée pure : les champs sont décrits dans
// marbles/content/statuses/index.js.
export default {
  // Le prochain gain de Vitesse doublé : une charge, qui s'ajoute à chaque nouvelle
  // application.
  stacking: "duration",
  duration: { kind: "charges", count: 1 },
  behaviors: [{ type: "modifier", point: "speedGain", operation: "multiply", value: 2 }],
};
