// Bille « araignée » (spider). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { speed, polish, choice, zoneCount, familyIs, applyStatus } from "../effects.js";
import { MEDIUM } from "../../config/values.js";

export default {
  // Pointe : Vitesse +2 par créature active, maximum +6.
  apex: [speed({ base: 0, step: 2, source: zoneCount("triangle", familyIs("bestiary")), max: 6 })],
  base: [speed(1)],
  // Tic : Polissage 1 à jusqu'à 2 billes actives au choix (facultatif).
  hit: [polish(1, choice({ zones: ["triangle"], count: 2, mode: "optional" }))],
  // En poche, à chaque tic : statut coup de fouet (une charge).
  pocketed: { hit: [applyStatus("whiplash")] },
  size: MEDIUM,
  families: ["bestiary"],
  rarity: "epic",
};
