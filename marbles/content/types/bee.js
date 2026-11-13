// Bille « abeille » (bee). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, NEXT_SLOT } from "../effects.js";
import { SMALL } from "../../config/values.js";

export default {
  apex: [speed(3)],
  // Base : la bille de l'emplacement suivant gagne Vitesse +1.
  base: [{ ...speed(1), target: NEXT_SLOT }],
  // En poche, à chaque base.
  pocketed: { base: [speed(1)] },
  size: SMALL,
  families: ["bestiary"],
  rarity: "common",
};
