// Définition du menu Options. Sous-menu ouvert depuis main-menu.js.
// Fermable (Échap ou "Retour" ramènent au menu principal).
//
// title et les labels d'entrées sont des CLÉS de traduction (jamais des
// chaînes déjà traduites) : menu.js les résout via t() au moment de l'annonce.

import { announce } from "../../lib/announce.js";
import { popScreen } from "../../lib/screens.js";
import { t } from "../../i18n/index.js";

export function createOptionsMenu() {
  return {
    title: "menu.options.title",
    closable: true,
    entries: [
      {
        label: "menu.options.volume",
        onActivate: () => announce(t("menu.options.volume_stub")),
      },
      {
        label: "menu.options.back",
        onActivate: () => popScreen(),
      },
    ],
  };
}
