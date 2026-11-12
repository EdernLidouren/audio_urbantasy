// Bille « argile » (clay). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, turnsInHand } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  base: [speed(1)],
  apex: [speed(4)],
  // Vitesse +0, +1 par tour en main, maximum +5.
  flick: [speed({ base: 0, step: 1, source: turnsInHand(), max: 5 })],
  hit: [speed(2)],
  size: MEDIUM,
};
