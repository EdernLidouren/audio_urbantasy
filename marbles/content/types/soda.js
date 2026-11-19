// Bille « soda » (soda). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, applyStatus, zoneCount, turnsOnTriangle, count, allOf, sizeIs, orElse } from "../effects.js";
import { SMALL, MEDIUM, LARGE } from "../../config/values.js";

export default {
  // Pointe : Vitesse +1 par bille dans le sac, maximum +7.
  apex: [speed({ base: 0, step: 1, source: zoneCount("bag"), max: 7 })],
  // Base : Masse +3 si les deux autres billes actives sont une minibille et un calot
  // (le soda n'est ni l'un ni l'autre), sinon Masse +1.
  base: [
    orElse(
      mass(3),
      allOf(count(zoneCount("triangle", sizeIs(SMALL)), { atLeast: 1 }), count(zoneCount("triangle", sizeIs(LARGE)), { atLeast: 1 })),
      mass(1)
    ),
  ],
  // Chiquenaude : statut élan (lancers +1, ce tour) : sa pose ne coûte rien.
  flick: [applyStatus("momentum")],
  // Final : Vitesse +2 par tour passé sur le triangle, maximum +10 ; Masse +2 s'il y
  // en a au moins 4 (la Vitesse atteint alors +8).
  final: [
    speed({ base: 0, step: 2, source: turnsOnTriangle(), max: 10 }),
    { ...mass(2), when: count(turnsOnTriangle(), { atLeast: 4 }) },
  ],
  // En poche, à chaque chiquenaude : Vitesse +3.
  pocketed: { flick: [speed(3)] },
  maxWear: 5,
  size: MEDIUM,
  families: ["classics"],
  rarity: "legendary",
};
