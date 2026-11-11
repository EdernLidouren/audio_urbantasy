// Bille « tigrée » (tiger). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed, mass } from "../effects.js";
import { MEDIUM } from "../../config/marbles-values.js";

export default {
  base: [speed(3)],
  apex: [speed(-1)],
  awaken: [speed(2)],
  windfall: [speed(3)],
  final: [mass(1)],
  // En poche, à chaque chiquenaude (le mot-clé, chez une bille qui en a une).
  pocketed: { flick: [speed(2)] },
  maxWear: 4,
  size: MEDIUM,
};
