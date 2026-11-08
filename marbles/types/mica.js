// Bille « mica » (mica). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed } from "../effects.js";

export default {
  base: [speed(1)],
  apex: [speed(1)],
  maxWear: 6,
  sound: "small",
};
