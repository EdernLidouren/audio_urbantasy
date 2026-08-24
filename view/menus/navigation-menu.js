// Sous-menu Navigation (Options > Navigation) : trois bascules oui/non qui
// gouvernent le comportement générique des menus eux-mêmes (voir
// lib/menu.js) — cyclage haut/bas, préfixage des annonces de repli/inchangé
// par une étoile, suffixage de la position ("x sur y"). Toutes trois
// persistées via config/preferences.js comme le reste des préférences ;
// lues par lib/menu.js via les préférences injectées une fois
// (configureMenuPreferences, câblé dans main.js), pas ici.

import { popScreen } from "../../lib/screens.js";
import { PREF_CONSTRAINTS } from "../../config/preferences.js";

const CYCLING = PREF_CONSTRAINTS.menuCycling;
const STAR_PREFIX = PREF_CONSTRAINTS.menuStarPrefix;
const INDEX_SUFFIX = PREF_CONSTRAINTS.menuIndexSuffix;

export function createNavigationMenu() {
  return {
    title: "menu.navigation.title",
    closable: true,
    entries: [
      {
        kind: "toggle",
        labelKey: "menu.navigation.cycling",
        prefKey: "menuCycling",
        default: CYCLING.default,
      },
      {
        kind: "toggle",
        labelKey: "menu.navigation.star_prefix",
        prefKey: "menuStarPrefix",
        default: STAR_PREFIX.default,
      },
      {
        kind: "toggle",
        labelKey: "menu.navigation.index_suffix",
        prefKey: "menuIndexSuffix",
        default: INDEX_SUFFIX.default,
      },
      {
        label: "menu.options.back",
        onActivate: () => popScreen(),
      },
    ],
  };
}
