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
  maxWear: 4,
  size: MEDIUM,
};
