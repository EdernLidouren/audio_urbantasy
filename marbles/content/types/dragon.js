// Bille « dragon » (dragon). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, pocket, zoneCount, wear, count, familyIs, KNOCKED_OUT } from "../effects.js";
import { LARGE } from "../../config/values.js";

export default {
  // Pointe : Vitesse +4 ; Masse +1 par bille Bestiaire active, maximum +3.
  apex: [speed(4), mass({ base: 0, step: 1, source: zoneCount("triangle", familyIs("bestiary")), max: 3 })],
  // Base : Vitesse +1 par bille en main, maximum +3.
  base: [speed({ base: 0, step: 1, source: zoneCount("hand"), max: 3 })],
  // Tic : si la bille éjectée était à un point de son usure maximale, Vitesse +7,
  // Masse +2, et Empocher la bille éjectée (en partance, redirigée vers le pot).
  hit: [
    { ...speed(7), when: count(wear({ marble: "ejected", remaining: true }), { atMost: 1 }) },
    { ...mass(2), when: count(wear({ marble: "ejected", remaining: true }), { atMost: 1 }) },
    { ...pocket(KNOCKED_OUT), when: count(wear({ marble: "ejected", remaining: true }), { atMost: 1 }) },
  ],
  // En poche, à chaque tic : Masse +1.
  pocketed: { hit: [mass(1)] },
  maxWear: 4,
  size: LARGE,
  families: ["bestiary"],
  rarity: "legendary",
};
