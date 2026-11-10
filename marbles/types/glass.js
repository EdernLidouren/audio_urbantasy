// Bille « verre » (glass). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed, mass, polish } from "../effects.js";
import { MEDIUM } from "../../config/marbles-values.js";

export default {
  base: [mass(1)],
  apex: [speed(2)],
  hit: [polish(1, "apex")],
  size: MEDIUM,
};
