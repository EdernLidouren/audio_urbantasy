// Bille « pierre de sang » (bloodstone). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, pocket, applyStatus } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  apex: [speed(3), mass(1)],
  base: [mass(1)],
  // Final : Empocher cette bille.
  final: [pocket()],
  pocketed: {
    // À l'entrée : statut poche profonde, intensité 2 (capacité du pot +2).
    entry: [applyStatus("deepPocket", { intensity: 2 })],
    // À chaque bille mise en poche : Masse +1.
    pocketedMarbles: [mass(1)],
  },
  size: MEDIUM,
  families: ["treasure"],
  rarity: "legendary",
};
