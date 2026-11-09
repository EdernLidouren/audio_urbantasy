// BOÎTE À OUTILS DES BILLES — l'EXPORT des résultats bruts d'une simulation, en
// JSON ou en CSV. Pur, sans Node : rend des textes, le lanceur
// (tools/marbles/simulate.js) les écrit. Les statistiques par bille sont celles du
// résumé (tools/marbles/stats.js), les mêmes chiffres que le rapport.
//
// JSON : un seul fichier, { params, summary, games }.
// CSV : deux fichiers, une ligne par partie et une ligne par bille ; virgule
// séparatrice, point décimal ; dans une cellule, les listes (Impacts par tour,
// sac) sont séparées par des espaces.

export function toJson({ params, summary, games }) {
  return `${JSON.stringify({ params, summary, games }, null, 2)}\n`;
}

const GAME_COLUMNS = [
  ["index", (game) => game.index],
  ["seed", (game) => game.seed],
  ["score", (game) => game.score],
  ["endReason", (game) => game.endReason],
  ["turns", (game) => game.turns],
  ["replacements", (game) => game.replacements],
  ["hitSpeed", (game) => game.hit.speed],
  ["hitMass", (game) => game.hit.mass],
  ["knockoutSpeed", (game) => game.knockout.speed],
  ["knockoutMass", (game) => game.knockout.mass],
  ["effectDraws", (game) => game.effectDraws],
  ["regenerations", (game) => game.regenerations],
  ["midTurnRegenerations", (game) => game.midTurnRegenerations],
  ["throws", (game) => game.throws],
  ["refusals", (game) => game.refusals.length],
  ["impacts", (game) => game.impacts.join(" ")],
  ["bag", (game) => game.bag.join(" ")],
];

export const MARBLE_COLUMNS = [
  "id",
  "games",
  "drawn",
  "placed",
  "placedReplacing",
  "knockedOut",
  "worn",
  "phaseSpeed",
  "phaseMass",
  "hitSpeed",
  "hitMass",
  "knockoutSpeed",
  "knockoutMass",
  "withScore",
  "withoutScore",
  "withoutGames",
  "gap",
];

// Une cellule : guillemets seulement si elle en a besoin.
function cell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const row = (cells) => cells.map(cell).join(",");

// -> { games, marbles } : le texte des deux fichiers CSV.
export function toCsv({ summary, games }) {
  return {
    games: [row(GAME_COLUMNS.map(([column]) => column)), ...games.map((game) => row(GAME_COLUMNS.map(([, read]) => read(game))))].join("\n") + "\n",
    marbles: [row(MARBLE_COLUMNS), ...summary.marbles.map((marble) => row(MARBLE_COLUMNS.map((column) => marble[column])))].join("\n") + "\n",
  };
}
