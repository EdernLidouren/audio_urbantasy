// Bille « œil-de-chat » (cats_eye). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, draw, retrieve, choice, zoneIs } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  base: [speed(3)],
  baseVariant: { rightBase: [mass(1)] },
  apex: [speed(3)],
  // Tic : Pioche 1 si la main est vide.
  hit: [{ ...draw(1), when: zoneIs("hand", "empty") }],
  // Éjection : Ramasser une bille de la défausse au choix. En partance, elle n'y est
  // pas encore : elle ne peut pas se choisir elle-même.
  knockout: [retrieve(choice({ zones: ["discard"], mode: "optional" }))],
  size: MEDIUM,
};
