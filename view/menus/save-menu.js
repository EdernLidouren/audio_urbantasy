// Sous-menu Sauvegarde (Options > Sauvegarde) : sauvegarde manuelle de la
// PARTIE, bascule de l'auto-save aux transitions, et les opérations
// GLOBALES sur les PRÉFÉRENCES (export/import) — déplacées ici depuis
// Options (voir options-menu.js), avec des libellés explicites
// "préférences" pour ne jamais laisser croire qu'elles touchent à la
// partie : ce sont deux choses distinctes qui cohabitent ici parce
// qu'elles relèvent toutes deux de la persistance, pas parce qu'elles
// manipulent la même donnée.
//
// title et les labelKey/label d'entrées sont des CLÉS de traduction,
// résolues par lib/menu.js via le t reçu en paramètre.

import { announce } from "../../lib/announce.js";
import { popScreen } from "../../lib/screens.js";
import { reannounceActiveMenuEntry } from "../../lib/menu.js";
import { setGlobalVolume } from "../../lib/audio.js";
import { t } from "../../i18n/index.js";
import { getPref, PREF_CONSTRAINTS, exportPreferences, importPreferences } from "../../config/preferences.js";
import { refreshActiveBeaconVolumes } from "../audio/city-scene.js";
import { saveGame } from "../save-storage.js";

const AUTOSAVE = PREF_CONSTRAINTS.autoSaveOnTransition;

// Input file caché pour l'import de PRÉFÉRENCES (pas la partie) — même
// patron que l'ancien emplacement dans options-menu.js, déplacé ici avec
// l'entrée qui le déclenche. Créé UNE SEULE FOIS (pas à chaque ouverture du
// menu : createSaveMenu() est appelée à chaque fois).
let fileInput = null;

function ensureFileInput() {
  if (fileInput) return fileInput;

  fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.style.position = "fixed";
  fileInput.style.left = "-9999px";
  document.body.appendChild(fileInput);

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    fileInput.value = ""; // permet de réimporter le même fichier ensuite
    if (!file) return; // sélection annulée

    const result = await importPreferences(file);
    announce(t(result.success ? "menu.save.import_success" : "menu.save.import_failure"), { assertive: true });

    // Effet temps réel si une scène ville est active (comportement
    // fonctionnel inchangé par ce déplacement depuis options-menu.js).
    refreshActiveBeaconVolumes();
    setGlobalVolume("music", getPref("musicVolume", PREF_CONSTRAINTS.musicVolume.default) / 100);
    setGlobalVolume("ambience", getPref("ambienceVolume", PREF_CONSTRAINTS.ambienceVolume.default) / 100);
    reannounceActiveMenuEntry();
  });

  return fileInput;
}

// getSession : accesseur (peut renvoyer null hors partie — ce sous-menu
// reste aussi accessible depuis le menu principal, voir main-menu.js). Sans
// partie en cours, "Sauvegarder" annonce clairement qu'il n'y a rien à
// sauvegarder plutôt que d'échouer en silence.
export function createSaveMenu(getSession) {
  function saveNow() {
    const session = getSession();
    if (!session) {
      announce(t("save.no_active_game"), { assertive: true });
      return;
    }
    // saveGame() joue déjà le son + l'annonce de confirmation (voir
    // view/save-storage.js) : rien à ajouter ici, une ré-annonce
    // écraserait aussitôt la confirmation avant qu'elle soit entendue.
    saveGame(session);
  }

  return {
    title: "menu.save.title",
    closable: true,
    entries: [
      {
        label: "save.now",
        onActivate: saveNow,
      },
      {
        kind: "toggle",
        labelKey: "save.autosave",
        prefKey: "autoSaveOnTransition",
        default: AUTOSAVE.default,
      },
      {
        label: "menu.save.export",
        onActivate: () => exportPreferences(),
      },
      {
        // Ouvre le sélecteur de fichier natif de l'OS ; le résultat arrive
        // plus tard, de façon asynchrone, via le listener "change" posé
        // une fois pour toutes dans ensureFileInput() ci-dessus.
        label: "menu.save.import",
        onActivate: () => ensureFileInput().click(),
      },
      {
        label: "menu.options.back",
        onActivate: () => popScreen(),
      },
    ],
  };
}
