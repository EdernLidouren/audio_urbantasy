// Bille « perle » (pearl). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, discard, applyStatus, zoneCount, replacementSize, count, familyIs, orElse } from "../effects.js";
import { SMALL } from "../../config/values.js";

export default {
  // Pointe : Vitesse +2, +1 par bille Brume à la défausse, maximum +6.
  apex: [speed({ base: 2, step: 1, source: zoneCount("discard", familyIs("mist")), max: 6 })],
  // Base : Masse +1 si la main a au moins 3 billes, sinon Vitesse +1.
  base: [orElse(mass(1), count(zoneCount("hand"), { atLeast: 3 }), speed(1))],
  // Tic : Vitesse +4 si la bille éjectée est une minibille.
  hit: [{ ...speed(4), when: replacementSize("ejected", SMALL) }],
  // Chute : statut amorti (les pertes de Vitesse −1, 3 tours).
  drop: [applyStatus("cushion")],
  pocketed: { resolution: [speed(3)] },
  size: SMALL,
  families: ["mist"],
  rarity: "rare",
};
