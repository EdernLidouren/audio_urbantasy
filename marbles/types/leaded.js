// Bille « plombée » (leaded). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed, mass } from "../effects.js";
import { LARGE } from "../../config/marbles-values.js";

export default {
  base: [mass(2)],
  apex: [speed(-3)],
  knockout: [mass(1)],
  size: LARGE,
};
