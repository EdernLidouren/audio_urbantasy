// Bille « argile » (clay). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, turnsInHand, zoneIs, applyStatus, NEXT_SLOT } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  // Base : Vitesse +2 à la bille de l'emplacement suivant (en base droite, la base
  // gauche ; en base gauche, la pointe).
  base: [{ ...speed(2), target: NEXT_SLOT }],
  // Pointe : Vitesse +6 si le triangle est plein.
  apex: [{ ...speed(6), when: zoneIs("triangle", "full") }],
  // Vitesse +0, +1 par tour en main, maximum +5.
  flick: [speed({ base: 0, step: 1, source: turnsInHand(), max: 5 })],
  // Tic : statut lancer supplémentaire, le prochain tour.
  hit: [applyStatus("extraThrow")],
  size: MEDIUM,
};
