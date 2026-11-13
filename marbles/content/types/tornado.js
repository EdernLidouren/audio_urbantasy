// Bille « tornade » (tornado). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, eject, tally, sizeAt, NEXT_SLOT } from "../effects.js";
import { SMALL, MEDIUM } from "../../config/values.js";

export default {
  // Pointe : Vitesse +3, +2 par bille éjectée ce tour, maximum +11.
  apex: [speed({ base: 3, step: 2, source: tally("ejectedMarbles", "turn"), max: 11 })],
  // Base : Éjecter la bille de l'emplacement suivant si c'est une minibille.
  base: [{ ...eject(NEXT_SLOT), when: sizeAt(NEXT_SLOT, SMALL) }],
  // En poche, à chaque éjection par effet.
  pocketed: { eject: [speed(2)] },
  size: MEDIUM,
  families: ["blast"],
  rarity: "rare",
};
