// Bille « boule à neige » (snow_globe). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, bounce, allActive } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  // Pointe : Vitesse +4, puis Rebond de toutes les billes actives, elle comprise.
  apex: [speed(4), bounce(allActive())],
  base: [speed(2)],
  knockout: [mass(2)],
  // En poche, à chaque bille renvoyée par un rebond : Masse +1.
  pocketed: { bouncedMarbles: [mass(1)] },
  size: MEDIUM,
  families: ["mist"],
  rarity: "legendary",
};
