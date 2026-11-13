// Jeu des billes, ce qui se dit : l'OBJECTIF de la partie et ses RÈGLES
// (marbles/core/definitions.js). L'annonce d'ouverture (objectif, puis règles), la
// touche O (objectif, progression, nombre de règles), les fiches du menu Maj+O
// (l'objectif détaillé, chaque règle et son effet), et le résultat de la fin de
// partie. Pur. Point d'entrée et vue d'ensemble : marbles/view/narration.js.

import { ruleInstances } from "../../core/statuses.js";
import { tierOf, turnsHeld, TIERS } from "../../core/definitions.js";
import { statusName } from "./effects.js";
import { behaviorsText } from "./statuses.js";

// Le nom d'un palier : « argent ».
function tierName(tier, t) {
  return t(`marbles.tier.${tier}`);
}

// L'OBJECTIF en une phrase : « Objectif : libre, 10 tours. », « Objectif : 165 points
// en 8 tours. », « Objectif : Impact de 12 minimum chaque tour, 20 tours au plus. ».
const GOAL_TEXTS = {
  free: ({ turns }, t) => t("marbles.goal.free", { turns }),
  target: ({ turns, goal }, t) => t("marbles.goal.target", { score: goal.score, turns }),
  endurance: ({ turns, goal }, t) => t(turns === null ? "marbles.goal.endurance" : "marbles.goal.endurance_max", { minimum: goal.minimum, turns }),
};

export function goalText(definition, t) {
  return GOAL_TEXTS[definition.goal.kind](definition, t);
}

// LA PROGRESSION, selon l'objectif : « Tour 5 sur 10. Score 120, palier argent
// atteint. », « 120 sur 165, tour 5 sur 8. », « 4 tours tenus. ».
const PROGRESS_TEXTS = {
  free: (game, t) => {
    const { tiers } = game.definition.goal;
    const tier = tierOf(game.score, tiers);
    const next = TIERS.find((candidate) => game.score < tiers[candidate]);
    const reached = tier === "none" ? t("marbles.goal.progress.no_tier") : t("marbles.goal.progress.tier", { tier: tierName(tier, t) });
    const nextText = next === undefined ? "" : ` ${t("marbles.goal.progress.next_tier", { tier: tierName(next, t), score: tiers[next] })}`;
    return `${t("marbles.goal.progress.free", { turn: game.turn, turns: game.definition.turns, score: game.score, reached })}${nextText}`;
  },
  target: (game, t) => t("marbles.goal.progress.target", { score: game.score, target: game.definition.goal.score, turn: game.turn, turns: game.definition.turns }),
  endurance: (game, t) => {
    const held = turnsHeld(game);
    const { turns } = game.definition;
    return turns === null ? t("marbles.goal.progress.endurance", { count: held }) : t("marbles.goal.progress.endurance_max", { count: held, turns });
  },
};

// Le nombre de règles : « Aucune règle. », « 2 règles. ».
function ruleCount(game, t) {
  return t("marbles.goal.rule_count", { count: ruleInstances(game.statuses).length });
}

// LA TOUCHE O : l'objectif, la progression, puis le nombre de règles.
export function describeGoal(game, t) {
  return [goalText(game.definition, t), PROGRESS_TEXTS[game.definition.goal.kind](game, t), ruleCount(game, t)].join(" ");
}

// Une règle en une phrase : « Règle : gravier. Les calots… ». Son nom, puis sa
// description (celle du statut).
function ruleLine(status, t) {
  return t("marbles.goal.rule_line", { status: statusName(status, t), description: t(`marbles.status.${status}.description`) });
}

// L'ANNONCE D'OUVERTURE, une seule, avant le premier tour : l'objectif, puis chaque
// règle.
export function describeOpening(game, t) {
  return [goalText(game.definition, t), ...ruleInstances(game.statuses).map((instance) => ruleLine(instance.status, t))].join(" ");
}

// LES FICHES DU MENU Maj+O (marbles/view/goal-screen.js), { main, above, below } comme
// celles de lib/detail-card.js.
// L'objectif : sa phrase ; au-dessous, sa progression, puis ce qui le juge.
const GOAL_DETAILS = {
  free: ({ goal }, t) => [t("marbles.goal.detail.tiers", { bronze: goal.tiers.bronze, silver: goal.tiers.silver, gold: goal.tiers.gold })],
  target: ({ goal, turns }, t) => [t("marbles.goal.detail.target_win", { score: goal.score }), t("marbles.goal.detail.target_lose", { turns })],
  endurance: ({ goal, turns }, t) => [
    t("marbles.goal.detail.endurance", { minimum: goal.minimum }),
    ...(turns === null ? [] : [t("marbles.goal.detail.endurance_max", { turns })]),
  ],
};

export function goalCard(game, main, t) {
  const { definition } = game;
  return {
    main,
    above: [],
    below: [PROGRESS_TEXTS[definition.goal.kind](game, t), ...GOAL_DETAILS[definition.goal.kind](definition, t), t("marbles.goal.detail.no_marbles")],
  };
}

// L'entrée d'une règle : « Règle : gravier » ; au-dessous, son effet.
export function ruleLabel(status, t) {
  return t("marbles.goal.rule_label", { status: statusName(status, t) });
}

export function ruleCard(instance, main, rules, t) {
  return { main, above: [], below: [t("marbles.statuses.card.effect", { effect: behaviorsText(rules.statuses[instance.status], instance.intensity, t, rules.statuses) })] };
}

// LE RÉSULTAT d'une partie finie (marbles/core/definitions.js/gameResult), en une
// phrase : « Palier argent atteint. », « Victoire : objectif atteint. », « Échec :
// objectif non atteint. », « Endurance réussie : 20 tours tenus. », « Fin de
// l'endurance : 4 tours tenus. ».
const RESULT_TEXTS = {
  free: (result, t) => (result.tier === "none" ? t("marbles.result.no_tier") : t("marbles.result.tier", { tier: tierName(result.tier, t) })),
  target: (result, t) => t(`marbles.result.${result.outcome}`),
  endurance: (result, t) => t(`marbles.result.endurance_${result.outcome}`, { count: result.held }),
};

export function resultText(result, t) {
  return RESULT_TEXTS[result.goal](result, t);
}
