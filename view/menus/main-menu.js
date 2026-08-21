// Définition du menu principal. Un fichier par menu : voir aussi
// options-menu.js. Ne contient aucune règle de jeu, uniquement de la
// structure de menu + des callbacks d'activation.
//
// title et les labels d'entrées sont des CLÉS de traduction (jamais des
// chaînes déjà traduites) : menu.js les résout via t() au moment de l'annonce.

import { announce } from "../announce.js";
import { openMenu } from "../menu.js";
import { t } from "../../i18n/index.js";
import { createOptionsMenu } from "./options-menu.js";

// Menu racine : jamais fermable (rien en dessous vers quoi revenir).
export function createMainMenu() {
  return {
    title: "menu.main.title",
    closable: false,
    entries: [
      {
        label: "menu.main.new_game",
        onActivate: () => announce(t("menu.main.new_game_stub")),
      },
      {
        label: "menu.main.options",
        onActivate: () => openMenu(createOptionsMenu()),
      },
    ],
  };
}
