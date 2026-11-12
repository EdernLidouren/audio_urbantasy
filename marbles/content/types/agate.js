// Bille « agate » (agate). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { mass, polish, pocket, zoneIs } from "../effects.js";
import { LARGE, MEDIUM } from "../../config/values.js";

export default {
  base: [mass(1)],
  // Pointe : Masse +1, et Masse +2 si la base gauche est un calot.
  apex: [mass(1), { ...mass(2), when: { type: "sizeAt", slot: "leftBase", size: LARGE } }],
  hit: [mass(1)],
  windfall: [polish(1)],
  // Final : Polissage 1 à la pointe, puis elle s'empoche, depuis la défausse.
  final: [polish(1, "apex"), pocket()],
  // En poche, à chaque résolution : Masse +2 si le pot est plein.
  pocketed: { resolution: [{ ...mass(2), when: zoneIs("pot", "full") }] },
  size: MEDIUM,
};
