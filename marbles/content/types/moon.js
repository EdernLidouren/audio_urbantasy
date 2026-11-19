// Bille « lune » (moon). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, zoneCount, count, sizeIs, orElse } from "../effects.js";
import { MEDIUM, LARGE } from "../../config/values.js";

export default {
  apex: [speed(3)],
  // Base : Vitesse +3 si une autre bille active est un calot (la lune n'en est pas
  // un), sinon Vitesse +1.
  base: [orElse(speed(3), count(zoneCount("triangle", sizeIs(LARGE)), { atLeast: 1 }), speed(1))],
  awaken: [speed(3)],
  hit: [speed(2)],
  knockout: [speed(2)],
  size: MEDIUM,
  families: ["stars"],
  rarity: "common",
};
