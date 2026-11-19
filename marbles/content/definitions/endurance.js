// Le DÉFI ENDURANCE : un Impact minimum à chaque tour, 20 tours au plus. Minimum
// PROVISOIRE, un repère technique tiré du simulateur (joueur glouton, sac de départ,
// 1000 parties libres, set révisé de novembre 2026 : le 25e centile de l'Impact par
// tour, 10), pas un équilibrage.
import { DEFAULT_GAME } from "../../config/values.js";

export default {
  id: "endurance",
  start: DEFAULT_GAME.start,
  // Un sac du joueur, avec une RÈGLE DE CONSTRUCTION PROPRE : exactement 15 billes
  // (la taille remplace celle par défaut ; la limite d'exemplaires reste).
  bag: { kind: "player", buildRules: { size: { min: 15, max: 15 } } },
  turns: 20,
  goal: { kind: "endurance", minimum: 10 },
  rules: [],
};
