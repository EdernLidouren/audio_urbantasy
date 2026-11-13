// Jeu des billes : le MENU DE L'OBJECTIF ET DES RÈGLES (Maj+O). Un menu horizontal à
// fiches (marbles/view/card-menu.js) : une entrée pour l'objectif, puis une par règle
// de la partie, dans leur ordre, puis « Retour » ; Échap ferme. Ctrl+haut et Ctrl+bas
// parcourent la fiche de l'entrée (l'objectif : sa progression et ce qui le juge ; une
// règle : son effet : marbles/view/narration/goal.js) ; E dit la description (celle
// de la définition de partie, ou de la règle).
//
// La partie est lue à l'ouverture, rien n'en est modifié. Aucune balise.

import { announce } from "../../lib/announce.js";
import { pushScreen } from "../../lib/screens.js";
import { defineBindings } from "../../lib/input.js";
import { t } from "../../data/i18n/index.js";
import { ruleInstances } from "../core/statuses.js";
import { makeCardMenuScreen, withPosition } from "./card-menu.js";
import { goalCard, goalText, ruleCard, ruleLabel } from "./narration.js";

const GOAL_BINDINGS = defineBindings("marblesGoal", {
  left: { keys: ["ArrowLeft"], mods: [] },
  right: { keys: ["ArrowRight"], mods: [] },
  home: { keys: ["Home"], mods: [] },
  end: { keys: ["End"], mods: [] },
  detailUp: { keys: ["ArrowUp"], mods: ["ctrl"] },
  detailDown: { keys: ["ArrowDown"], mods: ["ctrl"] },
  activate: { keys: ["Enter", " "], mods: [] },
  reannounce: { keys: ["Backspace"], mods: [] },
  back: { keys: ["Escape"], mods: [] },
  // La description de l'objectif ou de la règle sous le curseur.
  describe: { keys: ["e"], mods: [] },
});

// `game` : la partie, lue à l'ouverture ; `rules` : les règles du jeu, pour les
// définitions des statuts.
export function openGoalMenu(game, rules) {
  const ruleList = ruleInstances(game.statuses);
  // L'objectif d'abord (index 0), puis chaque règle.
  const cardAt = (index, total) => {
    if (index === 0) return goalCard(game, withPosition(goalText(game.definition, t), index, total), t);
    const instance = ruleList[index - 1];
    return ruleCard(instance, withPosition(ruleLabel(instance.status, t), index, total), rules, t);
  };
  pushScreen(
    makeCardMenuScreen({
      bindings: GOAL_BINDINGS,
      helpId: "marblesGoal",
      titleKey: "marbles.goal.title",
      count: ruleList.length + 1,
      emptyKey: "marbles.goal.title",
      cardAt,
      actions: {
        describe: (index, line) => {
          if (index === undefined) announce(line, { assertive: true });
          else if (index === 0) announce(t(`marbles.definition.${game.definition.id}.description`), { assertive: true });
          else announce(t(`marbles.status.${ruleList[index - 1].status}.description`), { assertive: true });
        },
      },
    })
  );
}
