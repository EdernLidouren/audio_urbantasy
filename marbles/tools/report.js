// BOÎTE À OUTILS DES BILLES — le RAPPORT d'une simulation, en phrases courtes, une
// ligne par chiffre ou par bille, sans tableau : il se lit au lecteur d'écran. Pur,
// sans Node. Tous les chiffres viennent du résumé (marbles/tools/stats.js), les
// mêmes que l'export. Le rapport observe ; il ne propose jamais de valeur.
//
// La durée d'exécution n'en fait pas partie (le lanceur l'ajoute) : mêmes
// paramètres, même rapport, au caractère près.

import { MARBLES_SETTINGS } from "../config/values.js";
import { PLAYERS } from "./players.js";
import { SETTING_NAMES } from "./simulation.js";
import { PLACEMENT_TRIGGERS, TRIGGER_IDS, TRIGGER_WORDS, marbleLabel } from "./format.js";

// Les titres du rapport, et le début de ses lignes d'anomalies : le comparateur
// (marbles/tools/report-diff.js) range les lignes changées sous eux.
export const REPORT_HEADINGS = {
  title: "Simulation du jeu des billes.",
  score: "Score final.",
  impact: "Impact par tour.",
  replacements: "Poses, moyennes par partie.",
  draws: "Pioche et lancers.",
  marbles: "Par bille, moyennes par partie où elle est dans le sac.",
  observations: "Observations.",
  refusals: "Actions refusées : ",
  interruptions: "Enchaînements interrompus : ",
};
// Les sections des résultats d'une partie : ce qui change quand le jeu change.
export const REPORT_RESULT_HEADINGS = [REPORT_HEADINGS.score, REPORT_HEADINGS.impact];

// Seuil des billes « presque jamais posées », en poses par partie.
const RARELY_PLACED = 0.25;

// Un nombre à la française : virgule décimale, zéros inutiles retirés, vrai signe
// moins. `signed` : « +4,2 » pour un écart.
export function frNumber(value, { signed = false } = {}) {
  const text = String(Math.abs(value)).replace(".", ",");
  if (value < 0) return `−${text}`;
  return signed && value > 0 ? `+${text}` : text;
}

// Ce que la bille a produit, par déclencheur, valeurs non nulles seulement (une
// ligne courte, lisible d'une traite) : « Produit en phase Vitesse 8,89, en tic
// Vitesse 0,93 et Masse 0,46. ».
function producedLine(marble) {
  const parts = TRIGGER_IDS.flatMap((id) => {
    const values = [
      marble[`${id}Speed`] !== 0 ? `Vitesse ${frNumber(marble[`${id}Speed`])}` : null,
      marble[`${id}Mass`] !== 0 ? `Masse ${frNumber(marble[`${id}Mass`])}` : null,
    ].filter((value) => value !== null);
    return values.length === 0 ? [] : [`${TRIGGER_WORDS[id].produced} ${values.join(" et ")}`];
  });
  return parts.length === 0 ? "  Ne produit ni Vitesse ni Masse." : `  Produit ${parts.join(", ")}.`;
}

const SETTING_LABELS = {
  maxHandSize: "main de",
  throwsPerTurn: "lancers par tour",
  potCapacity: "pot de",
  firstTurnDraw: "pioche du premier tour",
  drawPerTurn: "pioche par tour",
  turnCount: "tours",
};

function bagLine(mode) {
  if (mode.kind === "test") return "Sac : le sac de test.";
  if (mode.kind === "list") return `Sac : ${mode.source ?? "décrit"}, ${mode.marbles.length} billes.`;
  const limit = mode.maxCopies === null ? "sans limite d'exemplaires" : `${mode.maxCopies} exemplaire(s) au plus par bille`;
  return `Sac : aléatoire, ${mode.size} billes tirées dans la table, ${limit}, un sac par partie.`;
}

function settingsLine(settings) {
  const parts = SETTING_NAMES.map((setting) => {
    const value = settings[setting] ?? MARBLES_SETTINGS[setting];
    const overridden = settings[setting] !== undefined ? " (surchargé)" : "";
    return `${SETTING_LABELS[setting]} ${value}${overridden}`;
  });
  return `Réglages : ${parts.join(", ")}.`;
}

function marbleLines(marble, name, randomBags) {
  const n = frNumber;
  if (marble.games === 0) return [`${marbleLabel(marble.id, name)} : dans aucun sac.`];
  const lines = [
    `${marbleLabel(marble.id, name)}, dans ${marble.games} parties.`,
    // Seulement pour une bille qui pioche : les autres gardent leurs deux lignes.
    ...(marble.drawn > 0 ? [`  Fait piocher ${n(marble.drawn)} bille(s) par ses effets.`] : []),
    `  Posée ${n(marble.placed)} fois, dont ${n(marble.placedReplacing)} en remplacement. Éjectée ${n(marble.knockedOut)} fois, retirée par usure ${n(marble.worn)} fois.`,
    producedLine(marble),
  ];
  if (randomBags) {
    lines.push(
      marble.gap === null
        ? `  Score moyen avec elle ${marble.withScore === null ? "sans objet" : n(marble.withScore)} ; jamais absente ou jamais présente, pas d'écart.`
        : `  Score moyen avec elle ${n(marble.withScore)}, sans elle ${n(marble.withoutScore)} (${marble.withoutGames} parties), écart ${n(marble.gap, { signed: true })}.`
    );
  }
  return lines;
}

