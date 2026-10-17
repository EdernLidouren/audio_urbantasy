// Journal d'avertissements de Templeton (instance de lib/warning-log.js) et
// points d'entrée pour l'alimenter. Une entrée = { key, params } : clé i18n
// sous "debug.warnings.*", traduite à l'affichage par
// view/menus/debug-warnings-menu.js. Chaque avertissement part AUSSI dans
// la console, avec le détail brut : le journal s'ajoute à la console, il
// ne la remplace pas.
//
// Ne brancher ici que des avertissements utiles à l'auteur du contenu
// (donnée perdue, contenu incohérent), jamais du bruit technique.

import { createWarningLog } from "../lib/warning-log.js";

export const warningLog = createWarningLog();

function reportWarning(key, params, ...consoleDetail) {
  console.warn(...consoleDetail);
  warningLog.add({ key, params });
}

// Entités retirées d'une sauvegarde adoptée, type absent du registre (voir
// core/save.js/deserializeGame, doc/save.md). Appelé quand la sauvegarde
// devient la partie en cours ("Continuer", import confirmé), jamais à la
// simple lecture : le menu principal relit la sauvegarde à chaque
// affichage, ce qui empilerait les mêmes avertissements.
export function reportDroppedEntities(droppedEntities) {
  for (const { worldId, entityId, type } of droppedEntities) {
    const key = worldId === null ? "debug.warnings.droppedCompanion" : "debug.warnings.droppedEntity";
    reportWarning(
      key,
      { worldId, entityId, type },
      "Sauvegarde : entité retirée, type inconnu (à ajouter dans config/save-renames.js si c'est un renommage) :",
      { worldId, entityId, type }
    );
  }
}
