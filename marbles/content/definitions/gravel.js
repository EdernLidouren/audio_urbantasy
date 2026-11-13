// GRAVIER : une partie libre dont la règle divise par deux les gains de Vitesse et de
// Masse produits par un calot.
import { DEFAULT_GAME, STARTING_BAG } from "../../config/values.js";

export default {
  id: "gravel",
  start: DEFAULT_GAME.start,
  bag: { kind: "list", marbles: STARTING_BAG },
  turns: DEFAULT_GAME.turns,
  goal: { kind: "free", tiers: DEFAULT_GAME.tiers },
  rules: ["gravel"],
};
