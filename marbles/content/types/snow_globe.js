// Bille « boule à neige » (snow_globe). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, bounce, allActive } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  // Pointe : Vitesse +4, puis Rebond de toutes les billes actives, elle-même comprise.
  apex: [speed(4), bounce(allActive())],
  base: [speed(2)],
  // En poche, à chaque rebond.
  pocketed: { bounce: [mass(1)] },
  size: MEDIUM,
  families: ["mist"],
  rarity: "legendary",
};
