// Bille « vive-argent » (quicksilver). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, polish, pocket } from "../effects.js";
import { SMALL } from "../../config/values.js";

export default {
  apex: [mass(1)],
  base: [speed(2)],
  // Final : Empocher cette bille.
  final: [pocket()],
  // En poche, à chaque polissage : Vitesse +2.
  pocketed: { polish: [speed(2)] },
  size: SMALL,
  families: ["treasure"],
  rarity: "uncommon",
};
