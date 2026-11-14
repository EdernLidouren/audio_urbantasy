// La PARTIE LIBRE, la partie par défaut : ses valeurs viennent des réglages
// (marbles/config/values.js, DEFAULT_GAME). Elle se joue avec un SAC DU JOUEUR, selon
// les règles de construction par défaut ; le menu principal lui fournit le sac de
// départ.
import { DEFAULT_GAME } from "../../config/values.js";

export default {
  id: "free",
  start: DEFAULT_GAME.start,
  bag: { kind: "player" },
  turns: DEFAULT_GAME.turns,
  goal: { kind: "free", tiers: DEFAULT_GAME.tiers },
  rules: [],
};
