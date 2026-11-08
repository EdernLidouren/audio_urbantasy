// Bille « géante » (giant). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed } from "../effects.js";

export default {
  base: [speed(6)],
  apex: [speed(6)],
  maxWear: 1,
  sound: "large",
};
