// Statut « ferveur » (fervor). Donnée pure : les champs sont décrits dans
// marbles/content/statuses/index.js.
import { speed } from "../effects.js";

export default {
  // À chaque chiquenaude (le mot-clé, chez une bille qui en a une) : Vitesse +2.
  // Unique, 2 tours.
  stacking: "unique",
  duration: { kind: "turns", count: 2 },
  behaviors: [{ type: "reaction", on: "flick", effect: [speed(2)] }],
};
