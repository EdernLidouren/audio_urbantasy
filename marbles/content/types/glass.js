// Bille « verre » (glass). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, polish, tally, choice, zoneCount } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  // Base : Vitesse +1 par bille en main, maximum +5.
  base: [speed({ base: 0, step: 1, source: zoneCount("hand"), max: 5 })],
  apex: [speed({ base: 0, step: 1, source: tally("windfall", "game"), max: 10 })],
  // Tic : Polissage 1 à une bille active au choix.
  hit: [polish(1, choice({ zones: ["triangle"], mode: "optional" }))],
  size: MEDIUM,
};
