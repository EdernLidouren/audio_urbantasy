// Bille « grès » (stoneware). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { activeSize, speed, mass, draw } from "../effects.js";
import { MEDIUM, SMALL } from "../../config/marbles-values.js";

export default {
  // Base : Vitesse +1 par minibille active (elle-même n'en est pas une).
  base: [speed({ base: 0, step: 1, source: activeSize(SMALL) })],
  knockout: [draw(1)],
  // En poche, à chaque bille éjectée du triangle.
  pocketed: { ejectedMarbles: [mass(1)] },
  size: MEDIUM,
};
