// Bille « œil-de-chat » (cats_eye). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, draw } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  base: [speed(3)],
  baseVariant: { rightBase: [mass(1)] },
  apex: [speed(3)],
  hit: [draw(1)],
  size: MEDIUM,
};
