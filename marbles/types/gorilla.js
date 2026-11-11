// Bille « gorille » (gorilla). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed, pocket, FIRST_IN_HAND } from "../effects.js";
import { LARGE } from "../../config/marbles-values.js";

export default {
  apex: [speed(6)],
  // Tic : Vitesse +4 si la bille éjectée est plus petite.
  // puis Empocher la première bille de la main.
  hit: [{ ...speed(4), when: { type: "relativeSize", marble: "ejected", is: "smaller" } }, pocket(FIRST_IN_HAND)],
  knockout: [speed(3)],
  size: LARGE,
};
