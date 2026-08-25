// Définition du menu Options. Sous-menu ouvert depuis main-menu.js (hors
// partie, getSession() renvoie alors null) et depuis pause-menu.js (en
// partie). Fermable (Échap ou "Retour" ramènent à l'écran précédent).
//
// title et les labels d'entrées sont des CLÉS de traduction (jamais des
// chaînes déjà traduites) : lib/menu.js les résout via le t reçu en
// paramètre, au moment de l'annonce.

import { announce } from "../../lib/announce.js";
import { pushScreen, popScreen } from "../../lib/screens.js";
import { makeMenuScreen, reannounceActiveMenuEntry } from "../../lib/menu.js";
import { setGlobalVolume } from "../../lib/audio.js";
import { t } from "../../i18n/index.js";
import { resetAllPrefs, PREF_CONSTRAINTS } from "../../config/preferences.js";
import { refreshActiveBeaconVolumes } from "../audio/city-scene.js";
import { createAudioMenu } from "./audio-menu.js";
import { createNavigationMenu } from "./navigation-menu.js";
import { createSaveMenu } from "./save-menu.js";

// Confirmation avant le reset GLOBAL (destructif : écrase TOUTES les
// préférences, toutes catégories confondues) — contrairement au reset d'un
// seul sous-menu (voir audio-menu.js), qui agit directement. "Annuler" en
// première entrée (curseur par défaut) : une pression rapide/accidentelle
// d'Entrée à l'ouverture reste sans effet, il faut naviguer explicitement
// vers "Confirmer". Global aux PRÉFÉRENCES uniquement — ne touche jamais à
// une partie en cours ni à sa sauvegarde (voir save-menu.js).
function openResetAllConfirmation() {
  const menu = {
    title: "menu.options.reset_all_confirm_title",
    closable: true, // Échap = annuler
    entries: [
      {
        label: "menu.options.reset_all_cancel",
        onActivate: () => popScreen(),
      },
      {
        label: "menu.options.reset_all_confirm",
        onActivate: () => {
          popScreen();
          resetAllPrefs();
          refreshActiveBeaconVolumes();
          setGlobalVolume("music", PREF_CONSTRAINTS.musicVolume.default / 100);
          setGlobalVolume("ambience", PREF_CONSTRAINTS.ambienceVolume.default / 100);
          announce(t("menu.options.reset_all_done"), { assertive: true });
          reannounceActiveMenuEntry();
        },
      },
    ],
  };
  pushScreen(makeMenuScreen(menu, t));
}

// getSession : transmis tel quel à Sauvegarde (voir save-menu.js), seule
// catégorie qui en a besoin — Audio/Navigation n'en dépendent pas.
export function createOptionsMenu(getSession) {
  return {
    title: "menu.options.title",
    closable: true,
    entries: [
      {
        label: "menu.options.audio",
        // getPref/setPref des sliders/toggles viennent des préférences de
        // menu configurées une fois dans main.js (configureMenuPreferences,
        // voir lib/menu.js) — plus besoin de les repasser ici.
        onActivate: () => pushScreen(makeMenuScreen(createAudioMenu(), t)),
      },
      {
        label: "menu.options.navigation",
        onActivate: () => pushScreen(makeMenuScreen(createNavigationMenu(), t)),
      },
      {
        label: "menu.options.save",
        onActivate: () => pushScreen(makeMenuScreen(createSaveMenu(getSession), t)),
      },
      {
        // Global aux PRÉFÉRENCES (toutes catégories confondues) : destructif,
        // donc confirmation d'abord (voir openResetAllConfirmation). Le
        // reset lui-même (resetAllPrefs) est robuste par construction à
        // l'ajout futur d'autres catégories.
        label: "menu.options.reset_all",
        onActivate: () => openResetAllConfirmation(),
      },
      {
        label: "menu.options.back",
        onActivate: () => popScreen(),
      },
    ],
  };
}
