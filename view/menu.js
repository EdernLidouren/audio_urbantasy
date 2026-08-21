// Système de menu : navigation clavier dans des menus verticaux, annoncée au
// lecteur d'écran via announce.js. Fait partie de la vue : pas de règle de
// jeu, pas d'import du core. Objets plats + fonctions, pas de classe.
//
// Modèle :
//   menu   = { title, entries, closable, cursor }
//   entrée = { label, onActivate }
//
// État : une pile de menus. Le sommet est le menu actif.

import { announce } from "./announce.js";
import { t } from "../i18n/index.js";

const menuStack = [];

function topMenu() {
  return menuStack[menuStack.length - 1];
}

// menu.title et entry.label sont des CLÉS de traduction, jamais des chaînes
// déjà résolues : la traduction se fait ici, au moment de l'annonce.
function formatPosition(index, total) {
  return t("menu.position", { index: index + 1, total });
}

function currentEntry(menu) {
  return menu.entries[menu.cursor];
}

// "titre. entrée. position" — utilisé à l'ouverture et au retour.
function buildOpenAnnouncement(menu) {
  const entry = currentEntry(menu);
  return `${t(menu.title)}. ${t(entry.label)}. ${formatPosition(menu.cursor, menu.entries.length)}`;
}

// "entrée. position" — sans le titre, utilisé au déplacement.
function buildMoveAnnouncement(menu) {
  const entry = currentEntry(menu);
  return `${t(entry.label)}. ${formatPosition(menu.cursor, menu.entries.length)}`;
}

export function openMenu(menu) {
  // cursor par défaut à 0 si absent.
  if (menu.cursor === undefined || menu.cursor === null) {
    menu.cursor = 0;
  }
  menuStack.push(menu);
  announce(buildOpenAnnouncement(menu), { assertive: true });
}

export function closeTopMenu() {
  const menu = topMenu();
  if (!menu || !menu.closable) return;

  menuStack.pop();

  const revealed = topMenu();
  if (revealed) {
    announce(buildOpenAnnouncement(revealed), { assertive: true });
  }
}

export function moveCursor(delta) {
  const menu = topMenu();
  if (!menu) return;

  const total = menu.entries.length;
  if (total === 0) return;

  menu.cursor = (menu.cursor + delta + total) % total;
  announce(buildMoveAnnouncement(menu), { assertive: true });
}

export function activateCurrent() {
  const menu = topMenu();
  if (!menu) return;

  const entry = currentEntry(menu);
  if (entry && typeof entry.onActivate === "function") {
    entry.onActivate();
  }
}

export function isMenuOpen() {
  return menuStack.length > 0;
}
