// Bille « étoile » (star). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, tally } from "../effects.js";
import { SMALL } from "../../config/values.js";

export default {
  // Pointe : Vitesse +2 par éveil cette partie, maximum +20.
  apex: [speed({ base: 0, step: 2, source: tally("awaken", "game"), max: 20 })],
  // Base : Masse +1 par mélange cette partie, maximum +3.
  base: [mass({ base: 0, step: 1, source: tally("shuffles", "game"), max: 3 })],
  // En poche, à chaque bille piochée.
  pocketed: { drawnMarbles: [speed(1)] },
  maxWear: 4,
  size: SMALL,
  families: ["stars"],
  rarity: "legendary",
};
