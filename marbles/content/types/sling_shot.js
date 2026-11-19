// Bille « bille de fronde » (sling_shot). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, zoneCount, sizeIs } from "../effects.js";
import { SMALL } from "../../config/values.js";

export default {
  apex: [speed(3)],
  base: [speed(1)],
  // Tic : Vitesse +4 si la bille éjectée est plus grosse.
  hit: [{ ...speed(4), when: { type: "relativeSize", marble: "ejected", is: "larger" } }],
  // Chute : Vitesse +2 par minibille active.
  drop: [speed({ base: 0, step: 2, source: zoneCount("triangle", sizeIs(SMALL)) })],
  // En poche, à chaque éjection d'une bille normale ou d'un calot : Vitesse +2.
  pocketed: { ejectedBigMarbles: [speed(2)] },
  maxWear: 2,
  size: SMALL,
  families: ["blast"],
  rarity: "common",
};
