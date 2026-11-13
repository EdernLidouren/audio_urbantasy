// Bille « fantôme » (ghost). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, bounce, turnsInHand } from "../effects.js";
import { SMALL } from "../../config/values.js";

export default {
  apex: [speed(3)],
  base: [speed(1)],
  // Chiquenaude : Vitesse +1 par tour en main, maximum +3.
  flick: [speed({ base: 0, step: 1, source: turnsInHand(), max: 3 })],
  // Final : Rebond sur elle-même, en main plutôt qu'à la défausse.
  final: [bounce()],
  maxWear: 2,
  size: SMALL,
  families: ["mist"],
  rarity: "uncommon",
};
