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
// Sélection : l'effet "teleport" EXISTANT (fourni par city-screen.js, voir
// executeTeleport), mode "instant", x = playerStart, face recto — aucun
// chemin de chargement parallèle : compagnons, rangement du monde quitté,
// auto-save et annonce de la scène viennent de ce chemin commun. Choisir
// la scène courante la recharge (reloadIfSame), ce qui recentre le joueur.

import { t } from "../../data/i18n/index.js";
import { pushScreen, popScreen, activeScreen } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import scenePaths from "../../scenes/index.js";

async function readSceneInfo(id, path) {
  try {
    const response = await fetch(path);
    const raw = await response.json();
    return { id, titleKey: raw.titleKey, playerStart: raw.playerStart };
  } catch {
    return { id };
  }
}

export async function openTeleportDebugMenu(getSession, teleportEffect) {
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
  const currentIndex = scenes.findIndex((scene) => scene.id === currentId);

  pushScreen(
    makeMenuScreen({ title: "teleport.debug.title", closable: true, cursor: currentIndex >= 0 ? currentIndex : 0, entries }, t)
  );
}
