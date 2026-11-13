// Bille « vive-argent » (quicksilver). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, pocket } from "../effects.js";
import { SMALL } from "../../config/values.js";

export default {
  apex: [mass(1)],
  base: [speed(2)],
  // Final : elle s'empoche elle-même, au pot plutôt qu'à la défausse.
  final: [pocket()],
  // En poche, à chaque polissage.
  pocketed: { polish: [speed(2)] },
  size: SMALL,
  families: ["treasure"],
  rarity: "uncommon",
};
