// Bille « loupe » (magnifier). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, tally } from "../effects.js";
import { SMALL } from "../../config/values.js";

export default {
  // Sa Chiquenaude se compte elle-même : la première du tour lit 1.
  flick: [speed({ base: 0, step: 2, source: tally("flick", "turn"), max: 6 })],
  base: [speed(1)],
  // En base gauche, renforce la pointe si elle donne de la Vitesse.
  baseVariant: {
    leftBase: [{ ...speed(4), target: "apex", when: { type: "printedStat", slot: "apex", stat: "speed", atLeast: 1 } }],
  },
  apex: [speed(2)],
  // Éjection : Vitesse +3 (le Final de la géante la déclenche).
  knockout: [speed(3)],
  size: SMALL,
};
