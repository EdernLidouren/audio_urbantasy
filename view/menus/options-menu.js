// Définition du menu Options. Sous-menu ouvert depuis main-menu.js.
// Fermable (Échap ou "Retour" ramènent au menu principal).
//
// title et les labels d'entrées sont des CLÉS de traduction (jamais des
// chaînes déjà traduites) : lib/menu.js les résout via le t reçu en
// paramètre, au moment de l'annonce.

import { announce } from "../../lib/announce.js";
import { pushScreen, popScreen } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { t } from "../../i18n/index.js";
import { getPref, setPref, resetAllPrefs } from "../../config/preferences.js";
import { refreshActiveBeaconVolumes } from "../audio/city-scene.js";
import { createAudioMenu } from "./audio-menu.js";

export function createOptionsMenu() {
  return {
    title: "menu.options.title",
    closable: true,
    entries: [
      {
        label: "menu.options.audio",
        // getPref/setPref injectés ici (pas importés par lib/menu.js lui-
        // même) : le sous-menu Audio a des sliders, celui-ci non, donc lui
        // n'en a pas besoin.
        onActivate: () => pushScreen(makeMenuScreen(createAudioMenu(), t, { getPref, setPref })),
      },
      {
        // Global, toutes catégories confondues (pas seulement Audio) : vide
        // tout le store de préférences (voir resetAllPrefs), donc reste
        // correct sans modification si d'autres catégories s'ajoutent un
        // jour. refreshActiveBeaconVolumes() couvre le cas où une scène
        // ville est active, sinon no-op.
        label: "menu.options.reset_all",
        onActivate: () => {
          resetAllPrefs();
          refreshActiveBeaconVolumes();
          announce(t("menu.options.reset_all_done"), { assertive: true });
        },
      },
      {
        label: "menu.options.back",
        onActivate: () => popScreen(),
      },
    ],
  };
}
