// Bille « œil-de-chat » (cats_eye). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed, mass, draw } from "../effects.js";

export default {
  base: [speed(3)],
  baseVariant: { rightBase: [mass(1)] },
  apex: [speed(3)],
  hit: [draw(1)],
  size: "small",
  sound: "classic_small",
};
