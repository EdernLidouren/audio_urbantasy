// Bille « dauphin » (dolphin). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  apex: [speed(3)],
  base: [speed(1)],
  hit: [speed(3)],
  // En poche, à chaque bille tiquée.
  pocketed: { hitMarbles: [speed(1)] },
  size: MEDIUM,
  families: ["bestiary"],
  rarity: "uncommon",
};
