// Bille « argile » (clay). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  apex: [speed(4)],
  base: [speed(1)],
  size: MEDIUM,
  families: ["classics"],
  rarity: "common",
};