// Les écarts les plus marquants, formulés comme des observations.
export function observations(summary, name) {
  // « La bille … » : l'accord se fait avec « bille », quel que soit le genre du nom.
  const capitalized = (marble) => `La bille ${marbleLabel(marble.id, name)}`;
  const n = frNumber;
  const present = summary.marbles.filter((marble) => marble.games > 0);
  const found = [];
  const top = (field) => [...present].sort((a, b) => b[field] - a[field])[0];

  for (const marble of present) {
    if (marble.placed === 0) found.push(`${capitalized(marble)} n'est jamais posée.`);
    else if (marble.placed < RARELY_PLACED) found.push(`${capitalized(marble)} n'est presque jamais posée : ${n(marble.placed)} fois par partie.`);
  }
  if (present.length > 0) {
    const most = top("placed");
    found.push(`${capitalized(most)} est la plus posée : ${n(most.placed)} fois par partie.`);
    const speed = top("phaseSpeed");
    found.push(`${capitalized(speed)} produit le plus de Vitesse en phase : ${n(speed.phaseSpeed)} par partie.`);
    const mass = top("phaseMass");
    if (mass.phaseMass > 0) found.push(`${capitalized(mass)} produit le plus de Masse en phase : ${n(mass.phaseMass)} par partie.`);
    const ejected = top("knockedOut");
    if (ejected.knockedOut > 0) found.push(`${capitalized(ejected)} est la plus souvent éjectée : ${n(ejected.knockedOut)} fois par partie.`);
  }
  const withGap = present.filter((marble) => marble.gap !== undefined && marble.gap !== null).sort((a, b) => b.gap - a.gap);
  if (withGap.length > 0) {
    found.push(`Plus forts écarts de score avec elle : ${withGap.slice(0, 3).map((marble) => `${marbleLabel(marble.id, name)} ${n(marble.gap, { signed: true })}`).join(", ")}.`);
    found.push(`Plus faibles : ${withGap.slice(-3).reverse().map((marble) => `${marbleLabel(marble.id, name)} ${n(marble.gap, { signed: true })}`).join(", ")}.`);
  }
  if (summary.refusals > 0) found.push(`Le joueur a tenté ${summary.refusals} action(s) refusée(s) : une faute du joueur automatique.`);
  if (summary.interruptions > 0) found.push(`ANOMALIE : ${summary.interruptions} enchaînement(s) interrompu(s) par la limite de sécurité du bus, une boucle de billes.`);
  return found;
}

// Le rapport, ligne par ligne. `name(id)` : le nom d'une bille (son id par défaut).
export function buildReport({ params, summary, name }) {
  const n = frNumber;
  const { score, impact, replacements, draws } = summary;
  const randomBags = params.bagMode.kind === "random";
  const lastTurns = impact.perTurn.map(({ turn, mean, games }) =>
    games === summary.games ? `Tour ${turn} : ${n(mean)}.` : `Tour ${turn} : ${n(mean)}, sur ${games} parties.`
  );
  return [
    REPORT_HEADINGS.title,
    `Joueur : ${PLAYERS[params.player].describe(params.playerOptions)}.`,
    `Parties : ${summary.games}, graine de départ ${params.seed}.`,
    bagLine(params.bagMode),
    settingsLine(params.settings),
    "",
    REPORT_HEADINGS.score,
    `Moyenne ${n(score.mean)}. Médiane ${n(score.median)}. Minimum ${n(score.min)}, maximum ${n(score.max)}.`,
    `Centiles : 10e ${n(score.p10)}, 25e ${n(score.p25)}, 75e ${n(score.p75)}, 90e ${n(score.p90)}.`,
    "",
    REPORT_HEADINGS.impact,
    `Moyenne ${n(impact.mean)} par tour joué.`,
    ...lastTurns,
    "",
    REPORT_HEADINGS.replacements,
    `Poses sur un emplacement occupé : ${n(replacements.perGame)}.`,
    ...PLACEMENT_TRIGGERS.map(({ id }) => `Apporté par ${TRIGGER_WORDS[id].brought} : Vitesse ${n(replacements[`${id}Speed`])}, Masse ${n(replacements[`${id}Mass`])}.`),
    "",
    REPORT_HEADINGS.draws,
    `Billes piochées par des effets : ${n(draws.byEffect)} par partie.`,
    `Régénérations du sac : ${n(draws.regenerations)} par partie, dont ${n(draws.midTurnRegenerations)} en cours de tour.`,
    `Lancers : ${n(summary.throwsPerTurn)} par tour joué.`,
    "",
    REPORT_HEADINGS.marbles,
    ...summary.marbles.flatMap((marble) => marbleLines(marble, name, randomBags)),
    "",
    REPORT_HEADINGS.observations,
    ...observations(summary, name).map((text) => `- ${text}`),
    "",
    `${REPORT_HEADINGS.refusals}${summary.refusals}.`,
    `${REPORT_HEADINGS.interruptions}${summary.interruptions}.`,
  ];
}
