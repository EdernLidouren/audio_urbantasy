// Bille « verre » (glass). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, polish, tally, choice } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  base: [mass(1)],
  apex: [speed({ base: 0, step: 1, source: tally("windfall", "game"), max: 10 })],
  // Tic : Polissage 1 à une bille active au choix.
  hit: [polish(1, choice({ zones: ["triangle"], mode: "optional" }))],
  size: MEDIUM,
};
