// Bille « abeille » (bee). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, crack, pocket, zoneCount, familyAt, marbleAt, replacementSize, count, not, marbleIs, orElse, NEXT_SLOT, PREVIOUS_SLOT } from "../effects.js";
import { SMALL, MEDIUM, LARGE } from "../../config/values.js";

export default {
  // Pointe : Empocher cette bille si la bille de l'emplacement précédent est une
  // abeille, sinon Vitesse +3.
  apex: [orElse(pocket(), marbleAt(PREVIOUS_SLOT, "bee"), speed(3))],
  // Base : Vitesse +2 ; Fêlure 1 à la bille de l'emplacement suivant si elle n'est
  // pas de la famille Bestiaire.
  base: [speed(2), { ...crack(1, NEXT_SLOT), when: not(familyAt(NEXT_SLOT, "bestiary")) }],
  // Tic : Vitesse +3 si la bille éjectée est un calot, +2 si c'est une bille
  // normale, sinon +1.
  hit: [orElse(speed(3), replacementSize("ejected", LARGE), orElse(speed(2), replacementSize("ejected", MEDIUM), speed(1)))],
  // En poche, à chaque résolution : Vitesse +2 par abeille dans le pot ; Masse +1 si
  // le pot en compte au moins 3.
  pocketed: {
    resolution: [
      speed({ base: 0, step: 2, source: zoneCount("pot", marbleIs("bee")) }),
      { ...mass(1), when: count(zoneCount("pot", marbleIs("bee")), { atLeast: 3 }) },
    ],
  },
  size: SMALL,
  families: ["bestiary"],
  rarity: "common",
};
