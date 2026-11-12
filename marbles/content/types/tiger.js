// Bille « tigrée » (tiger). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, eject, choice, applyStatus } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  // Base : Éjecter une bille active au choix, pendant la résolution.
  base: [eject(choice({ zones: ["triangle"], mode: "required" }))],
  apex: [speed(-1)],
  awaken: [speed(2)],
  windfall: [speed(3)],
  // Final : statut amorti, 3 tours (les pertes de Vitesse réduites de 1).
  final: [applyStatus("cushion")],
  // En poche, à chaque chiquenaude (le mot-clé, chez une bille qui en a une).
  pocketed: { flick: [speed(2)] },
  maxWear: 4,
  size: MEDIUM,
};
