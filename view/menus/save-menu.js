// Sous-menu Sauvegarde (Options > Sauvegarde) : RÉGLAGES de persistance
// (auto-save sur transition, auto-save temporelle) et import/export de la
// PARTIE et des PRÉFÉRENCES. La sauvegarde MANUELLE elle-même vit dans le
// menu pause (voir pause-menu.js, entrée "Sauvegarder" en tête) — une
// action de save n'a de sens qu'EN partie, alors qu'Options reste
// accessible hors partie (menu principal) : pas sa place ici.
//
// Import/export de la partie et des préférences cohabitent ici (tous deux
// des opérations de persistance), mais restent deux choses DISTINCTES —
// libellés explicites ("la partie" / "les préférences") pour ne jamais les
// confondre : l'une manipule la progression de jeu, l'autre les réglages.
//
// title et les labelKey/label d'entrées sont des CLÉS de traduction,
// résolues par lib/menu.js via le t reçu en paramètre.

import { announce } from "../../lib/announce.js";
import { pushScreen, popScreen } from "../../lib/screens.js";
import { makeMenuScreen, makeMessageScreen } from "../../lib/menu.js";
import { setGlobalVolume } from "../../lib/audio.js";
import { t } from "../../data/i18n/index.js";
import { getPref, PREF_CONSTRAINTS, exportPreferences, importPreferences } from "../../config/preferences.js";
import { refreshActiveBeaconVolumes } from "../audio/city-scene.js";
import { exportGame, importGame, playSaveSound } from "../save-storage.js";
import { reportDroppedEntities, reportDroppedItems } from "../debug-warnings.js";
import { openDebugWarningsIfUnseen } from "./debug-warnings-menu.js";

const AUTOSAVE_TRANSITION = PREF_CONSTRAINTS.autoSaveOnTransition;
const AUTOSAVE_INTERVAL = PREF_CONSTRAINTS.autoSaveIntervalMinutes;
const SAVE_SOUND_ENABLED = PREF_CONSTRAINTS.saveSoundEnabled;

// Gestionnaire de remplacement de partie, enregistré UNE FOIS par
// view/city-screen.js (setGameReplaceHandler, au moment de sa
// construction) — même principe que setTeleportHandler (voir
// view/interaction.js) : ce module déclenche l'effet (remplacer la
// session, reconstruire la scène) sans avoir besoin de les connaître.
// null hors partie (aucun écran ville vivant pour l'accueillir) : voir le
// garde dans applyImportedGame ci-dessous.
let gameReplaceHandler = null;

export function setGameReplaceHandler(handler) {
  gameReplaceHandler = handler;
}

// Input file caché pour l'import de PRÉFÉRENCES (pas la partie — voir
// gameFileInput plus bas). Créé UNE SEULE FOIS (pas à chaque ouverture du
// menu : createSaveMenu() est appelée à chaque fois).
let prefsFileInput = null;

function ensurePrefsFileInput() {
  if (prefsFileInput) return prefsFileInput;

  prefsFileInput = document.createElement("input");
  prefsFileInput.type = "file";
  prefsFileInput.accept = ".json,application/json";
  prefsFileInput.style.position = "fixed";
  prefsFileInput.style.left = "-9999px";
  document.body.appendChild(prefsFileInput);

  prefsFileInput.addEventListener("change", async () => {
    const file = prefsFileInput.files[0];
    prefsFileInput.value = ""; // permet de réimporter le même fichier ensuite
    if (!file) return; // sélection annulée

    const result = await importPreferences(file);

    // Effet temps réel si une scène ville est active (comportement
    // fonctionnel inchangé par le déplacement depuis options-menu.js).
    refreshActiveBeaconVolumes();
    setGlobalVolume("music", getPref("musicVolume", PREF_CONSTRAINTS.musicVolume.default) / 100);
    setGlobalVolume("ambience", getPref("ambienceVolume", PREF_CONSTRAINTS.ambienceVolume.default) / 100);

    // Écran-message plutôt qu'une simple annonce : le résultat doit être
    // entendu en entier, jamais écrasé par une ré-annonce immédiate de la
    // ligne de menu courante (voir lib/menu.js/makeMessageScreen).
    pushScreen(makeMessageScreen(result.success ? "menu.save.import_success" : "menu.save.import_failure", t));
  });

  return prefsFileInput;
}

// Input file caché pour l'import de PARTIE — distinct de prefsFileInput
// (déclencheurs et validations totalement différents).
let gameFileInput = null;

