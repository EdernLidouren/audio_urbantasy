// Bille « grès » (stoneware). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed, draw } from "../effects.js";
import { MEDIUM, SMALL } from "../../config/marbles-values.js";

export default {
  // Base : Vitesse +1 par minibille active (elle-même n'en est pas une).
  base: [{ ...speed(1), per: { type: "activeSize", size: SMALL } }],
  knockout: [draw(1)],
  size: MEDIUM,
};
