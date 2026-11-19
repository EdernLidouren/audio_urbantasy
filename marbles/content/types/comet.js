// Bille « comète » (comet). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, draw, zoneCount, count, orElse } from "../effects.js";
import { SMALL } from "../../config/values.js";

export default {
  apex: [speed(3)],
  base: [speed(1)],
  awaken: [draw(1)],
  // Final : Pioche 1 si la main a au plus 3 billes, sinon Vitesse +2.
  final: [orElse(draw(1), count(zoneCount("hand"), { atMost: 3 }), speed(2))],
  // En poche, à chaque mélange : Vitesse +3.
  pocketed: { shuffles: [speed(3)] },
  maxWear: 2,
  size: SMALL,
  families: ["stars"],
  rarity: "uncommon",
};
