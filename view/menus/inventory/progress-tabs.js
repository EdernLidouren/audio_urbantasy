// Onglets de PROGRESSION de l'inventaire (voir la coquille à onglets,
// view/menus/inventory-menu.js) : AMÉLIORATIONS et COLLECTIONS, en lecture
// seule — ce que le joueur a débloqué ou découvert, lu dans l'ÉTAT RÉEL de
// la partie, jamais via une condition (court-circuit debug, voir
// buildImprovementsTabScreen).

import { t } from "../../../data/i18n/index.js";
import { pushScreen } from "../../../lib/screens.js";
import { makeMenuScreen } from "../../../lib/menu.js";
import { announce, stripTrailingPeriod } from "../../../lib/announce.js";
import { IMPROVEMENT_REGISTRY, orderedImprovementIds } from "../../../core/improvements.js";
import { collectionEntries, collectionNameKey, collectionProgress } from "../../../core/collections.js";
import collections from "../../../collections/index.js";

// Ligne d'UNE amélioration de l'onglet Améliorations. Débloquée :
// "{order} - {nom} : {description}", Espace/Entrée la réannonce. Non
// débloquée : "{order} - Inconnue" — le numéro révèle qu'un pouvoir existe
// sans dire lequel ; l'activer ne fait rien de plus. Aucune action
// "utiliser" : les pouvoirs s'activent ailleurs (ex. "p" pour la perception).
function improvementEntry(id, owned) {
  const props = IMPROVEMENT_REGISTRY[id];
  if (!owned) {
    return { label: "improvements.entry.unknown", labelParams: { order: props.order }, onActivate: () => {} };
  }
  const labelParams = {
    order: props.order,
    name: t(props.labelKey),
    description: stripTrailingPeriod(t(props.descriptionKey)),
  };
  return {
    label: "improvements.entry.known",
    labelParams,
    onActivate: () => announce(t("improvements.entry.known", labelParams), { assertive: true }),
  };
}

// Onglet Améliorations : toutes les améliorations du registre, dans leur
// `order` déclaré. "Débloquée" se lit dans l'ÉTAT RÉEL
// (session.improvements), JAMAIS via la condition hasImprovement : en mode
// debug, celle-ci répond toujours vrai (court-circuit, voir
// core/presence.js), alors que cet onglet doit montrer ce que le joueur
// possède vraiment — sinon impossible de vérifier son état en debug.
export function buildImprovementsTabScreen(getSession) {
  const owned = getSession().improvements || {};
  const ids = orderedImprovementIds();
  const menu = {
    title: "improvements.title",
    titleParams: { unlocked: ids.filter((id) => owned[id]).length, total: ids.length },
    closable: true,
    entries: ids.map((id) => improvementEntry(id, Boolean(owned[id]))),
  };
  return makeMenuScreen(menu, t);
}

// Ligne d'UNE entrée de collection. Découverte : "{nom} : {description}",
// Espace/Entrée la réannonce. Non découverte : "Inconnu". Sans numéro,
// contrairement aux améliorations.
function collectionEntryLine(entry) {
  if (!entry.discovered) return { label: "collections.entry.unknown", onActivate: () => {} };
  const labelParams = { name: t(entry.nameKey), description: stripTrailingPeriod(t(entry.descriptionKey)) };
  return {
    label: "collections.entry.known",
    labelParams,
    onActivate: () => announce(t("collections.entry.known", labelParams), { assertive: true }),
  };
}

// Sous-menu d'UNE collection, empilé PAR-DESSUS l'onglet (qui reste ouvert
// dessous) : ses entrées dans l'ordre déclaré. Échap le ferme et revient à
// la liste des collections, réannoncée par l'onglet révélé.
function openCollectionEntriesMenu(collectionId, getSession) {
  const entries = collectionEntries(collectionId, collections[collectionId], getSession().acquiredItems);
  pushScreen(
    makeMenuScreen({ title: collectionNameKey(collectionId), closable: true, entries: entries.map(collectionEntryLine) }, t)
  );
}

// Onglet Collections : toutes les collections du registre
// (collections/index.js), chacune avec sa progression ("{nom}, 1 sur 3").
// Découvert se lit dans l'ÉTAT RÉEL (session.acquiredItems, voir
// core/collections.js), comme l'onglet Améliorations.
export function buildCollectionsTabScreen(getSession) {
  const acquired = getSession().acquiredItems;
  const menu = {
    title: "collections.title",
    closable: true,
    entries: Object.entries(collections).map(([collectionId, collection]) => ({
      label: "collections.entry",
      labelParams: { name: t(collectionNameKey(collectionId)), ...collectionProgress(collection, acquired) },
      onActivate: () => openCollectionEntriesMenu(collectionId, getSession),
    })),
  };
  return makeMenuScreen(menu, t);
}
