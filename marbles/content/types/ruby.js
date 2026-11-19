// Bille « rubis » (ruby). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, polish, applyStatus, zoneCount, slotIs, NEXT_SLOT } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  // Pointe : Masse +1, +1 par bille dans le pot, maximum +4.
  apex: [mass({ base: 1, step: 1, source: zoneCount("pot"), max: 4 })],
  // Base : Polissage 1 à la bille de l'emplacement suivant ; Vitesse −2 si cet
  // emplacement est vide (les deux ne jouent jamais ensemble : la famille punit un
  // triangle à trous).
  base: [polish(1, NEXT_SLOT), { ...speed(-2), when: slotIs(NEXT_SLOT, "empty") }],
  // En poche, à l'entrée : statut lustre (les Polissages +1, toute la partie).
  pocketed: { entry: [applyStatus("luster")] },
  maxWear: 4,
  size: MEDIUM,
  families: ["treasure"],
  rarity: "rare",
};
