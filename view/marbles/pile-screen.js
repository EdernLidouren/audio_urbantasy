// Jeu des billes : le MENU d'une pile de billes, sac ou défausse. Menu horizontal
// (gauche et droite) : une entrée par bille, puis « Retour ». Un écran à part, et
// non lib/menu.js, dont les menus se parcourent de haut en bas et réservent
// Ctrl+flèche : ici, Ctrl+haut et Ctrl+bas parcourent la fiche de la bille
// (view/marbles/card.js). Bornes, cyclage et étoile restent ceux des menus, par
// leurs briques (stepMenuCursor, jumpMenuCursor, announceMenuLine). E et Maj+E disent
// les mots-clés de la bille sous le curseur (view/marbles/keywords.js).
//
// Rien de la partie n'est lu ni modifié ici : la liste est reçue à l'ouverture,
// dans l'ordre où elle doit se dire. C'est l'appelant qui décide de cet ordre.
//
// Comme sur l'écran de jeu, le curseur qui arrive sur une bille (à l'ouverture,
// ou en se déplaçant) fait entendre sa balise (view/marbles/sounds.js).

import { announce } from "../../lib/announce.js";
import { popScreen, pushScreen } from "../../lib/screens.js";
import { resolveAction, defineBindings } from "../../lib/input.js";
import { announceMenuLine, formatMenuPosition, jumpMenuCursor, stepMenuCursor } from "../../lib/menu.js";
import { detailAfterMainMove, detailLine, mainWithDetail, stepDetail } from "../../lib/detail-card.js";
import { t } from "../../data/i18n/index.js";
import { MARBLES_SETTINGS } from "../../config/marbles-values.js";
import { playMenuSound } from "../menu-sounds.js";
import { marbleCard } from "./card.js";
import { describeMarbleInList } from "./narration.js";
import { playFocusBeacon } from "./sounds.js";
import { keywordsText, openKeywordsMenu } from "./keywords.js";

const PILE_BINDINGS = defineBindings("marblesPile", {
  left: { keys: ["ArrowLeft"], mods: [] },
  right: { keys: ["ArrowRight"], mods: [] },
  home: { keys: ["Home"], mods: [] },
  end: { keys: ["End"], mods: [] },
  detailUp: { keys: ["ArrowUp"], mods: ["ctrl"] },
  detailDown: { keys: ["ArrowDown"], mods: ["ctrl"] },
  activate: { keys: ["Enter", " "], mods: [] },
  reannounce: { keys: ["Backspace"], mods: [] },
  back: { keys: ["Escape"], mods: [] },
  // Les mots-clés de la bille sous le curseur (view/marbles/keywords.js).
  keywords: { keys: ["e"], mods: [] },
  keywordsMenu: { keys: ["e"], mods: ["shift"] },
});

function makePileScreen(titleKey, marbles, rules, tally) {
  const total = marbles.length + 1; // « Retour » compte comme une entrée
  let index = 0;
  let detail = 0;
  let opened = false;

  const isOnBack = () => index === marbles.length;

  function backLine() {
    const label = t("marbles.pile.back");
    const position = formatMenuPosition(index, total, t);
    return position ? `${label}. ${position}` : label;
  }

  // La fiche de l'entrée courante ; « Retour » n'en a pas.
  function currentCard() {
    if (isOnBack()) return null;
    return marbleCard(marbles[index], describeMarbleInList(marbles[index], index, total, rules, t), rules, t, { tally });
  }

  function currentLine() {
    const card = currentCard();
    return card === null ? backLine() : mainWithDetail(card, detail);
  }

  // La balise de l'entrée courante, si c'est une bille.
  function beacon() {
    if (!isOnBack()) playFocusBeacon(marbles[index], undefined, rules.types);
  }

  function goTo({ index: next, boundary }) {
    const moved = next !== index;
    index = next;
    detail = detailAfterMainMove(detail, MARBLES_SETTINGS.cardResetOnMove);
    announceMenuLine(currentLine(), boundary);
    if (moved) beacon();
  }

  // Curseur secondaire : en butée, le champ se réannonce, sans son. Sur « Retour »,
  // rien à parcourir : l'entrée se redit.
  function moveDetail(direction) {
    const card = currentCard();
    if (card === null) {
      announce(backLine(), { assertive: true });
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
    // Une bille se consulte, elle ne s'active pas : comme une ligne de menu en
    // lecture seule.
    playMenuSound("block");
    announce(currentLine(), { assertive: true });
  }

  function back() {
    playMenuSound("cancel");
    popScreen();
  }

  const announceOpening = () => announce(`${t(titleKey)}. ${currentLine()}`, { assertive: true });

  // La bille sous le curseur, ou undefined sur « Retour ».
  const marbleUnderCursor = () => (isOnBack() ? undefined : marbles[index]);

  const keyHandlers = {
    left: () => goTo(stepMenuCursor(index, -1, total)),
    right: () => goTo(stepMenuCursor(index, 1, total)),
    home: () => goTo(jumpMenuCursor(index, 0)),
    end: () => goTo(jumpMenuCursor(index, total - 1)),
    detailUp: () => moveDetail(1),
    detailDown: () => moveDetail(-1),
    activate,
    reannounce: announceOpening,
    back,
    keywords: () => announce(keywordsText(marbleUnderCursor(), rules, t), { assertive: true }),
    keywordsMenu: () => {
      playMenuSound("select");
      openKeywordsMenu(marbleUnderCursor(), rules);
    },
  };

  return {
    helpSections: () => [{ id: "marblesPile" }],
    // À l'ouverture seulement : au retour de l'aide, le curseur n'a pas bougé.
    onEnter() {
      announceOpening();
      if (!opened) beacon();
      opened = true;
    },
    onKeyDown(event) {
      const action = resolveAction(PILE_BINDINGS, event.key, event.mods);
      const handler = keyHandlers[action];
      if (!handler) return;
      event.preventDefault();
      handler();
    },
  };
}

// `titleKey` : le titre du menu, une clé i18n ; `marbles` : les ids à dire, dans
// l'ordre voulu ; `rules` : les règles du jeu, pour les fiches ; `tally` : les
// valeurs de partie, pour la valeur actuelle des montants calculés.
export function openPileMenu(titleKey, marbles, rules, tally) {
  pushScreen(makePileScreen(titleKey, marbles, rules, tally));
}
