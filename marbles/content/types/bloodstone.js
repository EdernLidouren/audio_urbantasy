// Bille « pierre de sang » (bloodstone). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, pocket, applyStatus } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  apex: [speed(3)],
  base: [mass(1)],
  // Final : elle s'empoche elle-même.
  final: [pocket()],
  // En poche : à l'entrée, statut poche profonde d'intensité 2 (le pot +2, toute la
  // partie) ; à chaque bille mise en poche, Masse +1.
  pocketed: { entry: [applyStatus("deepPocket", { intensity: 2 })], pocketedMarbles: [mass(1)] },
  size: MEDIUM,
  families: ["treasure"],
  rarity: "legendary",
};
