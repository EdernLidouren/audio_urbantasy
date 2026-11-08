// BOÎTE À OUTILS DES BILLES — les STATISTIQUES d'une simulation, tirées des
// relevés de parties (tools/marbles/simulation.js). Pur, sans Node.
//
// Un seul résumé (summarize), arrondi UNE fois ici, au centième : le rapport
// (report.js) le met en phrases, l'export (export.js) l'écrit tel quel. Les deux
// donnent donc les mêmes chiffres.
//
// Moyennes « par partie » d'une bille : sur les parties où elle est dans le sac
// (avec le sac de test, toutes). Centiles : interpolation linéaire entre les deux
// rangs voisins (la médiane est le 50e).

import { MARBLE_IDS } from "./simulation.js";

export const round = (value) => Math.round(value * 100) / 100;
const sum = (values) => values.reduce((total, value) => total + value, 0);
const mean = (values) => (values.length === 0 ? 0 : sum(values) / values.length);

export function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * (p / 100);
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

const MARBLE_FIELDS = ["placed", "placedReplacing", "knockedOut", "worn", "phaseSpeed", "phaseMass", "hitSpeed", "hitMass", "knockoutSpeed", "knockoutMass"];

function marbleSummary(id, games, randomBags) {
  const present = games.filter((game) => game.bag.includes(id));
  const absent = games.filter((game) => !game.bag.includes(id));
  const line = { id, games: present.length };
  for (const field of MARBLE_FIELDS) line[field] = round(mean(present.map((game) => game.marbles[id]?.[field] ?? 0)));
  // Indicateur de force marginale : il n'a de sens que si la bille manque à
  // certains sacs, donc avec des sacs aléatoires.
  if (randomBags) {
    line.withScore = present.length > 0 ? round(mean(present.map((game) => game.score))) : null;
    line.withoutScore = absent.length > 0 ? round(mean(absent.map((game) => game.score))) : null;
    line.withoutGames = absent.length;
    line.gap = line.withScore !== null && line.withoutScore !== null ? round(line.withScore - line.withoutScore) : null;
  }
  return line;
}

// -> le résumé :
//   { games, score: { mean, median, min, max, p10, p25, p75, p90 },
//     impact: { mean, perTurn: [{ turn, mean, games }] },
//     end: { turnsCompleted, bagExhausted } (en % des parties),
//     replacements: { perGame, hitSpeed, hitMass, knockoutSpeed, knockoutMass } (par partie),
//     refusals, marbles: [par bille, dans l'ordre de la table] }
export function summarize({ params, games }) {
  const scores = games.map((game) => game.score).sort((a, b) => a - b);
  const turnCount = Math.max(0, ...games.map((game) => game.impacts.length));
  const perTurn = [];
  for (let turn = 1; turn <= turnCount; turn++) {
    const impacts = games.filter((game) => game.impacts.length >= turn).map((game) => game.impacts[turn - 1]);
    perTurn.push({ turn, mean: round(mean(impacts)), games: impacts.length });
  }
  const share = (reason) => round((100 * games.filter((game) => game.endReason === reason).length) / games.length);
  const perGame = (read) => round(mean(games.map(read)));
  const randomBags = params.bagMode.kind === "random";
  return {
    games: games.length,
    score: {
      mean: round(mean(scores)),
      median: round(percentile(scores, 50)),
      min: scores[0],
      max: scores[scores.length - 1],
      p10: round(percentile(scores, 10)),
      p25: round(percentile(scores, 25)),
      p75: round(percentile(scores, 75)),
      p90: round(percentile(scores, 90)),
    },
    impact: { mean: round(mean(games.flatMap((game) => game.impacts))), perTurn },
    end: { turnsCompleted: share("turnsCompleted"), bagExhausted: share("bagExhausted") },
    replacements: {
      perGame: perGame((game) => game.replacements),
      hitSpeed: perGame((game) => game.hit.speed),
      hitMass: perGame((game) => game.hit.mass),
      knockoutSpeed: perGame((game) => game.knockout.speed),
      knockoutMass: perGame((game) => game.knockout.mass),
    },
    refusals: sum(games.map((game) => game.refusals.length)),
    marbles: MARBLE_IDS.map((id) => marbleSummary(id, games, randomBags)),
  };
}
