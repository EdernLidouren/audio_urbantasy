// Bille « soda » (soda). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, familyCount } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  // Pointe : Vitesse +3 par famille différente sur le triangle, maximum +9.
  apex: [speed({ base: 0, step: 3, source: familyCount(), max: 9 })],
  // Base : Masse +1 par famille différente sur le triangle, maximum +3.
  base: [mass({ base: 0, step: 1, source: familyCount(), max: 3 })],
  // Chiquenaude prévue au set : statut lancer supplémentaire pour le tour EN COURS.
  // Non exprimable : ce statut dure « le prochain tour », et une clause ne change
  // que le nombre de tours ou de charges d'un statut, jamais la sorte de sa durée.
  // En poche, à chaque chiquenaude.
  pocketed: { flick: [speed(1)] },
  maxWear: 1,
  size: MEDIUM,
  families: ["classics"],
  rarity: "legendary",
};
