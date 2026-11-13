// Bille « dragon » (dragon). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, zoneCount, familyIs, NEXT_SLOT, PREVIOUS_SLOT } from "../effects.js";
import { LARGE } from "../../config/values.js";

export default {
  // Pointe : Vitesse +4 ; Masse +1 par créature active, maximum +3.
  apex: [speed(4), mass({ base: 0, step: 1, source: zoneCount("triangle", familyIs("bestiary")), max: 3 })],
  base: [speed(3)],
  // Chiquenaude : les billes des emplacements précédent et suivant de celui visé
  // gagnent Vitesse +3.
  flick: [{ ...speed(3), target: PREVIOUS_SLOT }, { ...speed(3), target: NEXT_SLOT }],
  // En poche, à chaque tic.
  pocketed: { hit: [mass(1)] },
  maxWear: 4,
  size: LARGE,
  families: ["bestiary"],
  rarity: "legendary",
};
