// BOÎTE À OUTILS DES BILLES — la DIFFÉRENCE entre deux rapports du simulateur
// (marbles/tools/report.js), pour le comparateur (marbles/tools/compare.js). Pur,
// sans Node : les vérifications s'en servent aussi.
//
// Un rapport est une suite de paragraphes séparés par une ligne vide, chacun ouvert
// par son titre (« Score final. ») ; dans la section des billes, une ligne en retrait
// appartient à la bille de la dernière ligne sans retrait. La différence se fait
// ligne à ligne (plus longue sous-suite commune), et chaque ligne changée est rangée
// sous son contexte : le titre de son paragraphe, et sa bille s'il y a lieu. La durée
// (dernière ligne du lanceur) est ignorée : elle change à chaque fois.

import { REPORT_HEADINGS, REPORT_RESULT_HEADINGS } from "./report.js";

// Les lignes du lanceur qui ne font pas partie du rapport.
const IGNORED = [/^Durée : /];

const isIgnored = (line) => IGNORED.some((pattern) => pattern.test(line));

// Le contexte de chaque ligne : { heading, marble } (marble : null hors des billes).
function contexts(lines) {
  let heading = null;
  let marble = null;
  return lines.map((line) => {
    if (line === "") {
      heading = null;
      marble = null;
      return { heading: null, marble: null };
    }
    if (heading === null) {
      heading = line;
      marble = null;
      return { heading, marble: null };
    }
    if (heading === REPORT_HEADINGS.marbles && !line.startsWith(" ")) marble = line;
    return { heading, marble: line.startsWith(" ") ? marble : null };
  });
}

// La plus longue sous-suite commune, en opérations : { kind: "same" | "removed" |
// "added", line, context }. Quelques centaines de lignes : le tableau complet suffit.
function lineOperations(before, after) {
  const rows = before.length + 1;
  const cols = after.length + 1;
  const lengths = new Uint32Array(rows * cols);
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      lengths[i * cols + j] = before[i] === after[j] ? lengths[(i + 1) * cols + j + 1] + 1 : Math.max(lengths[(i + 1) * cols + j], lengths[i * cols + j + 1]);
    }
  }
  const beforeContexts = contexts(before);
  const afterContexts = contexts(after);
  const operations = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      operations.push({ kind: "same", line: after[j], context: afterContexts[j] });
      i += 1;
      j += 1;
    } else if (j < after.length && (i === before.length || lengths[i * cols + j + 1] >= lengths[(i + 1) * cols + j])) {
      operations.push({ kind: "added", line: after[j], context: afterContexts[j] });
      j += 1;
    } else {
      operations.push({ kind: "removed", line: before[i], context: beforeContexts[i] });
      i += 1;
    }
  }
  return operations;
}

const contextKey = ({ heading, marble }) => `${heading}\n${marble ?? ""}`;

// Le contexte en mots : le titre de la section (« Score final »), ou, dans la section
// des billes, la ligne de la bille seule (« mica, dans 1000 parties »).
export function contextLabel({ heading, marble }) {
  return (marble ?? heading ?? "").replace(/\.$/, "");
}

// La différence de deux rapports (listes de lignes). ->
//   { identical, changedLines, resultsChanged, groups: [{ context, before: [lignes],
//     after: [lignes] }] }
// `changedLines` : par groupe, le plus grand des deux côtés (une ligne modifiée
// compte une fois). `resultsChanged` : un groupe touche le score final ou l'Impact
// par tour (REPORT_RESULT_HEADINGS), ou l'en-tête (les paramètres
// diffèrent : la comparaison ne vaut alors rien).
export function diffReports(beforeLines, afterLines) {
  const before = beforeLines.filter((line) => !isIgnored(line));
  const after = afterLines.filter((line) => !isIgnored(line));
  const groups = [];
  let open = null;
  for (const operation of lineOperations(before, after)) {
    if (operation.kind === "same") {
      open = null;
      continue;
    }
    // Les changements consécutifs d'un même contexte forment un groupe.
    if (open === null || contextKey(open.context) !== contextKey(operation.context)) {
      open = { context: operation.context, before: [], after: [] };
      groups.push(open);
    }
    (operation.kind === "removed" ? open.before : open.after).push(operation.line);
  }
  const resultHeadings = new Set([...REPORT_RESULT_HEADINGS, REPORT_HEADINGS.title]);
  return {
    identical: groups.length === 0,
    changedLines: groups.reduce((total, group) => total + Math.max(group.before.length, group.after.length), 0),
    resultsChanged: groups.some((group) => resultHeadings.has(group.context.heading)),
    groups,
  };
}

// Les compteurs d'anomalies d'un rapport (ses deux dernières lignes) : { refusals,
// interruptions }, null s'il manque (un rapport tronqué par une erreur).
export function reportAnomalies(lines) {
  const count = (prefix) => {
    const line = lines.find((text) => text.startsWith(prefix));
    return line === undefined ? null : Number(line.slice(prefix.length).replace(/\.$/, ""));
  };
  return { refusals: count(REPORT_HEADINGS.refusals), interruptions: count(REPORT_HEADINGS.interruptions) };
}
