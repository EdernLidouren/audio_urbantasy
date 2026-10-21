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
import { t } from "../../data/i18n/index.js";
import { PREF_CONSTRAINTS, exportPreferences, importPreferences } from "../../config/preferences.js";
import { applyVolumePreferences } from "../audio/city-scene.js";
import { exportGame, importGame, playSaveSound, hasSave } from "../save-storage.js";
import { canChooseSaveLocation } from "../../lib/download.js";
import { getActiveWorld } from "../../core/state.js";
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

// Gestionnaire de DÉMARRAGE d'une partie importée HORS partie (depuis le
// menu principal), enregistré une fois par main.js, qui seul possède la
// session et sait lancer l'écran de ville — comme "Continuer".
let gameStartHandler = null;
export function setGameStartHandler(handler) {
  gameStartHandler = handler;
}

// Adopte une partie importée : en jeu, elle REMPLACE la partie en cours ;
// hors partie, elle DÉMARRE. Puis son, annonce, signalement des entités et
// objets retirés à la relecture (journal ouvert en debug s'il y a du
// nouveau).
function applyImportedGame(importedSession, droppedEntities, droppedItems) {
  if (gameReplaceHandler) {
    gameReplaceHandler(importedSession);
    announce(t("save.imported"), { assertive: true });
  } else if (gameStartHandler) {
    gameStartHandler(importedSession);
    // Au démarrage, l'écran de ville vient d'annoncer le lieu : une seule
    // annonce reprend les deux, sinon la seconde écraserait la première.
    announce(`${t("save.imported")} ${t(getActiveWorld(importedSession).titleKey)}`, { assertive: true });
  } else {
    announce(t("save.no_active_game"), { assertive: true });
    return;
  }
  playSaveSound();
  reportDroppedEntities(droppedEntities);
  reportDroppedItems(droppedItems);
  openDebugWarningsIfUnseen();
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

    // Les volumes importés prennent effet aussitôt.
    applyVolumePreferences();

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
// `title` : ce qui sera remplacé — la partie en cours, ou (hors partie) la
// sauvegarde locale.
function openImportConfirmation(importedSession, droppedEntities, droppedItems, title) {
  const menu = {
    title,
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
          applyImportedGame(importedSession, droppedEntities, droppedItems);
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

    // En jeu : confirmation (la partie en cours sera remplacée). Hors partie :
    // confirmation seulement si une sauvegarde locale existe (elle sera
    // remplacée à la prochaine sauvegarde) ; sinon, démarrage direct.
    if (gameReplaceHandler) {
      openImportConfirmation(result.session, result.droppedEntities, result.droppedItems, "save.import_confirm_title");
    } else if (hasSave()) {
      openImportConfirmation(result.session, result.droppedEntities, result.droppedItems, "save.import_confirm_title_saved");
    } else {
      applyImportedGame(result.session, result.droppedEntities, result.droppedItems);
    }
  });

  return gameFileInput;
}

// Exports (partie, préférences) : la fenêtre "Enregistrer sous" native quand
// le navigateur la propose, sinon un téléchargement (voir lib/download.js).
// La description de l'entrée dit à l'avance laquelle des deux s'appliquera ;
// l'annonce du résultat part APRÈS la fermeture de la fenêtre, quand le focus
// est revenu au jeu — le navigateur, lui, ne dit rien d'un téléchargement.
const EXPORT_LOCATION_DESCRIPTION = canChooseSaveLocation ? "save.export_location.choose" : "save.export_location.downloads";

function announceExportOutcome(outcome, savedKey, downloadedKey) {
  if (outcome === "cancelled") {
    announce(t("save.export_cancelled"), { assertive: true });
    return;
  }
  announce(t(outcome === "saved" ? savedKey : downloadedKey), { assertive: true });
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
        descriptionKey: EXPORT_LOCATION_DESCRIPTION,
        onActivate: () =>
          requireActiveGame(async (session) => {
            announceExportOutcome(await exportGame(session), "save.exported", "save.exported_download");
          }),
      },
      {
        // Ouvre le sélecteur de fichier natif de l'OS ; le résultat arrive
        // plus tard, de façon asynchrone, via le listener "change" posé
        // une fois pour toutes dans ensureGameFileInput() ci-dessus.
        label: "save.import_game",
        // Disponible aussi hors partie : depuis le menu principal, la partie
        // importée démarre (voir applyImportedGame).
        onActivate: () => ensureGameFileInput().click(),
      },
      {
        label: "menu.save.export",
        descriptionKey: EXPORT_LOCATION_DESCRIPTION,
        onActivate: async () => {
          announceExportOutcome(await exportPreferences(), "menu.save.exported", "menu.save.exported_download");
        },
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
