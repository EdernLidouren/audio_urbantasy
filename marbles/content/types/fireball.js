// Bille « boule de feu » (fireball). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, turnStat, KNOCKED_OUT } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  apex: [speed(5)],
  base: [speed(2)],
  // Tic : si l'effet de la bille éjectée donne au moins Masse +1, Vitesse égale à la
  // Vitesse du tour (elle double), maximum +8.
  hit: [{ ...speed({ base: 0, step: 1, source: turnStat("speed"), max: 8 }), when: { type: "printedStat", slot: KNOCKED_OUT, stat: "mass", atLeast: 1 } }],
  final: [speed(6)],
  // En poche, à chaque final : Masse +1.
  pocketed: { final: [mass(1)] },
  maxWear: 2,
  size: MEDIUM,
  families: ["blast"],
  rarity: "uncommon",
};
