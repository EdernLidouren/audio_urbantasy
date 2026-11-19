// Bille « galaxie » (galaxy). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, zoneCount, count, familyIs } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  // Pointe : Vitesse +2 par bille Astres active, maximum +6.
  apex: [speed({ base: 0, step: 2, source: zoneCount("triangle", familyIs("stars")), max: 6 })],
  base: [mass(1)],
  // Chiquenaude : Vitesse +5 et Masse +1 si au moins deux emplacements sont vides :
  // le triangle compte au plus une bille (la galaxie, en cours de lancer, n'y est pas).
  flick: [
    { ...speed(5), when: count(zoneCount("triangle"), { atMost: 1 }) },
    { ...mass(1), when: count(zoneCount("triangle"), { atMost: 1 }) },
  ],
  windfall: [mass(1)],
  size: MEDIUM,
  families: ["stars"],
  rarity: "rare",
};
