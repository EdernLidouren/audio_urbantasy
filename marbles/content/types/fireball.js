// Bille « boule de feu » (fireball). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  apex: [speed(5)],
  base: [speed(2)],
  final: [speed(6)],
  // En poche, à chaque final.
  pocketed: { final: [speed(2)] },
  maxWear: 2,
  size: MEDIUM,
  families: ["blast"],
  rarity: "uncommon",
};
