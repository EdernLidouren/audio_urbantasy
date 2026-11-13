// Bille « galaxie » (galaxy). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, zoneCount, familyIs } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  // Pointe : Vitesse +2 par bille Astres active (elle-même comprise), maximum +6.
  apex: [speed({ base: 0, step: 2, source: zoneCount("triangle", familyIs("stars")), max: 6 })],
  base: [speed(1)],
  windfall: [mass(1)],
  size: MEDIUM,
  families: ["stars"],
  rarity: "rare",
};
