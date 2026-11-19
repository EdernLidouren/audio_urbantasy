// Bille « diable rouge » (red_devil). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, crack, eject, applyStatus, allActive, NEXT_SLOT } from "../effects.js";
import { LARGE } from "../../config/values.js";

export default {
  // Pointe : Vitesse +6 ; statut coup double (ce tour) ; statut usure accélérée (le
  // prochain tour).
  apex: [speed(6), applyStatus("doubleStrike"), applyStatus("acceleratedWear")],
  // Base : Vitesse +3 ; Fêlure 1 à la bille de l'emplacement suivant.
  base: [speed(3), crack(1, NEXT_SLOT)],
  // Final : Éjecter toutes les billes actives (en partance, elle n'en est plus).
  final: [eject(allActive())],
  // Fêlure reçue : Vitesse +2, quand une bille active, elle comprise, est fêlée.
  cracked: [speed(2)],
  // En poche, à chaque bille usée : Masse +1.
  pocketed: { wornMarbles: [mass(1)] },
  size: LARGE,
  families: ["blast"],
  rarity: "legendary",
};
