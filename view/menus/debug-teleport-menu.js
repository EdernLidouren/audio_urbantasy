// Menu de DEBUG de téléportation (Shift+M, voir view/input.js/CITY_BINDINGS),
// même famille que Shift+W (météo) et Shift+T (temps) —
// mode debug uniquement, la garde vit dans view/city-screen.js/onKeyDown.
//
// Liste GÉNÉRÉE depuis le registre des scènes (scenes/index.js) : une scène
// ajoutée au registre y apparaît sans toucher à ce fichier. Nom et point de
// départ lus dans le JSON de chaque scène (titleKey, playerStart), relus à
// chaque ouverture ; un fichier illisible ou sans titleKey donne une entrée
// libellée par l'id brut, jamais une erreur.
//
// Sélection : l'effet "teleport" EXISTANT (view/world-travel.js/
// executeTeleport, transmis par view/city-screen.js), mode "instant",
// x = playerStart, face recto — aucun chemin de chargement parallèle :
// compagnons, rangement du monde quitté, auto-save et annonce de la scène
// viennent de ce chemin commun. Choisir
// la scène courante la recharge (reloadIfSame), ce qui recentre le joueur
// SANS relire son fichier.
//
// En tête de liste, deux OUTILS DE SCÈNE, chacun derrière une confirmation
// (voir view/world-travel.js/reloadSceneFromFile, view/debug-effects.js/
// forgetOtherScenes et core/state.js) : "Recharger cette scène
// depuis son fichier" (relit le JSON, remplace le monde actif par un monde
// neuf) et "Oublier les autres scènes visitées" (chacune sera relue depuis
// son fichier à la prochaine visite). Une partie fige chaque monde à sa
// première visite (doc/save.md) : sans ces outils, une scène modifiée ne
// se voit qu'en nouvelle partie.

import { t } from "../../data/i18n/index.js";
import { pushScreen, popScreen, activeScreen } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import scenePaths from "../../scenes/index.js";

async function readSceneInfo(id, path) {
  try {
    const response = await fetch(path, { cache: "no-cache" });
    const raw = await response.json();
    return { id, titleKey: raw.titleKey, playerStart: raw.playerStart };
  } catch {
    return { id };
  }
}

// Confirmation d'un outil de scène : Annuler en premier (curseur par
// défaut), Échap annule aussi.
function openConfirmation(title, titleParams, onConfirm) {
  pushScreen(
    makeMenuScreen(
      {
        title,
        titleParams,
        closable: true,
        entries: [
          { label: "menu.options.reset_all_cancel", onActivate: () => popScreen() },
          {
            label: "menu.options.reset_all_confirm",
            onActivate: () => {
              popScreen();
              onConfirm();
            },
          },
        ],
      },
      t
    )
  );
}

// sceneTools : { reloadSceneFromFile, forgetOtherScenes }, transmis par
// view/city-screen.js depuis view/world-travel.js et view/debug-effects.js.
export async function openTeleportDebugMenu(getSession, teleportEffect, sceneTools) {
  const opener = activeScreen();
  const currentId = getSession().activeWorldId;
  const scenes = await Promise.all(Object.entries(scenePaths).map(([id, path]) => readSceneInfo(id, path)));
  // Lecture asynchrone : si l'écran a changé entre-temps (menu ouvert,
  // sortie de la ville), on n'empile rien.
  if (activeScreen() !== opener) return;

  const entries = scenes.map((scene) => {
    const name = scene.titleKey ? t(scene.titleKey) : scene.id;
    const isCurrent = scene.id === currentId;
    return {
      label: isCurrent ? "teleport.debug.entryHere" : "teleport.debug.entry",
      labelParams: { name },
      onActivate: () => {
        popScreen();
        teleportEffect({
          target: scene.id,
          x: scene.playerStart,
          side: "recto",
          transition: "instant",
          reloadIfSame: isCurrent,
        });
      },
    };
  });
  const otherCount = Object.keys(getSession().worlds).length - 1;
  const toolEntries = [
    {
      label: "teleport.debug.reloadScene",
      onActivate: () => {
        popScreen();
        openConfirmation("teleport.debug.reloadConfirm", undefined, sceneTools.reloadSceneFromFile);
      },
    },
    {
      label: "teleport.debug.forgetOthers",
      labelParams: { count: otherCount },
      onActivate: () => {
        popScreen();
        openConfirmation("teleport.debug.forgetConfirm", { count: otherCount }, sceneTools.forgetOtherScenes);
      },
    },
  ];
  // Curseur sur la scène courante, décalé des outils placés en tête.
  const currentIndex = scenes.findIndex((scene) => scene.id === currentId);

  pushScreen(
    makeMenuScreen(
      {
        title: "teleport.debug.title",
        closable: true,
        cursor: currentIndex >= 0 ? currentIndex + toolEntries.length : 0,
        entries: [...toolEntries, ...entries],
      },
      t
    )
  );
}
