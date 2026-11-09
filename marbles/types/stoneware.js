// Bille « grès » (stoneware). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed, draw } from "../effects.js";

export default {
  base: [speed(2)],
  knockout: [draw(1)],
  size: "medium",
  sound: "classic_medium",
};
