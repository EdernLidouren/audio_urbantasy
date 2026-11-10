// Bille « verre » (glass). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed, mass, polish, tally } from "../effects.js";
import { MEDIUM } from "../../config/marbles-values.js";

export default {
  base: [mass(1)],
  apex: [speed({ base: 0, step: 1, source: tally("windfall", "game"), max: 10 })],
  hit: [polish(1, "apex")],
  size: MEDIUM,
};
