// Bille « porcelaine » (porcelain). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { mass, speed } from "../effects.js";
import { SMALL } from "../../config/marbles-values.js";

export default {
  base: [speed(2)],
  apex: [speed(5)],
  flick: [mass(1)],
  final: [speed(4)],
  pocketed: { entry: [speed(10)] },
  maxWear: 2,
  size: SMALL,
};