// Écran de confirmation, DESTRUCTIF (écrase la partie en cours) : "Annuler"
// en première entrée (curseur par défaut), même principe que
// options-menu.js/openResetAllConfirmation — une pression rapide/
// accidentelle d'Entrée à l'ouverture reste sans effet. Réutilise les clés
// génériques "Annuler"/"Confirmer" déjà en place (menu.options.reset_all_*),
// pas de doublon de traduction pour le même mot.
function openImportConfirmation(importedSession, droppedEntities, droppedItems) {
  const menu = {
    title: "save.import_confirm_title",
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
          if (gameReplaceHandler) {
            gameReplaceHandler(importedSession);
            playSaveSound();
            announce(t("save.imported"), { assertive: true });
            // Partie importée adoptée : signalement de ses entités
            // retirées, et journal ouvert en mode debug s'il y a du nouveau.
            reportDroppedEntities(droppedEntities);
            reportDroppedItems(droppedItems);
            openDebugWarningsIfUnseen();
          } else {
            // Cas limite : la partie s'est terminée entre l'ouverture de ce
            // sous-menu et la confirmation (ex. retour au menu principal
            // dans un autre onglet impossible ici, mais gardé par principe
            // plutôt que de supposer gameReplaceHandler toujours vivant).
            announce(t("save.no_active_game"), { assertive: true });
          }
        },
      },
    ],
  };
  pushScreen(makeMenuScreen(menu, t));
}

function ensureGameFileInput() {
  if (gameFileInput) return gameFileInput;

  gameFileInput = document.createElement("input");
  gameFileInput.type = "file";
  gameFileInput.accept = ".json,application/json";
  gameFileInput.style.position = "fixed";
  gameFileInput.style.left = "-9999px";
  document.body.appendChild(gameFileInput);

  gameFileInput.addEventListener("change", async () => {
    const file = gameFileInput.files[0];
    gameFileInput.value = ""; // permet de réimporter le même fichier ensuite
    if (!file) return; // sélection annulée

    // Validé AVANT de demander confirmation : jamais confirmer une action
    // destructive pour découvrir ensuite que le fichier était invalide —
    // un échec ici ne touche jamais à la partie en cours.
    const result = await importGame(file);
    if (!result.success) {
      // Écran-message : voir la même remarque plus haut (import préférences).
      pushScreen(makeMessageScreen("save.import_game_failure", t));
      return;
    }

    openImportConfirmation(result.session, result.droppedEntities, result.droppedItems);
  });

  return gameFileInput;
}

// getSession : accesseur, peut renvoyer null hors partie (ce sous-menu
// reste aussi accessible depuis le menu principal, voir main-menu.js) —
// export/import de la partie n'ont alors rien à faire, annoncés
// explicitement plutôt que d'échouer en silence.
export function createSaveMenu(getSession) {
  function requireActiveGame(action) {
    const session = getSession();
    if (!session) {
      announce(t("save.no_active_game"), { assertive: true });
      return;
    }
    action(session);
  }

  return {
    title: "menu.save.title",
    closable: true,
    entries: [
      {
        kind: "toggle",
        labelKey: "save.autosave",
        descriptionKey: "save.autosave.description",
        prefKey: "autoSaveOnTransition",
        default: AUTOSAVE_TRANSITION.default,
      },
      {
        kind: "slider",
        labelKey: "save.autosave_interval",
        descriptionKey: "save.autosave_interval.description",
        prefKey: "autoSaveIntervalMinutes",
        min: AUTOSAVE_INTERVAL.min,
        max: AUTOSAVE_INTERVAL.max,
        step: 1,
        default: AUTOSAVE_INTERVAL.default,
        // 0 = désactivée : formatage spécial plutôt que "0 min", pour que
        // l'état "jamais" soit sans ambiguïté à l'oreille.
        format: (value) => (value === 0 ? t("save.autosave_interval_never") : `${value} min`),
      },
      {
        // Gouverne le son de confirmation (voir
        // view/save-storage.js/playSaveSound, vérifié là-bas au point
        // d'émission unique — couvre sauvegarde ET import) — n'affecte
        // jamais l'écriture elle-même, purement le retour sensoriel.
        kind: "toggle",
        labelKey: "save.sound_enabled",
        descriptionKey: "save.sound_enabled.description",
        prefKey: "saveSoundEnabled",
        default: SAVE_SOUND_ENABLED.default,
      },
      {
        label: "save.export_game",
        onActivate: () => requireActiveGame((session) => exportGame(session)),
      },
      {
        // Ouvre le sélecteur de fichier natif de l'OS ; le résultat arrive
        // plus tard, de façon asynchrone, via le listener "change" posé
        // une fois pour toutes dans ensureGameFileInput() ci-dessus.
        label: "save.import_game",
        onActivate: () => requireActiveGame(() => ensureGameFileInput().click()),
      },
      {
        label: "menu.save.export",
        onActivate: () => exportPreferences(),
      },
      {
        label: "menu.save.import",
        onActivate: () => ensurePrefsFileInput().click(),
      },
      {
        label: "menu.options.back",
        onActivate: () => popScreen(),
      },
    ],
  };
}
