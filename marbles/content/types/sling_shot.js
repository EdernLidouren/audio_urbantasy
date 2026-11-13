// Bille « bille de fronde » (sling_shot). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed } from "../effects.js";
import { SMALL } from "../../config/values.js";

export default {
  apex: [speed(3)],
  base: [speed(1)],
  // Tic : Vitesse +4 si la bille éjectée est plus grosse.
  hit: [{ ...speed(4), when: { type: "relativeSize", marble: "ejected", is: "larger" } }],
  // En poche, à chaque bille éjectée.
  pocketed: { ejectedMarbles: [speed(1)] },
  maxWear: 2,
  size: SMALL,
  families: ["blast"],
  rarity: "common",
};
