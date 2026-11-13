// Bille « perle » (pearl). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, zoneCount, familyIs, applyStatus } from "../effects.js";
import { SMALL } from "../../config/values.js";

export default {
  // Pointe : Vitesse +2, +1 par bille Brume à la défausse, maximum +6.
  apex: [speed({ base: 2, step: 1, source: zoneCount("discard", familyIs("mist")), max: 6 })],
  base: [speed(1)],
  // Chute : statut amorti (les pertes de Vitesse −1, 3 tours).
  drop: [applyStatus("cushion")],
  size: SMALL,
  families: ["mist"],
  rarity: "rare",
};
