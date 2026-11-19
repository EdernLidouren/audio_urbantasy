// Le DÉFI CIBLE : atteindre un score en un nombre de tours au plus. Valeurs
// PROVISOIRES, des repères techniques tirés du simulateur (joueur glouton, sac de
// départ, 1000 parties, 8 tours, set révisé de novembre 2026 : la médiane du score
// final, 165), pas un équilibrage.
import { DEFAULT_GAME } from "../../config/values.js";

export default {
  id: "target",
  start: DEFAULT_GAME.start,
  // Un SAC IMPOSÉ : le défi se joue avec le sac de départ, quel que soit celui du
  // joueur.
  bag: { kind: "preset", bag: "starter" },
  turns: 8,
  goal: { kind: "target", score: 165 },
  rules: [],
};
