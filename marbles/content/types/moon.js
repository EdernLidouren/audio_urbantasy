// Bille « lune » (moon). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  apex: [speed(3)],
  base: [speed(1)],
  awaken: [speed(1)],
  size: MEDIUM,
  families: ["stars"],
  rarity: "common",
};
