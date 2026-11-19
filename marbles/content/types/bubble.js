// Bille « bulle » (bubble). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, wear, statIs, orElse } from "../effects.js";
import { SMALL } from "../../config/values.js";

export default {
  apex: [speed(3)],
  // Base : Vitesse +4 si la Masse est d'au plus 1, sinon Vitesse +1.
  base: [orElse(speed(4), statIs("mass", { atMost: 1 }), speed(1))],
  // Chute : Vitesse +5, −1 par point d'usure qu'elle avait en partant.
  drop: [speed({ base: 5, step: -1, source: wear() })],
  maxWear: 2,
  size: SMALL,
  families: ["mist"],
  rarity: "common",
};
