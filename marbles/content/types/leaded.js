// Bille « plombée » (leaded). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { eject, speed, mass } from "../effects.js";
import { LARGE } from "../../config/values.js";

export default {
  base: [mass(2)],
  apex: [speed(-3)],
  // Chiquenaude : Éjecter la bille en pointe. Posée en pointe sur une bille, elle
  // vide l'emplacement avant d'y arriver : ni éjection par la pose, ni Tic.
  flick: [eject("apex")],
  knockout: [mass(1)],
  size: LARGE,
};
