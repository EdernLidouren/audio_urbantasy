// Bille « dauphin » (dolphin). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, tally } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  apex: [speed(3)],
  // Base : Vitesse +1 par bille éjectée ce tour, maximum +5.
  base: [speed({ base: 0, step: 1, source: tally("ejectedMarbles", "turn"), max: 5 })],
  hit: [speed(3)],
  knockout: [mass(1)],
  // En poche, à chaque tic : Vitesse +3.
  pocketed: { hit: [speed(3)] },
  size: MEDIUM,
  families: ["bestiary"],
  rarity: "uncommon",
};
