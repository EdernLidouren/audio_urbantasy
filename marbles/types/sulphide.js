// Bille « sulfure » (sulphide). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { mass, crack, pocket, speed, activeSize } from "../effects.js";
import { LARGE, SMALL } from "../../config/marbles-values.js";

export default {
  // Base : Empocher la bille en pointe, dont la phase est alors sautée.
  base: [pocket("apex")],
  apex: [mass(3)],
  windfall: [crack(1, "rightBase")],
  // En poche, à chaque résolution : Vitesse +2 par minibille active.
  pocketed: { resolution: [speed({ base: 0, step: 2, source: activeSize(SMALL) })] },
  size: LARGE,
};
