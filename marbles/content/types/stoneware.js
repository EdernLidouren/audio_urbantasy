// Bille « grès » (stoneware). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { activeSize, speed, mass, discard, choice, applyStatus } from "../effects.js";
import { MEDIUM, SMALL } from "../../config/values.js";

export default {
  // Base : Vitesse +1 par minibille active (elle-même n'en est pas une).
  base: [speed({ base: 0, step: 1, source: activeSize(SMALL) })],
  // Éjection : statut main vive (la pioche du début de tour +1, 2 tours).
  knockout: [applyStatus("quickHand")],
  // Tic : Défausser une bille de la main au choix.
  hit: [discard(choice({ zones: ["hand"], mode: "optional" }))],
  // En poche, à chaque bille éjectée du triangle.
  pocketed: { ejectedMarbles: [mass(1)] },
  size: MEDIUM,
};
