// Construit un écran de menu consommable par la pile générique
// (view/screens.js) à partir d'un menu littéral. Le menu ne gère plus sa
// propre pile : c'est un écran parmi d'autres, poussé/retiré via
// pushScreen/popScreen. Aucune règle de jeu, pas d'import du core.
//
// Modèle :
//   menu   = { title, entries, closable, cursor }
//   entrée = { label, onActivate }
// title et entry.label sont des CLÉS de traduction, jamais des chaînes déjà
// résolues : la traduction se fait ici, au moment de l'annonce.

import { announce } from "./announce.js";
import { t } from "../i18n/index.js";
import { popScreen } from "./screens.js";

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

function moveCursor(menu, delta) {
  const total = menu.entries.length;
  if (total === 0) return;

  menu.cursor = (menu.cursor + delta + total) % total;
  announce(buildMoveAnnouncement(menu), { assertive: true });
}

function activateCurrent(menu) {
  const entry = currentEntry(menu);
  if (entry && typeof entry.onActivate === "function") {
    entry.onActivate();
  }
}

const MENU_KEY_HANDLERS = {
  ArrowUp: (menu) => moveCursor(menu, -1),
  ArrowDown: (menu) => moveCursor(menu, 1),
  Enter: (menu) => activateCurrent(menu),
  " ": (menu) => activateCurrent(menu),
  // closable gouverne Échap uniquement (une action "Retour" explicite dans
  // les entrées peut retirer l'écran sans passer par ce garde-fou).
  Escape: (menu) => {
    if (menu.closable) popScreen();
  },
};

export function makeMenuScreen(menu) {
  // cursor par défaut à 0 si absent.
  if (menu.cursor === undefined || menu.cursor === null) {
    menu.cursor = 0;
  }

  return {
    onEnter() {
      announce(buildOpenAnnouncement(menu), { assertive: true });
    },
    onKeyDown(event) {
      const handler = MENU_KEY_HANDLERS[event.key];
      if (!handler) return;

      // Empêche le comportement par défaut du navigateur (ex. espace qui
      // scrolle la page) puisque role="application" nous laisse tout gérer.
      event.preventDefault();
      handler(menu);
    },
  };
}
