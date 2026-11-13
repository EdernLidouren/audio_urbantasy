// TERRAIN ÉTROIT : une partie libre, un lancer de moins et aucun échange.
import { DEFAULT_GAME, STARTING_BAG } from "../../config/values.js";

export default {
  id: "narrowGround",
  start: DEFAULT_GAME.start,
  bag: { kind: "list", marbles: STARTING_BAG },
  turns: DEFAULT_GAME.turns,
  goal: { kind: "free", tiers: DEFAULT_GAME.tiers },
  rules: ["oneThrowLess", "noSwap"],
};
