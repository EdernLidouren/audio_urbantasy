// SILENCE : une partie libre sans chiquenaudes.
import { DEFAULT_GAME, STARTING_BAG } from "../../config/values.js";

export default {
  id: "silence",
  start: DEFAULT_GAME.start,
  bag: { kind: "list", marbles: STARTING_BAG },
  turns: DEFAULT_GAME.turns,
  goal: { kind: "free", tiers: DEFAULT_GAME.tiers },
  rules: ["silence"],
};
