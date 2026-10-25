// Sous-menu Navigation (Options > Navigation) : bascules oui/non qui
// gouvernent le comportement générique des menus eux-mêmes (voir
// lib/menu.js) — cyclage haut/bas, préfixage des annonces de repli/inchangé
// par une étoile, suffixage de la position ("x sur y") — PLUS deux réglages
// propres à la carte de la ville (voir view/menus/city-map-menu.js,
// lib/coordinate-label.js) : affichage alphanumérique et inversion des
// ordonnées de la touche "x" (coordonnées). Toutes persistées via
// config/preferences.js comme le reste des préférences ; les trois
// premières sont lues par lib/menu.js via les préférences injectées une
// fois (configureMenuPreferences, câblé dans main.js), les deux dernières
// directement par city-map-menu.js — pas ici, ce fichier ne fait que les
// exposer au réglage.

import { popScreen } from "../../lib/screens.js";
import { PREF_CONSTRAINTS } from "../../config/preferences.js";

const CYCLING = PREF_CONSTRAINTS.menuCycling;
const STAR_PREFIX = PREF_CONSTRAINTS.menuStarPrefix;
const INDEX_SUFFIX = PREF_CONSTRAINTS.menuIndexSuffix;
const CITY_MAP_ALPHA = PREF_CONSTRAINTS.cityMapAlphaCoordinates;
const CITY_MAP_INVERT_Y = PREF_CONSTRAINTS.cityMapInvertY;
const CONFIRM_SCENE_CHANGE = PREF_CONSTRAINTS.confirmSceneChange;

export function createNavigationMenu() {
  return {
    title: "menu.navigation.title",
    closable: true,
    entries: [
      {
        kind: "toggle",
        labelKey: "menu.navigation.cycling",
        descriptionKey: "menu.navigation.cycling.description",
        prefKey: "menuCycling",
        default: CYCLING.default,
      },
      {
        kind: "toggle",
        labelKey: "menu.navigation.star_prefix",
        descriptionKey: "menu.navigation.star_prefix.description",
        prefKey: "menuStarPrefix",
        default: STAR_PREFIX.default,
      },
      {
        kind: "toggle",
        labelKey: "menu.navigation.index_suffix",
        descriptionKey: "menu.navigation.index_suffix.description",
        prefKey: "menuIndexSuffix",
        default: INDEX_SUFFIX.default,
      },
      {
        kind: "toggle",
        labelKey: "menu.navigation.city_map_alpha",
        descriptionKey: "menu.navigation.city_map_alpha.description",
        prefKey: "cityMapAlphaCoordinates",
        default: CITY_MAP_ALPHA.default,
      },
      {
        kind: "toggle",
        labelKey: "menu.navigation.city_map_invert_y",
        descriptionKey: "menu.navigation.city_map_invert_y.description",
        prefKey: "cityMapInvertY",
        default: CITY_MAP_INVERT_Y.default,
      },
      {
        kind: "toggle",
        labelKey: "menu.navigation.confirm_scene_change",
        descriptionKey: "menu.navigation.confirm_scene_change.description",
        prefKey: "confirmSceneChange",
        default: CONFIRM_SCENE_CHANGE.default,
      },
      {
        label: "menu.options.back",
        onActivate: () => popScreen(),
      },
    ],
  };
}
