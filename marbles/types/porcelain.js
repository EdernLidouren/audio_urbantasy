// Bille « porcelaine » (porcelain). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { mass, speed, polish, choice } from "../effects.js";
import { SMALL } from "../../config/marbles-values.js";

export default {
  base: [speed(2)],
  apex: [speed(5)],
  flick: [mass(1)],
  // Final : Vitesse +4, puis Polissage 1 à jusqu'à 2 billes actives au choix.
  final: [speed(4), polish(1, choice({ zones: ["triangle"], count: 2, upTo: true }))],
  pocketed: { entry: [speed(10)] },
  maxWear: 2,
  size: SMALL,
};
