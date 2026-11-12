// Bille « agate » (agate). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { mass, pocket, zoneIs, applyStatus } from "../effects.js";
import { LARGE, MEDIUM } from "../../config/values.js";

export default {
  base: [mass(1)],
  // Pointe : Masse +1, et Masse +2 si la base gauche est un calot.
  apex: [mass(1), { ...mass(2), when: { type: "sizeAt", slot: "leftBase", size: LARGE } }],
  // Tic : statut inspiration (la prochaine Pioche d'un effet +1).
  hit: [applyStatus("inspiration")],
  // Trouvaille : statut lustre (les Polissages +1, toute la partie).
  windfall: [applyStatus("luster")],
  // Final : statut poche profonde (le pot +1, toute la partie), puis elle s'empoche,
  // dans le pot déjà agrandi.
  final: [applyStatus("deepPocket"), pocket()],
  // En poche, à chaque résolution : Masse +2 si le pot est plein.
  pocketed: { resolution: [{ ...mass(2), when: zoneIs("pot", "full") }] },
  size: MEDIUM,
};
