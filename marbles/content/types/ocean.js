// Bille « océan » (ocean). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, discard, bounce, retrieve, tally, choice } from "../effects.js";
import { LARGE } from "../../config/values.js";

export default {
  // Pointe : Vitesse +3 par bille défaussée ce tour, maximum +12.
  apex: [speed({ base: 0, step: 3, source: tally("discardedMarbles", "turn"), max: 12 })],
  base: [mass(1)],
  // Tic : Ramasser une bille de la défausse au choix (facultatif).
  hit: [retrieve(choice({ zones: ["discard"], mode: "optional" }))],
  // Chute : Rebond d'une bille active au choix (facultatif).
  drop: [bounce(choice({ zones: ["triangle"], mode: "optional" }))],
  // En poche, à chaque bille défaussée : Masse +1.
  pocketed: { discardedMarbles: [mass(1)] },
  size: LARGE,
  families: ["mist"],
  rarity: "epic",
};
