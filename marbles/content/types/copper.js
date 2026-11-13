// Bille « cuivre » (copper). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  apex: [speed(3)],
  base: [speed(1)],
  pocketed: { resolution: [speed(1)] },
  maxWear: 4,
  size: MEDIUM,
  families: ["treasure"],
  rarity: "common",
};
