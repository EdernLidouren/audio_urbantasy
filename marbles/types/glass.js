// Bille « verre » (glass). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed, mass } from "../effects.js";

export default {
  base: [mass(1)],
  apex: [speed(2)],
  sound: "small",
};
