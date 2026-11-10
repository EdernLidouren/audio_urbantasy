// Bille « plombée » (leaded). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { crack, speed, mass } from "../effects.js";
import { LARGE } from "../../config/marbles-values.js";

export default {
  base: [mass(2)],
  apex: [speed(-3)],
  flick: [crack(3, "apex")],
  knockout: [mass(1)],
  size: LARGE,
};
