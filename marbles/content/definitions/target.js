// Le DÉFI CIBLE : atteindre un score en un nombre de tours au plus. Valeurs
// PROVISOIRES, des repères techniques tirés du simulateur (joueur glouton, sac de test du
// premier set, 1000 parties, 8 tours : la médiane du score final, 121,5, arrondie),
// pas un équilibrage.
import { DEFAULT_GAME, STARTING_BAG } from "../../config/values.js";

export default {
  id: "target",
  start: DEFAULT_GAME.start,
  bag: { kind: "list", marbles: STARTING_BAG },
  turns: 8,
  goal: { kind: "target", score: 122 },
  rules: [],
};
