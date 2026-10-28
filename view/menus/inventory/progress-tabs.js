// Onglets de PROGRESSION de l'inventaire (voir la coquille à onglets,
// view/menus/inventory-menu.js) : AMÉLIORATIONS, ÉMOTES et COLLECTIONS, en
// lecture seule — ce que le joueur a débloqué, appris ou découvert, lu dans
// l'ÉTAT RÉEL de la partie, jamais via une condition (court-circuit debug,
// voir buildImprovementsTabScreen).

import { t } from "../../../data/i18n/index.js";
import { pushScreen } from "../../../lib/screens.js";
import { makeMenuScreen } from "../../../lib/menu.js";
import { announce, stripTrailingPeriod } from "../../../lib/announce.js";
import { IMPROVEMENT_REGISTRY, orderedImprovementIds } from "../../../core/improvements.js";
import { EMOTE_REGISTRY, orderedEmoteIds } from "../../../core/emotes.js";
import { collectionEntries, collectionNameKey, collectionProgress, discoveryFacts } from "../../../core/collections.js";
import collections from "../../../collections/index.js";
import entityRegistry from "../../../entities/types/index.js";
import { entryNameKey } from "../../collection-discoveries.js";
import { playDescribedOneShot } from "../../../lib/audio.js";
import { resolveAsset } from "../../../lib/assets.js";
import { resolveTuning } from "../../../config/tuning.js";
import { interfaceVolumeFactor } from "../../audio/volume-factors.js";

