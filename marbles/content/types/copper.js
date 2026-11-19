// Bille « cuivre » (copper). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, otherBase } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  apex: [speed(3)],
  // Base : Vitesse égale à la Vitesse que donne la bille de l'autre base (un malus
  // compris ; vide, rien).
  base: [speed({ base: 0, step: 1, source: otherBase("speed") })],
  knockout: [speed(3)],
  // Polissage reçu : Vitesse +3, quand elle-même est polie.
  polished: [speed(3)],
  pocketed: { resolution: [speed(2)] },
  maxWear: 4,
  size: MEDIUM,
  families: ["treasure"],
  rarity: "common",
};
