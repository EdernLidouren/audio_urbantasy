// Bille « porcelaine » (porcelain). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed } from "../effects.js";

export default {
  base: [speed(2)],
  apex: [speed(5)],
  maxWear: 2,
  sound: "small",
};
