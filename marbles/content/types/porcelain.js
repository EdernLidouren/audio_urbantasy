// Bille « porcelaine » (porcelain). Donnée pure : les champs sont décrits dans
// marbles/content/types/index.js.
import { mass, speed, polish, choice, applyStatus, NEXT_SLOT, PREVIOUS_SLOT } from "../effects.js";
import { SMALL } from "../../config/values.js";

export default {
  base: [speed(2)],
  // Pointe : Vitesse +5, et Vitesse +2 à la suivante : la base droite, déjà passée,
  // le bonus est perdu.
  apex: [speed(5), { ...speed(2), target: NEXT_SLOT }],
  // Chiquenaude : Masse +1 à la bille de l'emplacement précédent de l'emplacement visé.
  flick: [{ ...mass(1), target: PREVIOUS_SLOT }],
  // Final : Vitesse +4, puis Polissage 1 à jusqu'à 2 billes actives au choix.
  final: [speed(4), polish(1, choice({ zones: ["triangle"], count: 2, mode: "optional" }))],
  // Chute : statut fragilité (les Fêlures +1, 3 tours), à chaque arrivée à la défausse.
  drop: [applyStatus("brittleness")],
  pocketed: { entry: [speed(10)] },
  maxWear: 2,
  size: SMALL,
};
