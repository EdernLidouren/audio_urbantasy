// Bille « mica » (mica). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, draw, polish } from "../effects.js";
import { SMALL } from "../../config/values.js";

export default {
  // Éveil : Pioche 1, qui peut éveiller la bille suivante.
  awaken: [draw(1)],
  base: [draw(1)],
  apex: [speed(2), polish(1)],
  // Éjection : Pioche 1 si la bille posée est plus grosse.
  knockout: [{ ...draw(1), when: { type: "relativeSize", marble: "placed", is: "larger" } }],
  // En poche, à chaque mélange du sac : Polissage 1 à la pointe.
  pocketed: { shuffles: [polish(1, "apex")] },
  maxWear: 3,
  size: SMALL,
};
