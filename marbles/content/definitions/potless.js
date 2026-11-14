// SANS POT : une partie libre dont les billes du pot n'agissent pas.
import { DEFAULT_GAME } from "../../config/values.js";

export default {
  id: "potless",
  start: DEFAULT_GAME.start,
  bag: { kind: "player" },
  turns: DEFAULT_GAME.turns,
  goal: { kind: "free", tiers: DEFAULT_GAME.tiers },
  rules: ["inertPot"],
};
