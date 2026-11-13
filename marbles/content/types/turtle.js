// Bille « tortue » (turtle). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { mass, polish, zoneCount, familyIs, zoneIs, NEXT_SLOT } from "../effects.js";
import { LARGE } from "../../config/values.js";

export default {
  // Pointe : Masse +1 par créature (bille Bestiaire) active, maximum +3.
  apex: [mass({ base: 0, step: 1, source: zoneCount("triangle", familyIs("bestiary")), max: 3 })],
  // Base : Polissage 1 à la bille de l'emplacement suivant si le triangle est plein.
  base: [{ ...polish(1, NEXT_SLOT), when: zoneIs("triangle", "full") }],
  // En poche, à chaque résolution : Masse +1 si le triangle est plein.
  pocketed: { resolution: [{ ...mass(1), when: zoneIs("triangle", "full") }] },
  maxWear: 6,
  size: LARGE,
  families: ["bestiary"],
  rarity: "rare",
};
