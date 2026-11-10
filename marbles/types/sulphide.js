// Bille « sulfure » (sulphide). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { mass, crack } from "../effects.js";

export default {
  base: [crack(1, "apex")],
  apex: [mass(3)],
  size: "large",
  sound: "classic_large",
};
