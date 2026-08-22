// Définition du menu principal. Un fichier par menu : voir aussi
// options-menu.js. Ne contient aucune règle de jeu, uniquement de la
// structure de menu + des callbacks d'activation.
//
// title et les labels d'entrées sont des CLÉS de traduction (jamais des
// chaînes déjà traduites) : lib/menu.js les résout via le t reçu en
// paramètre, au moment de l'annonce.

import { announce } from "../../lib/announce.js";
import { pushScreen } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { t } from "../../i18n/index.js";
import { createOptionsMenu } from "./options-menu.js";

// enterCity : callback fourni par main.js (crée la session de jeu et pousse
// l'écran ville). Ce menu ne connaît ni le niveau ni la session — il se
// contente d'appeler ce qu'on lui donne.
//
// Menu racine : jamais fermable (rien en dessous vers quoi revenir).
export function createMainMenu(enterCity) {
  return {
    title: "menu.main.title",
    closable: false,
    entries: [
      {
        label: "menu.main.new_game",
        onActivate: () => announce(t("menu.main.new_game_stub")),
      },
      {
        label: "menu.main.city_test",
        onActivate: () => enterCity(),
      },
      {
        label: "menu.main.options",
        onActivate: () => pushScreen(makeMenuScreen(createOptionsMenu(), t)),
      },
    ],
  };
}
