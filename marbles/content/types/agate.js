// Bille « agate » (agate). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, pocket, familyCount, slotIs, count, orElse, NEXT_SLOT } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  // Pointe : Vitesse +3 par famille différente sur le triangle et en main, maximum +12.
  apex: [speed({ base: 0, step: 3, source: familyCount(["triangle", "hand"]), max: 12 })],
  base: [mass(1)],
  // Trouvaille : Empocher la bille de l'emplacement suivant ; s'il est vide, Empocher
  // cette bille.
  windfall: [orElse(pocket(NEXT_SLOT), slotIs(NEXT_SLOT, "occupied"), pocket())],
  // En poche, à chaque résolution : Vitesse +2 par famille différente sur le triangle
  // et en main ; Masse +1 s'il y en a au moins 3.
  pocketed: {
    resolution: [
      speed({ base: 0, step: 2, source: familyCount(["triangle", "hand"]) }),
      { ...mass(1), when: count(familyCount(["triangle", "hand"]), { atLeast: 3 }) },
    ],
  },
  maxWear: 4,
  size: MEDIUM,
  families: ["classics"],
  rarity: "rare",
};
