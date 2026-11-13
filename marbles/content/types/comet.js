// Bille « comète » (comet). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, draw } from "../effects.js";
import { SMALL } from "../../config/values.js";

export default {
  apex: [speed(3)],
  base: [speed(1)],
  awaken: [draw(1)],
  // En poche, à chaque mélange.
  pocketed: { shuffles: [speed(3)] },
  maxWear: 2,
  size: SMALL,
  families: ["stars"],
  rarity: "uncommon",
};
