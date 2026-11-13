// Bille « bulle » (bubble). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed } from "../effects.js";
import { SMALL } from "../../config/values.js";

export default {
  apex: [speed(3)],
  base: [speed(1)],
  drop: [speed(2)],
  maxWear: 2,
  size: SMALL,
  families: ["mist"],
  rarity: "common",
};
