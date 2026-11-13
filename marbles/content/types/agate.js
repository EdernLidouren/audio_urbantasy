// Bille « agate » (agate). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, familyCount } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  // Pointe : Vitesse +2 par famille différente sur le triangle, maximum +6.
  apex: [speed({ base: 0, step: 2, source: familyCount(), max: 6 })],
  base: [mass(1)],
  // En poche, à chaque résolution : Vitesse +1 par famille différente sur le
  // triangle, maximum +3.
  pocketed: { resolution: [speed({ base: 0, step: 1, source: familyCount(), max: 3 })] },
  maxWear: 4,
  size: MEDIUM,
  families: ["classics"],
  rarity: "rare",
};
