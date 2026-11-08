// Jeu des billes : le MENU de l'historique (touche L), un menu vertical de
// lib/menu.js. Une entrée par message de jeu du tour précédent, du plus ancien
// (en haut) au plus récent, puis « Fermer » ; Échap ferme aussi. Les messages se
// lisent, ils ne s'activent pas : ce sont des lignes en lecture seule, Entrée n'y
// fait rien. Ce qui est retenu, et sur quelle portée : view/marbles/history.js.

import { pushScreen, popScreen } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { stripTrailingPeriod } from "../../lib/announce.js";
import { t } from "../../data/i18n/index.js";

// Une ligne lue telle quelle. Sans son point final : le menu en ajoute un avant la
// position (« 3 sur 12 »), qui ferait sinon « .. ».
function readOnly(text) {
  return { label: "marbles.history.entry", labelParams: { text: stripTrailingPeriod(text) } };
}

// Les entrées du menu, sans l'ouvrir (vérifiable au terminal). `previous` : le tour
// précédent, { turn, messages }, ou null au premier tour.
export function historyMenu(previous) {
  const lines = previous === null ? [readOnly(t("marbles.history.empty"))] : previous.messages.map(readOnly);
  return {
    title: previous === null ? "marbles.history.title_none" : "marbles.history.title",
    titleParams: previous === null ? undefined : { turn: previous.turn },
    closable: true,
    entries: [...lines, { label: "marbles.history.close", onActivate: () => popScreen() }],
  };
}

export function openHistoryMenu(previous) {
  pushScreen(makeMenuScreen(historyMenu(previous), t));
}
