// Bille « œil-de-chat » (cats_eye). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, zoneCount, zoneIs, sizeIs } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  apex: [speed(3)],
  // Base : Vitesse +3 en base gauche, Masse +1 en base droite.
  baseVariant: { leftBase: [speed(3)], rightBase: [mass(1)] },
  hit: [mass(1)],
  // Éveil : Vitesse +2 par bille normale en main et sur le triangle (elle comprise),
  // maximum +8.
  awaken: [speed({ base: 0, step: 2, source: zoneCount(["hand", "triangle"], sizeIs(MEDIUM)), max: 8 })],
  // En poche, à chaque résolution : Masse +1 si le triangle est plein.
  pocketed: { resolution: [{ ...mass(1), when: zoneIs("triangle", "full") }] },
  size: MEDIUM,
  families: ["classics"],
  rarity: "uncommon",
};