// Ligne d'UNE amélioration de l'onglet Améliorations. Débloquée :
// "{order} - {nom} : {description}", Espace/Entrée la réannonce. Non
// débloquée : "{order} - Inconnue" — le numéro révèle qu'un pouvoir existe
// sans dire lequel ; l'activer ne fait rien de plus, et Ctrl+haut/bas la
// saute (placeholder, voir lib/menu.js). Aucune action
// "utiliser" : les pouvoirs s'activent ailleurs (ex. "p" pour la perception).
function improvementEntry(id, owned) {
  const props = IMPROVEMENT_REGISTRY[id];
  if (!owned) {
    return { label: "improvements.entry.unknown", labelParams: { order: props.order }, placeholder: true, onActivate: () => {} };
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

// Ligne d'UNE émote de l'onglet Émotes, sur le patron des améliorations :
// connue, "{order} - {nom} : {description}", avec la mention du raccourci
// pour celle de la touche "e" ; inconnue, "{order} - Inconnue", sautée par
// Ctrl+haut/bas. Lecture seule : le raccourci se choisit avec Maj+E.
function emoteEntry(id, known, isShortcut) {
  const props = EMOTE_REGISTRY[id];
  if (!known) {
    return { label: "emotes.tab.entry.unknown", labelParams: { order: props.order }, placeholder: true, onActivate: () => {} };
  }
  const label = isShortcut ? "emotes.tab.entry.shortcut" : "emotes.tab.entry.known";
  const labelParams = {
    order: props.order,
    name: t(props.nameKey),
    description: stripTrailingPeriod(t(props.descriptionKey)),
  };
  return { label, labelParams, onActivate: () => announce(t(label, labelParams), { assertive: true }) };
}

// Onglet Émotes : toutes les émotes du registre, dans leur `order`.
// "Connue" se lit dans l'ÉTAT RÉEL (session.emotes), jamais via la
// condition knowsEmote, qui répond toujours vrai en mode debug — même
// raison que l'onglet Améliorations.
export function buildEmotesTabScreen(getSession) {
  const session = getSession();
  const known = session.emotes || {};
  const ids = orderedEmoteIds();
  const menu = {
    title: "emotes.tab.title",
    titleParams: { known: ids.filter((id) => known[id]).length, total: ids.length },
    closable: true,
    entries: ids.map((id) => emoteEntry(id, Boolean(known[id]), session.emoteShortcut === id)),
  };
  return makeMenuScreen(menu, t);
}

// Ligne d'UNE entrée de collection. Non découverte : "Inconnu", sautée par
// Ctrl+haut/bas (placeholder, voir lib/menu.js). Découverte : un OBJET se lit
// "{nom} : {description}", Espace/Entrée la réannonce ; une ENTITÉ se lit
// par son nom, Entrée ouvre sa fiche. Sans numéro, contrairement aux
// améliorations.
function collectionEntryLine(collectionId, entry) {
  if (!entry.discovered) return { label: "collections.entry.unknown", placeholder: true, onActivate: () => {} };
  if (entry.entity !== undefined) {
    return {
      label: "collections.entry.entity",
      labelParams: { name: t(entryNameKey(collectionId, entry)) },
      onActivate: () => openEntitySheet(collectionId, entry),
    };
  }
  const labelParams = { name: t(entry.nameKey), description: stripTrailingPeriod(t(entry.descriptionKey)) };
  return {
    label: "collections.entry.known",
    labelParams,
    onActivate: () => announce(t("collections.entry.known", labelParams), { assertive: true }),
  };
}

// Le vocal d'une entité, joué depuis sa fiche : centré, au volume de
// l'interface (comme un son d'effet méta, view/effect-runner.js), avec le
// gain et la variation de ton de son type. Un fichier différent à chaque
// écoute, comme en jeu (pool).
function playEntityVocal(type, vocal) {
  try {
    playDescribedOneShot(resolveAsset(vocal.path), {
      gain: resolveTuning("vocalGain", { type }, vocal),
      pitchVariation: resolveTuning("pitchVariation", { type }, vocal),
      volumeFactor: interfaceVolumeFactor(),
    });
  } catch (error) {
    console.warn(`collections: vocal de "${type}" indisponible (${vocal.path}) : ${error.message}`);
  }
}

// FICHE d'une entité découverte, empilée par-dessus la collection : nom,
// description (celle que donne Espace en jeu), texte encyclopédique, lieux
// de rencontre (écrits, jamais déduits du contenu), et "Écouter" si elle a
// un vocal. Chaque ligne se réannonce à Entrée ; Échap revient à la liste.
function openEntitySheet(collectionId, entry) {
  const archetype = entityRegistry[entry.entity];
  const name = t(archetype.nameKey);
  const lines = [
    ["collections.sheet.name", { name }],
    ["collections.sheet.description", { description: stripTrailingPeriod(t(archetype.descriptionKey)) }],
    ["collections.sheet.lore", { lore: stripTrailingPeriod(t(entry.loreKey)) }],
    ["collections.sheet.places", { places: stripTrailingPeriod(t(entry.placesKey)) }],
  ];
  const entries = lines.map(([label, labelParams]) => ({
    label,
    labelParams,
    onActivate: () => announce(t(label, labelParams), { assertive: true }),
  }));
  const vocal = archetype.sounds && archetype.sounds.vocal;
  if (vocal) entries.push({ label: "collections.sheet.listen", onActivate: () => playEntityVocal(entry.entity, vocal) });
  pushScreen(makeMenuScreen({ title: "collections.sheet.title", titleParams: { name }, closable: true, entries }, t));
}

// Sous-menu d'UNE collection, empilé PAR-DESSUS l'onglet (qui reste ouvert
// dessous) : ses entrées dans l'ordre déclaré. Échap le ferme et revient à
// la liste des collections, réannoncée par l'onglet révélé.
function openCollectionEntriesMenu(collectionId, getSession) {
  const entries = collectionEntries(collectionId, collections[collectionId], discoveryFacts(getSession()));
  pushScreen(
    makeMenuScreen(
      { title: collectionNameKey(collectionId), closable: true, entries: entries.map((entry) => collectionEntryLine(collectionId, entry)) },
      t
    )
  );
}

// Onglet Collections : toutes les collections du registre
// (collections/index.js), chacune avec sa progression ("{nom}, 1 sur 3").
// Découvert se lit dans l'ÉTAT RÉEL (session.acquiredItems et
// observedEntityTypes, voir core/collections.js), comme l'onglet
// Améliorations.
export function buildCollectionsTabScreen(getSession) {
  const facts = discoveryFacts(getSession());
  const menu = {
    title: "collections.title",
    closable: true,
    entries: Object.entries(collections).map(([collectionId, collection]) => ({
      label: "collections.entry",
      labelParams: { name: t(collectionNameKey(collectionId)), ...collectionProgress(collection, facts) },
      onActivate: () => openCollectionEntriesMenu(collectionId, getSession),
    })),
  };
  return makeMenuScreen(menu, t);
}
