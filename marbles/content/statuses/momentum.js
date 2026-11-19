// Statut « élan » (momentum). Donnée pure : les champs sont décrits dans
// marbles/content/statuses/index.js.
export default {
  // Lancers +1 par intensité, ce tour : reçu pendant la phase de jeu, le lancer
  // s'ajoute aussitôt à ceux qui restent (une Chiquenaude qui le donne rend le sien).
  stacking: "intensity",
  duration: { kind: "turn" },
  behaviors: [{ type: "stat", stat: "throws", amount: 1 }],
};
