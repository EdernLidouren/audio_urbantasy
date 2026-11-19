// Bille « araignée » (spider). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, mass, polish, applyStatus, zoneCount, count, statIs, familyIs, orElse, choice } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  // Pointe : Vitesse +2 par bille Bestiaire active, maximum +6.
  apex: [speed({ base: 0, step: 2, source: zoneCount("triangle", familyIs("bestiary")), max: 6 })],
  // Base : Masse +1 si la Vitesse est d'au moins 10, sinon Vitesse +2.
  base: [orElse(mass(1), statIs("speed", { atLeast: 10 }), speed(2))],
  // Tic : Polissage 1 à jusqu'à 2 billes actives au choix (facultatif).
  hit: [polish(1, choice({ zones: ["triangle"], count: 2, mode: "optional" }))],
  knockout: [mass(1)],
  // En poche, à chaque tic : statut coup de fouet (une charge).
  pocketed: { hit: [applyStatus("whiplash")] },
  size: MEDIUM,
  families: ["bestiary"],
  rarity: "epic",
};
