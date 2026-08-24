// Définition du menu Options. Sous-menu ouvert depuis main-menu.js.
// Fermable (Échap ou "Retour" ramènent au menu principal). Export/Import
// des préférences vivent ici (pas dans Audio) : ce sont des opérations
// GLOBALES sur TOUTES les préférences, pas des réglages audio.
//
// title et les labels d'entrées sont des CLÉS de traduction (jamais des
// chaînes déjà traduites) : lib/menu.js les résout via le t reçu en
// paramètre, au moment de l'annonce.

import { announce } from "../../lib/announce.js";
import { pushScreen, popScreen } from "../../lib/screens.js";
import { makeMenuScreen, reannounceActiveMenuEntry } from "../../lib/menu.js";
import { setMusicVolume } from "../../lib/audio.js";
import { t } from "../../i18n/index.js";
import { getPref, resetAllPrefs, exportPreferences, importPreferences, PREF_CONSTRAINTS } from "../../config/preferences.js";
import { refreshActiveBeaconVolumes } from "../audio/city-scene.js";
import { createAudioMenu } from "./audio-menu.js";
import { createNavigationMenu } from "./navigation-menu.js";

// Input file caché, créé UNE SEULE FOIS (pas à chaque ouverture du menu :
// createOptionsMenu() est appelée à chaque fois) — pont vers le sélecteur
// de fichier natif de l'OS, déclenché depuis l'entrée "Importer".
let fileInput = null;

function ensureFileInput() {
  if (fileInput) return fileInput;

  fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  // Hors écran plutôt que display:none : .click() programmatique est
  // fiable sur un élément non affiché mais toujours dans le flux du DOM.
  fileInput.style.position = "fixed";
  fileInput.style.left = "-9999px";
  document.body.appendChild(fileInput);

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    fileInput.value = ""; // permet de réimporter le même fichier ensuite
    if (!file) return; // sélection annulée

    const result = await importPreferences(file);
    announce(t(result.success ? "menu.options.import_success" : "menu.options.import_failure"), { assertive: true });

    // Effet temps réel si une scène ville est active (comportement
    // fonctionnel inchangé par ce déplacement). setMusicVolume : la musique
    // est un canal global déjà en train de jouer, indépendant d'une scène —
    // relit la valeur importée (ou son défaut si absente du fichier).
    // Ré-annonce GÉNÉRIQUE de la ligne courante, quel que soit le menu actif
    // — plus d'hypothèse "on est dans Audio" : les sliders relisent getPref
    // à la volée, il n'y a donc rien de spécifique à rafraîchir s'ils sont
    // affichés plus tard.
    refreshActiveBeaconVolumes();
    setMusicVolume(getPref("musicVolume", PREF_CONSTRAINTS.musicVolume.default) / 100);
    reannounceActiveMenuEntry();
  });

  return fileInput;
}

// Confirmation avant le reset GLOBAL (destructif : écrase TOUTES les
// préférences, toutes catégories confondues) — contrairement au reset d'un
// seul sous-menu (voir audio-menu.js), qui agit directement. "Annuler" en
// première entrée (curseur par défaut) : une pression rapide/accidentelle
// d'Entrée à l'ouverture reste sans effet, il faut naviguer explicitement
// vers "Confirmer".
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
          setMusicVolume(PREF_CONSTRAINTS.musicVolume.default / 100);
          announce(t("menu.options.reset_all_done"), { assertive: true });
          reannounceActiveMenuEntry();
        },
      },
    ],
  };
  pushScreen(makeMenuScreen(menu, t));
}

export function createOptionsMenu() {
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
        label: "menu.options.export",
        onActivate: () => exportPreferences(),
      },
      {
        // Ouvre le sélecteur de fichier natif de l'OS ; le résultat arrive
        // plus tard, de façon asynchrone, via le listener "change" posé
        // une fois pour toutes dans ensureFileInput() ci-dessus.
        label: "menu.options.import",
        onActivate: () => ensureFileInput().click(),
      },
      {
        // Global, toutes catégories confondues (pas seulement Audio) :
        // destructif, donc confirmation d'abord (voir
        // openResetAllConfirmation). Le reset lui-même (resetAllPrefs) est
        // robuste par construction à l'ajout futur d'autres catégories.
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
