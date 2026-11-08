// Bille « loupe » (magnifier). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed } from "../effects.js";

export default {
  base: [speed(1)],
  // En base gauche, renforce la pointe si elle donne de la Vitesse.
  baseVariant: {
    leftBase: [{ ...speed(4), target: "apex", when: { type: "printedStat", slot: "apex", stat: "speed", atLeast: 1 } }],
  },
  apex: [speed(2)],
  sound: "medium",
};
