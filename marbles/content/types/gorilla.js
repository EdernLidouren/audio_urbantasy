// Bille « gorille » (gorilla). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, pocket, choice } from "../effects.js";
import { LARGE } from "../../config/values.js";

export default {
  apex: [speed(6)],
  // Tic : Vitesse +4 si la bille éjectée est plus petite,
  // puis Empocher une bille de la main au choix.
  hit: [{ ...speed(4), when: { type: "relativeSize", marble: "ejected", is: "smaller" } }, pocket(choice({ zones: ["hand"] }))],
  knockout: [speed(3)],
  size: LARGE,
};
