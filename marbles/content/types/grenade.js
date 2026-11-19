// Bille « grenade » (grenade). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, crack, bounce, zoneCount, count, sizeIs, choice } from "../effects.js";
import { MEDIUM, LARGE } from "../../config/values.js";

export default {
  apex: [speed(5)],
  base: [speed(2)],
  // Chiquenaude : Fêlure 1 à jusqu'à 2 billes actives au choix (facultatif).
  flick: [crack(1, choice({ zones: ["triangle"], count: 2, mode: "optional" }))],
  // Éjection : Rebond de cette bille.
  knockout: [bounce()],
  // Final : Vitesse +4 ; Masse +1 par calot actif.
  final: [speed(4), mass({ base: 0, step: 1, source: zoneCount("triangle", sizeIs(LARGE)) })],
  maxWear: 2,
  size: MEDIUM,
  families: ["blast"],
  rarity: "epic",
};
