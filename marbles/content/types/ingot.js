// Bille « lingotin » (ingot). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, pocket, zoneIs, choice } from "../effects.js";
import { LARGE } from "../../config/values.js";

export default {
  apex: [speed(4), mass(1)],
  base: [mass(1)],
  // Tic : Empocher une bille de la main au choix (facultatif).
  hit: [pocket(choice({ zones: ["hand"], mode: "optional" }))],
  // En poche, à chaque résolution : Masse +1 si le pot est plein.
  pocketed: { resolution: [{ ...mass(1), when: zoneIs("pot", "full") }] },
  maxWear: 5,
  size: LARGE,
  families: ["treasure"],
  rarity: "epic",
};
