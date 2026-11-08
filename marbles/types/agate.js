// Bille « agate » (agate). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { mass } from "../effects.js";

export default {
  base: [mass(1)],
  apex: [mass(2)],
  hit: [mass(1)],
  sound: "medium",
};
