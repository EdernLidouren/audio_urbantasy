// Bille « porcelaine » (porcelain). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed } from "../effects.js";
import { SMALL } from "../../config/marbles-values.js";

export default {
  base: [speed(2)],
  apex: [speed(5)],
  final: [speed(4)],
  maxWear: 2,
  size: SMALL,
};
