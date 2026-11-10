// Bille « géante » (giant). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed, draw } from "../effects.js";

export default {
  base: [speed(6)],
  apex: [speed(6)],
  final: [draw(1)],
  maxWear: 1,
  size: "large",
  sound: "classic_large",
};
