// Bille « argile » (clay). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed } from "../effects.js";
import { MEDIUM } from "../../config/marbles-values.js";

export default {
  base: [speed(1)],
  apex: [speed(4)],
  hit: [speed(2)],
  size: MEDIUM,
};
