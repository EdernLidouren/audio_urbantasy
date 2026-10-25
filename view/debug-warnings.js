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
import { stripTrailingPeriod } from "../lib/announce.js";

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
function reportDroppedEntities(droppedEntities) {
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

// Scène cible d'un voyage impossible à charger (voir
// view/world-travel.js/loadTargetScene) : le message d'erreur du chargeur
// (réseau, JSON, validation par parseScene) dit quoi corriger.
export function reportSceneLoadFailure(sceneId, message) {
  reportWarning(
    "debug.warnings.sceneLoadFailed",
    // Point final retiré : le menu en ajoute un après chaque entrée.
    { sceneId, message: stripTrailingPeriod(message) },
    `Chargement de la scène "${sceneId}" impossible :`,
    message
  );
}

// Rechargement d'une scène depuis son fichier impossible (outil de debug,
// voir view/world-travel.js/reloadSceneFromFile) : le message d'erreur du
// chargeur (réseau, JSON, validation par parseScene) dit quoi corriger.
export function reportSceneReloadFailure(sceneId, message) {
  reportWarning(
    "debug.warnings.sceneReloadFailed",
    // Point final retiré : le menu en ajoute un après chaque entrée.
    { sceneId, message: stripTrailingPeriod(message) },
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
function reportDroppedItems(droppedItems) {
  for (const { where, type } of droppedItems) {
    const key = where === "bag" ? "debug.warnings.droppedBagItem" : "debug.warnings.droppedEquippedItem";
    reportWarning(key, { type, slot: where }, "Sauvegarde : objet retiré, type inconnu :", { where, type });
  }
}

// Références de contenu neutralisées dans une sauvegarde adoptée
// (distribution, stock, catalogue, état météo — voir
// core/save.js/repairContentReferences). Même moment de signalement que
// reportDroppedEntities.
function reportBrokenReferences(brokenReferences) {
  for (const { worldId, source, problem } of brokenReferences) {
    const key = worldId === null ? "debug.warnings.brokenSessionReference" : "debug.warnings.brokenWorldReference";
    // Point final retiré : le menu en ajoute un après chaque entrée.
    reportWarning(key, { worldId, source, problem: stripTrailingPeriod(problem) }, "Sauvegarde : référence neutralisée :", {
      worldId,
      source,
      problem,
    });
  }
}

// Texte rendu de travers en jeu (voir lib/i18n.js, branché par main.js) :
// clé introuvable, paramètre manquant ou du mauvais type, forme de nom
// absente. Le texte s'annonce quand même, dégradé ; le journal dit quoi
// corriger. Une même faute n'est notée qu'une fois tant qu'elle est au
// journal : une annonce répétée à chaque pas le noierait sous la même
// entrée. Vider le journal la laisse revenir.
export function reportI18nWarning(message) {
  const alreadyLogged = warningLog
    .entries()
    .some((entry) => entry.key === "debug.warnings.i18n" && entry.params.raw === message);
  if (alreadyLogged) {
    console.warn(`i18n: ${message}`);
    return;
  }
  // Point final retiré : le menu en ajoute un après chaque entrée. `raw`
  // garde le message exact pour reconnaître un doublon.
  reportWarning("debug.warnings.i18n", { message: stripTrailingPeriod(message), raw: message }, `i18n: ${message}`);
}

// Tout ce que la relecture d'une sauvegarde a réparé (voir
// view/save-storage.js/loadGame, importGame), signalé quand elle devient la
// partie en cours.
export function reportSaveRepairs({ droppedEntities, droppedItems, brokenReferences }) {
  reportDroppedEntities(droppedEntities);
  reportDroppedItems(droppedItems);
  reportBrokenReferences(brokenReferences);
}
