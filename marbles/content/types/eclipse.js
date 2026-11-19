// Bille « éclipse » (eclipse). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, draw, applyStatus } from "../effects.js";
import { LARGE } from "../../config/values.js";

export default {
  apex: [mass(2)],
  base: [speed(2)],
  // Éveil : statut main vive (pioche du début de tour +1, 2 tours).
  awaken: [applyStatus("quickHand")],
  // Trouvaille : statut inspiration (la prochaine Pioche d'un effet +1, une charge).
  windfall: [applyStatus("inspiration")],
  final: [draw(2)],
  size: LARGE,
  families: ["stars"],
  rarity: "epic",
};
