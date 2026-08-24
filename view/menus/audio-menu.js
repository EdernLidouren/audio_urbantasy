// Définition du sous-menu Audio (Options > Audio). Deux sliders de volume,
// tous deux persistés via config/preferences.js (voir lib/menu.js pour le
// mécanisme générique de slider), plus l'export/import fichier des
// préférences (global, pas spécifique à l'audio — voir plus bas pourquoi
// il vit ici). title et les labelKey/label d'entrées sont des CLÉS de
// traduction, résolues par lib/menu.js via le t reçu en paramètre.

import { announce } from "../../lib/announce.js";
import { popScreen } from "../../lib/screens.js";
import { reannounceActiveMenuEntry } from "../../lib/menu.js";
import { t } from "../../i18n/index.js";
import { setPref, PREF_CONSTRAINTS, exportPreferences, importPreferences } from "../../config/preferences.js";
import { refreshActiveBeaconVolumes } from "../audio/city-scene.js";

const BEACON = PREF_CONSTRAINTS.beaconVolume;
const FOOTSTEP = PREF_CONSTRAINTS.footstepVolume;

// Input file caché, créé UNE SEULE FOIS (pas à chaque ouverture du menu :
// createAudioMenu() est appelée à chaque fois) — pont vers le sélecteur de
// fichier natif de l'OS, déclenché depuis l'entrée "Importer".
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
    announce(t(result.success ? "menu.audio.import_success" : "menu.audio.import_failure"), { assertive: true });

    // Effet temps réel si une scène ville est active, et ré-annonce de la
    // ligne courante (qui relit getPref à la volée : aucun état à
    // rafraîchir côté slider, juste redire ce qui a changé).
    refreshActiveBeaconVolumes();
    reannounceActiveMenuEntry();
  });

  return fileInput;
}

export function createAudioMenu() {
  // Liste séparée (pas juste inline dans entries) : réutilisée telle quelle
  // par resetToDefaults ci-dessous, chaque slider connaît déjà son propre
  // prefKey/default — pas de liste de clés dupliquée ailleurs. min/max/
  // default viennent de PREF_CONSTRAINTS (config/preferences.js), pas
  // redéfinis ici : même source que la validation de persistance.
  const sliders = [
    {
      kind: "slider",
      labelKey: "audio.beacon_volume",
      prefKey: "beaconVolume",
      min: BEACON.min,
      max: BEACON.max,
      step: 1,
      bigStep: 5,
      unit: "%",
      default: BEACON.default,
      // Les balises sont déjà en train de jouer : sans ce callback, le
      // nouveau volume n'apparaîtrait qu'au prochain tick de la ville —
      // qui ne tourne pas tant que ce menu est au sommet de la pile.
      onChange: () => refreshActiveBeaconVolumes(),
    },
    {
      kind: "slider",
      labelKey: "audio.footstep_volume",
      prefKey: "footstepVolume",
      min: FOOTSTEP.min,
      max: FOOTSTEP.max,
      step: 1,
      bigStep: 5,
      unit: "%",
      default: FOOTSTEP.default,
      // Son PONCTUEL, jamais déjà en cours : la préférence est relue à
      // chaque pas (lib/audio.js, playOneShot), pas besoin de rafraîchir
      // quoi que ce soit ici.
    },
  ];

  function resetToDefaults() {
    for (const slider of sliders) {
      setPref(slider.prefKey, slider.default);
    }
    refreshActiveBeaconVolumes();
    announce(t("menu.audio.reset_done"), { assertive: true });
  }

  return {
    title: "menu.audio.title",
    closable: true,
    entries: [
      ...sliders,
      {
        label: "menu.audio.export",
        onActivate: () => exportPreferences(),
      },
      {
        // Ouvre le sélecteur de fichier natif de l'OS ; le résultat arrive
        // plus tard, de façon asynchrone, via le listener "change" posé
        // une fois pour toutes dans ensureFileInput() ci-dessus.
        label: "menu.audio.import",
        onActivate: () => ensureFileInput().click(),
      },
      {
        label: "menu.audio.reset",
        onActivate: resetToDefaults,
      },
      {
        label: "menu.options.back",
        onActivate: () => popScreen(),
      },
    ],
  };
}
