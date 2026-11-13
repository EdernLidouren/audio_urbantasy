// La PARTIE LIBRE, la partie par défaut : ses valeurs viennent des réglages
// (marbles/config/values.js, DEFAULT_GAME et le sac de test).
import { DEFAULT_GAME, STARTING_BAG } from "../../config/values.js";

export default {
  id: "free",
  start: DEFAULT_GAME.start,
  bag: { kind: "list", marbles: STARTING_BAG },
  turns: DEFAULT_GAME.turns,
  goal: { kind: "free", tiers: DEFAULT_GAME.tiers },
  rules: [],
};
