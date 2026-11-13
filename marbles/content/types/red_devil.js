// Bille « diable rouge » (red_devil). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, crack, applyStatus, NEXT_SLOT } from "../effects.js";
import { LARGE } from "../../config/values.js";

export default {
  // Pointe : Vitesse +6, statut coup double (l'Impact de ce tour doublé), statut
  // usure accélérée (l'usure de phase +1, le prochain tour).
  apex: [speed(6), applyStatus("doubleStrike"), applyStatus("acceleratedWear")],
  // Base : Vitesse +3, Fêlure 1 à la bille de l'emplacement suivant.
  base: [speed(3), crack(1, NEXT_SLOT)],
  // En poche, à chaque bille usée.
  pocketed: { wornMarbles: [speed(2)] },
  size: LARGE,
  families: ["blast"],
  rarity: "legendary",
};
