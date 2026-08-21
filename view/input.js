// Routeur d'entrée clavier -> actions de menu. Pour l'instant, tant qu'un
// menu est ouvert, toutes les touches lui sont destinées (le jeu n'a pas
// encore d'actions clavier propres). Quand aucun menu n'est ouvert, ce
// routeur ne fait rien : le câblage clavier -> actions du core viendra plus
// tard, câblé séparément dans main.js.

import { isMenuOpen, moveCursor, activateCurrent, closeTopMenu } from "./menu.js";

const MENU_KEY_HANDLERS = {
  ArrowUp: () => moveCursor(-1),
  ArrowDown: () => moveCursor(1),
  Enter: () => activateCurrent(),
  " ": () => activateCurrent(),
  Escape: () => closeTopMenu(),
};

export function initInput(target) {
  target.addEventListener("keydown", (event) => {
    if (!isMenuOpen()) return;

    const handler = MENU_KEY_HANDLERS[event.key];
    if (!handler) return;

    // Empêche le comportement par défaut du navigateur (ex. espace qui
    // scrolle la page) puisque role="application" nous laisse tout gérer.
    event.preventDefault();
    handler();
  });
}
