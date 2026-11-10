// Bille « mica » (mica). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed, draw, polish } from "../effects.js";
import { SMALL } from "../../config/marbles-values.js";

export default {
  base: [draw(1)],
  apex: [speed(2), polish(1)],
  // Éjection : Pioche 1 si la bille posée est plus grosse.
  knockout: [{ ...draw(1), when: { type: "relativeSize", marble: "placed", is: "larger" } }],
  maxWear: 3,
  size: SMALL,
};
