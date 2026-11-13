// Bille « océan » (ocean). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, retrieve, choice, tally } from "../effects.js";
import { LARGE } from "../../config/values.js";

export default {
  // Pointe : Vitesse +2 par bille défaussée ce tour, maximum +8.
  apex: [speed({ base: 0, step: 2, source: tally("discardedMarbles", "turn"), max: 8 })],
  base: [mass(1)],
  // Tic : Ramasser une bille de la défausse au choix (facultatif).
  hit: [retrieve(choice({ zones: ["discard"], mode: "optional" }))],
  // En poche, à chaque bille défaussée.
  pocketed: { discardedMarbles: [speed(1)] },
  size: LARGE,
  families: ["mist"],
  rarity: "epic",
};
