// Bille « sulfure » (sulphide). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { mass, crack } from "../effects.js";
import { LARGE } from "../../config/marbles-values.js";

export default {
  base: [crack(1, "apex")],
  apex: [mass(3)],
  windfall: [crack(1, "rightBase")],
  size: LARGE,
};
