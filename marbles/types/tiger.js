// Bille « tigrée » (tiger). Donnée pure : les champs sont décrits dans
// marbles/types/index.js.
import { speed, mass } from "../effects.js";

export default {
  base: [speed(3)],
  apex: [speed(-1)],
  final: [mass(1)],
  maxWear: 4,
  size: "medium",
  sound: "classic_medium",
};
