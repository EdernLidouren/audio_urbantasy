// Bille « agate » (agate). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { mass, polish } from "../effects.js";

export default {
  base: [mass(1)],
  apex: [mass(2)],
  hit: [mass(1)],
  final: [polish(1, "apex")],
  size: "medium",
  sound: "classic_medium",
};
