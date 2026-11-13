// Le DÉFI ENDURANCE : un Impact minimum à chaque tour, 20 tours au plus. Minimum
// PROVISOIRE, un repère technique tiré du simulateur (joueur glouton, sac de test du
// premier set, 1000 parties : le 25e centile de l'Impact par tour), pas un équilibrage.
import { DEFAULT_GAME, STARTING_BAG } from "../../config/values.js";

export default {
  id: "endurance",
  start: DEFAULT_GAME.start,
  bag: { kind: "list", marbles: STARTING_BAG },
  turns: 20,
  goal: { kind: "endurance", minimum: 7 },
  rules: [],
};
