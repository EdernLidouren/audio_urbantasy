// Brique portable : construit un écran de menu (consommable par la pile
// générique screens.js) à partir d'un menu littéral. Aucune connaissance
// d'aucun jeu ni d'aucune locale : la fonction de traduction (t) est reçue
// en paramètre, jamais importée depuis un module i18n concret — c'est ce qui
// permet de déposer ce fichier tel quel dans un autre projet.
//
// Modèle :
//   menu   = { title, entries, closable, cursor }
//   entrée = { label, onActivate }
// title et entry.label sont des CLÉS de traduction, jamais des chaînes déjà
// résolues : la traduction se fait ici, au moment de l'annonce, via t.

import { announce } from "./announce.js";
import { popScreen } from "./screens.js";

export function makeMenuScreen(menu, t) {
  // cursor par défaut à 0 si absent.
  if (menu.cursor === undefined || menu.cursor === null) {
    menu.cursor = 0;
  }

  function formatPosition(index, total) {
    return t("menu.position", { index: index + 1, total });
  }

  function currentEntry() {
    return menu.entries[menu.cursor];
  }

  // "titre. entrée. position" — utilisé à l'ouverture et au retour.
  function buildOpenAnnouncement() {
    const entry = currentEntry();
    return `${t(menu.title)}. ${t(entry.label)}. ${formatPosition(menu.cursor, menu.entries.length)}`;
  }

  // "entrée. position" — sans le titre, utilisé au déplacement.
  function buildMoveAnnouncement() {
    const entry = currentEntry();
    return `${t(entry.label)}. ${formatPosition(menu.cursor, menu.entries.length)}`;
  }

  function moveCursor(delta) {
    const total = menu.entries.length;
    if (total === 0) return;

    menu.cursor = (menu.cursor + delta + total) % total;
    announce(buildMoveAnnouncement(), { assertive: true });
  }

  function activateCurrent() {
    const entry = currentEntry();
    if (entry && typeof entry.onActivate === "function") {
      entry.onActivate();
    }
  }

  const keyHandlers = {
    ArrowUp: () => moveCursor(-1),
    ArrowDown: () => moveCursor(1),
    Enter: () => activateCurrent(),
    " ": () => activateCurrent(),
    // closable gouverne Échap uniquement (une action "Retour" explicite dans
    // les entrées peut retirer l'écran sans passer par ce garde-fou).
    Escape: () => {
      if (menu.closable) popScreen();
    },
  };

  return {
    onEnter() {
      announce(buildOpenAnnouncement(), { assertive: true });
    },
    onKeyDown(event) {
      const handler = keyHandlers[event.key];
      if (!handler) return;

      // Empêche le comportement par défaut du navigateur (ex. espace qui
      // scrolle la page) puisque role="application" nous laisse tout gérer.
      event.preventDefault();
      handler();
    },
  };
}
