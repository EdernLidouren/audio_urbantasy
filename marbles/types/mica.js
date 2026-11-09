// Bille « mica » (mica). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed, draw } from "../effects.js";

export default {
  base: [draw(1)],
  apex: [speed(2)],
  maxWear: 3,
  size: "small",
  sound: "classic_small",
};
