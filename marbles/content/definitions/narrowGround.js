// TERRAIN ÉTROIT : une partie libre, un lancer de moins et aucun échange.
import { DEFAULT_GAME } from "../../config/values.js";

export default {
  id: "narrowGround",
  start: DEFAULT_GAME.start,
  bag: { kind: "player" },
  turns: DEFAULT_GAME.turns,
  goal: { kind: "free", tiers: DEFAULT_GAME.tiers },
  rules: ["oneThrowLess", "noSwap"],
};
