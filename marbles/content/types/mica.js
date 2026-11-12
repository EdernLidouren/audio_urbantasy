// Bille « mica » (mica). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, draw, polish, bounce } from "../effects.js";
import { SMALL } from "../../config/values.js";

export default {
  // Éveil : Pioche 1, qui peut éveiller la bille suivante.
  awaken: [draw(1)],
  base: [draw(1)],
  apex: [speed(2), polish(1)],
  // Éjection : Pioche 1 si la bille posée est plus grosse.
  knockout: [{ ...draw(1), when: { type: "relativeSize", marble: "placed", is: "larger" } }],
  // Final : Rebond sur elle-même, en partance : elle revient en main au lieu de la
  // défausse (main pleine : la défausse, et sa Chute, qu'elle n'a pas).
  final: [bounce()],
  // En poche, à chaque mélange du sac : Polissage 1 à la pointe.
  pocketed: { shuffles: [polish(1, "apex")] },
  maxWear: 3,
  size: SMALL,
};
