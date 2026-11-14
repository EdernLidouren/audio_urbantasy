// SILENCE : une partie libre sans chiquenaudes.
import { DEFAULT_GAME } from "../../config/values.js";

export default {
  id: "silence",
  start: DEFAULT_GAME.start,
  bag: { kind: "player" },
  turns: DEFAULT_GAME.turns,
  goal: { kind: "free", tiers: DEFAULT_GAME.tiers },
  rules: ["silence"],
};
