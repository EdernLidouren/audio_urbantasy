// Bille « loupe » (magnifier). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, tally, discard, nextInBag, applyStatus } from "../effects.js";
import { SMALL } from "../../config/values.js";

export default {
  // Sa Chiquenaude se compte elle-même : la première du tour lit 1.
  flick: [speed({ base: 0, step: 2, source: tally("flick", "turn"), max: 6 })],
  base: [speed(1)],
  // En base gauche, renforce la pointe si elle donne de la Vitesse.
  baseVariant: {
    leftBase: [{ ...speed(4), target: "apex", when: { type: "printedStat", slot: "apex", stat: "speed", atLeast: 1 } }],
  },
  // Pointe : Vitesse +2, puis Défausser la prochaine bille du sac.
  apex: [speed(2), discard(nextInBag(1))],
  // Éjection : statut fatigue, un lancer de moins le prochain tour (le Final de la
  // géante ne la déclenche plus : il ne l'éjecte plus).
  knockout: [applyStatus("fatigue")],
  size: SMALL,
};
