// Jeu des billes : le MENU DES STATUTS de la partie (Maj+A). Menu horizontal (gauche
// et droite), comme celui d'une pile de billes (marbles/view/pile-screen.js) : une
// entrée par statut, dans l'ordre d'acquisition (en attente compris), puis
// « Retour » ; Échap ferme aussi. L'annonce principale d'une entrée : le nom du
// statut, son intensité s'il le faut, ce qui lui reste ; Ctrl+haut et Ctrl+bas
// parcourent sa fiche (son effet, ce qui reste, son origine :
// marbles/view/narration/statuses.js) ; E dit sa description.
//
// Rien de la partie n'est modifié ici : les statuts sont lus à l'ouverture. Aucune
// balise : un statut n'a pas de voix.

import { announce } from "../../lib/announce.js";
import { popScreen, pushScreen } from "../../lib/screens.js";
import { resolveAction, defineBindings } from "../../lib/input.js";
import { announceMenuLine, formatMenuPosition, jumpMenuCursor, stepMenuCursor } from "../../lib/menu.js";
import { detailAfterMainMove, detailLine, mainWithDetail, stepDetail } from "../../lib/detail-card.js";
import { t } from "../../data/i18n/index.js";
import { MARBLES_SETTINGS } from "../config/values.js";
import { playMenuSound } from "../../view/menu-sounds.js";
import { instanceLabel, statusCard, statusHelpLine } from "./narration.js";

const STATUS_BINDINGS = defineBindings("marblesStatuses", {
  left: { keys: ["ArrowLeft"], mods: [] },
  right: { keys: ["ArrowRight"], mods: [] },
  home: { keys: ["Home"], mods: [] },
  end: { keys: ["End"], mods: [] },
  detailUp: { keys: ["ArrowUp"], mods: ["ctrl"] },
  detailDown: { keys: ["ArrowDown"], mods: ["ctrl"] },
  activate: { keys: ["Enter", " "], mods: [] },
  reannounce: { keys: ["Backspace"], mods: [] },
  back: { keys: ["Escape"], mods: [] },
  // La description du statut sous le curseur.
  describe: { keys: ["e"], mods: [] },
});

// Une entrée et sa position dans le menu : « amorti, intensité 2, 3 tours. 1 sur 3 ».
function withPosition(label, index, total) {
  const position = formatMenuPosition(index, total, t);
  return position ? `${label}. ${position}` : label;
}

function makeStatusScreen(instances, rules) {
  const total = instances.length + 1; // « Retour » compte comme une entrée
  let index = 0;
  let detail = 0;

  const isOnBack = () => index === instances.length;

  // La fiche de l'entrée courante ; « Retour » n'en a pas.
  function currentCard() {
    if (isOnBack()) return null;
    const instance = instances[index];
    return statusCard(instance, withPosition(instanceLabel(instance, rules, t), index, total), rules, t);
  }

  function currentLine() {
    const card = currentCard();
    return card === null ? withPosition(t("marbles.statuses.back"), index, total) : mainWithDetail(card, detail);
  }

  function goTo({ index: next, boundary }) {
    index = next;
    detail = detailAfterMainMove(detail, MARBLES_SETTINGS.cardResetOnMove);
    announceMenuLine(currentLine(), boundary);
  }

  // Curseur secondaire : en butée, le champ se réannonce. Sur « Retour », rien à
  // parcourir : l'entrée se redit.
  function moveDetail(direction) {
    const card = currentCard();
    if (card === null) {
      announce(currentLine(), { assertive: true });
      return;
    }
    detail = stepDetail(detail, card, direction);
    announce(detailLine(card, detail), { assertive: true });
  }

  function activate() {
    if (isOnBack()) {
      playMenuSound("select");
      popScreen();
      return;
    }
    // Un statut se consulte, il ne s'active pas.
    playMenuSound("block");
    announce(currentLine(), { assertive: true });
  }

  function describe() {
    if (isOnBack()) {
      announce(currentLine(), { assertive: true });
      return;
    }
    const { key, params } = statusHelpLine(instances[index].status);
    announce(t(key, params), { assertive: true });
  }

  const announceOpening = () => announce(`${t("marbles.statuses.title")}. ${currentLine()}`, { assertive: true });

  const keyHandlers = {
    left: () => goTo(stepMenuCursor(index, -1, total)),
    right: () => goTo(stepMenuCursor(index, 1, total)),
    home: () => goTo(jumpMenuCursor(index, 0)),
    end: () => goTo(jumpMenuCursor(index, total - 1)),
    detailUp: () => moveDetail(1),
    detailDown: () => moveDetail(-1),
    activate,
    reannounce: announceOpening,
    back: () => {
      playMenuSound("cancel");
      popScreen();
    },
    describe,
  };

  return {
    helpSections: () => [{ id: "marblesStatuses" }],
    onEnter: announceOpening,
    onKeyDown(event) {
      const action = resolveAction(STATUS_BINDINGS, event.key, event.mods);
      const handler = keyHandlers[action];
      if (!handler) return;
      event.preventDefault();
      handler();
    },
  };
}

// `instances` : les statuts de la partie (game.statuses), dans l'ordre d'acquisition ;
// `rules` : les règles du jeu, pour leurs définitions.
export function openStatusMenu(instances, rules) {
  pushScreen(makeStatusScreen(instances, rules));
}
