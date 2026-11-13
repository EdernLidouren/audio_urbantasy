// Bille « éclipse » (eclipse). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, applyStatus } from "../effects.js";
import { LARGE } from "../../config/values.js";

export default {
  apex: [mass(2)],
  base: [speed(1)],
  // Éveil : statut main vive (la pioche du début de tour +1, 2 tours).
  awaken: [applyStatus("quickHand")],
  // Trouvaille : statut inspiration (la prochaine Pioche d'un effet +1, une charge).
  windfall: [applyStatus("inspiration")],
  size: LARGE,
  families: ["stars"],
  rarity: "epic",
};
