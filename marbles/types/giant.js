// Bille « géante » (giant). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed, draw, polish, eject, allActive, sizeIs } from "../effects.js";
import { LARGE, SMALL } from "../../config/marbles-values.js";

export default {
  base: [speed(6)],
  apex: [speed(6)],
  awaken: [polish(1, "apex")],
  // Final : Pioche 1, puis Éjecter toutes les minibilles actives.
  final: [draw(1), eject(allActive(sizeIs(SMALL)))],
  maxWear: 1,
  size: LARGE,
};
