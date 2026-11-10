// Bille « gorille » (gorilla). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed } from "../effects.js";
import { LARGE } from "../../config/marbles-values.js";

export default {
  apex: [speed(6)],
  // Tic : Vitesse +4 si la bille éjectée est plus petite.
  hit: [{ ...speed(4), when: { type: "relativeSize", marble: "ejected", is: "smaller" } }],
  knockout: [speed(3)],
  size: LARGE,
};
