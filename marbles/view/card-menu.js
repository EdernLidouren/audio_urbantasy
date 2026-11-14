// Jeu des billes : le MENU HORIZONTAL À FICHES, commun aux menus des piles de billes
// (sac, défausse, pot : marbles/view/pile-screen.js) et à celui des statuts
// (marbles/view/status-screen.js). Une entrée par élément, de gauche à droite, puis
// « Retour » ; Échap ferme aussi. Un écran à part, et non lib/menu.js, dont les menus
// se parcourent de haut en bas et réservent Ctrl+flèche : ici, Ctrl+haut et Ctrl+bas
// parcourent la FICHE de l'élément sous le curseur (lib/detail-card.js). Bornes,
// cyclage et étoile restent ceux des menus, par leurs briques (stepMenuCursor,
// jumpMenuCursor, announceMenuLine).
//
// Une liste vide le dit, par une entrée en lecture seule (« Aucune bille. »), avant
// « Retour » : le menu ne s'ouvre jamais sur un « Retour » seul, muet sur la raison.
//
// Chaque menu garde SA table de touches (defineBindings), pour que l'aide des touches
// le décrive ; ce module ne déclare rien. Rien de la partie n'est lu ni modifié ici :
// les éléments sont reçus à l'ouverture, dans l'ordre où ils doivent se dire.

import { announce } from "../../lib/announce.js";
import { popScreen } from "../../lib/screens.js";
import { resolveAction } from "../../lib/input.js";
import { announceMenuLine, formatMenuPosition, jumpMenuCursor, stepMenuCursor } from "../../lib/menu.js";
import { detailAfterMainMove, detailLine, mainWithDetail, stepDetail } from "../../lib/detail-card.js";
import { t } from "../../data/i18n/index.js";
import { MARBLES_SETTINGS } from "../config/values.js";
import { playMenuSound } from "../../view/menu-sounds.js";

// Une ligne et sa position dans le menu : « amorti, 3 tours. 1 sur 3 ».
export function withPosition(label, index, total) {
  const position = formatMenuPosition(index, total, t);
  return position ? `${label}. ${position}` : label;
}

// L'écran. `spec` :
//   bindings   la table de touches du menu (defineBindings) : left, right, home, end,
//              detailUp, detailDown, activate, reannounce, back, et ses touches à lui ;
//   helpId     la section de l'aide des touches (le nom de sa table) ;
//   titleKey   le titre, une clé i18n ; `titleParams` (facultatif), ses valeurs ;
//   count      le nombre d'éléments ;
//   emptyKey   ce que dit l'entrée d'une liste vide, une clé i18n ;
//   cardAt(index, total)  la fiche de l'élément, son annonce principale comprise
//              (position comprise : withPosition) ;
//   onCursor(index)  (facultatif) quand le curseur arrive sur un élément (à
//              l'ouverture, ou en s'y déplaçant) : une balise ;
//   actions    (facultatif) ses touches à lui, { action: (index, line) => void } :
//              `index` undefined hors d'un élément (« Retour », l'entrée d'une liste
//              vide) ; `line`, la ligne courante telle qu'elle se dit.
export function makeCardMenuScreen({ bindings, helpId, titleKey, titleParams, count, emptyKey, cardAt, onCursor = () => {}, actions = {} }) {
  // L'entrée d'une liste vide, puis « Retour », comptent comme des entrées.
  const lines = Math.max(count, 1);
  const total = lines + 1;
  let index = 0;
  let detail = 0;
  let opened = false;

  const isOnBack = () => index === lines;
  const isOnItem = () => index < count;

  // La fiche de l'entrée courante ; « Retour » et l'entrée vide n'en ont pas.
  const currentCard = () => (isOnItem() ? cardAt(index, total) : null);

  function currentLine() {
    if (isOnBack()) return withPosition(t("marbles.pile.back"), index, total);
    if (!isOnItem()) return withPosition(t(emptyKey), index, total);
    return mainWithDetail(currentCard(), detail);
  }

  function goTo({ index: next, boundary }) {
    const moved = next !== index;
    index = next;
    detail = detailAfterMainMove(detail, MARBLES_SETTINGS.cardResetOnMove);
    announceMenuLine(currentLine(), boundary);
    if (moved && isOnItem()) onCursor(index);
  }

  // Curseur secondaire : en butée, le champ se réannonce. Hors d'un élément, rien à
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
    // Un élément se consulte, il ne s'active pas : comme une ligne de menu en lecture
    // seule.
    playMenuSound("block");
    announce(currentLine(), { assertive: true });
  }

  const announceOpening = () => announce(`${t(titleKey, titleParams)}. ${currentLine()}`, { assertive: true });

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
    ...Object.fromEntries(Object.entries(actions).map(([action, run]) => [action, () => run(isOnItem() ? index : undefined, currentLine())])),
  };

  return {
    helpSections: () => [{ id: helpId }],
    // À l'ouverture seulement : au retour de l'aide, le curseur n'a pas bougé.
    onEnter() {
      announceOpening();
      if (!opened && isOnItem()) onCursor(index);
      opened = true;
    },
    onKeyDown(event) {
      const action = resolveAction(bindings, event.key, event.mods);
      const handler = keyHandlers[action];
      if (!handler) return;
      event.preventDefault();
      handler();
    },
  };
}
