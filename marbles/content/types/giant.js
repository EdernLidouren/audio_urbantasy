// Bille « géante » (giant). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, draw, polish, applyStatus } from "../effects.js";
import { LARGE } from "../../config/values.js";

export default {
  base: [speed(6)],
  apex: [speed(6)],
  awaken: [polish(1, "apex")],
  // Final : Pioche 1, puis statut coup double (l'Impact de ce tour doublé).
  final: [draw(1), applyStatus("doubleStrike")],
  maxWear: 1,
  size: LARGE,
};
