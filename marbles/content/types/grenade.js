// Bille « grenade » (grenade). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, crack, eject, choice, allActive, sizeIs } from "../effects.js";
import { SMALL, MEDIUM } from "../../config/values.js";

export default {
  apex: [speed(5)],
  base: [speed(2)],
  // Chiquenaude : Fêlure 1 à jusqu'à 2 billes actives au choix (facultatif).
  flick: [crack(1, choice({ zones: ["triangle"], count: 2, mode: "optional" }))],
  // Final : Vitesse +4, puis Éjecter toutes les minibilles actives.
  final: [speed(4), eject(allActive(sizeIs(SMALL)))],
  maxWear: 2,
  size: MEDIUM,
  families: ["blast"],
  rarity: "epic",
};
