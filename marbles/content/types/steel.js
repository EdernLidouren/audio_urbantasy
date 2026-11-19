// Bille « acier » (steel). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, applyStatus } from "../effects.js";
import { LARGE } from "../../config/values.js";

export default {
  apex: [mass(2)],
  base: [speed(2)],
  // Tic : Vitesse +3 si la bille éjectée est plus petite.
  hit: [{ ...speed(3), when: { type: "relativeSize", marble: "ejected", is: "smaller" } }],
  drop: [mass(1)],
  // En poche, à l'entrée : statut lancer supplémentaire (le prochain tour).
  pocketed: { entry: [applyStatus("extraThrow")] },
  maxWear: 5,
  size: LARGE,
  families: ["classics"],
  rarity: "epic",
};
