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

// Rechargement d'une scène depuis son fichier impossible (outil de debug,
// voir view/world-travel.js/reloadSceneFromFile) : le message d'erreur du
// chargeur (réseau, JSON, validation par parseScene) dit quoi corriger.
export function reportSceneReloadFailure(sceneId, message) {
  reportWarning(
    "debug.warnings.sceneReloadFailed",
    // Point final retiré : le menu en ajoute un après chaque entrée.
    { sceneId, message: message.replace(/\.\s*$/, "") },
    `Rechargement de la scène "${sceneId}" impossible :`,
    message
  );
}

// Texte de collection manquant (voir view/collection-discoveries.js) : nom
// d'une collection, ou nom/description d'une de ses entrées, absent de
// data/i18n/<langue>/collections.json. Pas de repli sur les textes de
// l'objet : l'oubli doit se voir.
export function reportCollectionTextMissing(key) {
  reportWarning("debug.warnings.collectionTextMissing", { key }, "Collection : texte manquant :", key);
}

// Objets retirés du sac ou de l'équipement d'une sauvegarde adoptée, type
// absent du registre d'objets (voir core/save.js/dropUnknownItems). Même
// moment de signalement que reportDroppedEntities.
export function reportDroppedItems(droppedItems) {
  for (const { where, type } of droppedItems) {
    const key = where === "bag" ? "debug.warnings.droppedBagItem" : "debug.warnings.droppedEquippedItem";
    reportWarning(key, { type, slot: where }, "Sauvegarde : objet retiré, type inconnu :", { where, type });
  }
}
