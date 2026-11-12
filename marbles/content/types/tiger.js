// Bille « tigrée » (tiger). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, eject, choice } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  // Base : Éjecter une bille active au choix, pendant la résolution.
  base: [eject(choice({ zones: ["triangle"] }))],
  apex: [speed(-1)],
  awaken: [speed(2)],
  windfall: [speed(3)],
  final: [mass(1)],
  // En poche, à chaque chiquenaude (le mot-clé, chez une bille qui en a une).
  pocketed: { flick: [speed(2)] },
  maxWear: 4,
  size: MEDIUM,
};
