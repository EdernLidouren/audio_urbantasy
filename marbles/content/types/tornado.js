// Bille « tornade » (tornado). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, draw, pocket, bounce, tally, zoneCount, replacementSize, count, not, sizeIs, orElse, KNOCKED_OUT } from "../effects.js";
import { MEDIUM, LARGE } from "../../config/values.js";

export default {
  // Pointe : Vitesse +3, +2 par bille éjectée ce tour, maximum +11.
  apex: [speed({ base: 3, step: 2, source: tally("ejectedMarbles", "turn"), max: 11 })],
  // Base : Empocher cette bille si les deux autres billes actives sont des calots (la
  // tornade n'en est pas un), sinon Vitesse +3.
  base: [orElse(pocket(), count(zoneCount("triangle", sizeIs(LARGE)), { atLeast: 2 }), speed(3))],
  // Tic : Rebond de la bille éjectée si elle n'est pas un calot.
  hit: [{ ...bounce(KNOCKED_OUT), when: not(replacementSize("ejected", LARGE)) }],
  knockout: [draw(1)],
  // En poche, à chaque bille éjectée par un effet : Vitesse +2.
  pocketed: { effectEjectedMarbles: [speed(2)] },
  size: MEDIUM,
  families: ["blast"],
  rarity: "rare",
};
