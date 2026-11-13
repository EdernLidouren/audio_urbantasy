// Bille « rubis » (ruby). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { mass, polish, zoneCount, applyStatus, NEXT_SLOT } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  // Pointe : Masse +1, +1 par bille dans le pot, maximum +4.
  apex: [mass({ base: 1, step: 1, source: zoneCount("pot"), max: 4 })],
  // Base : Polissage 1 à la bille de l'emplacement suivant.
  base: [polish(1, NEXT_SLOT)],
  // En poche, à l'entrée : statut lustre (les Polissages +1, toute la partie).
  pocketed: { entry: [applyStatus("luster")] },
  maxWear: 4,
  size: MEDIUM,
  families: ["treasure"],
  rarity: "rare",
};
