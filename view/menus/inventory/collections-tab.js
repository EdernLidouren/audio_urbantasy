// Onglet COLLECTIONS de l'inventaire (touche "c", voir la coquille à
// onglets, view/menus/inventory-menu.js), en lecture seule : les
// collections, leurs entrées, et la FICHE des entités du bestiaire.
// Découvert se lit dans l'ÉTAT RÉEL (session.acquiredItems et
// observedEntityTypes, voir core/collections.js), jamais via une condition.
//
// Trois niveaux empilés, Échap remonte d'un cran :
//   - l'onglet : une ligne par collection, avec sa progression ;
//   - une collection : ses entrées. Tab / Maj+Tab passe à la collection
//     suivante / précédente, dans l'ordre de l'onglet, en cycle si la
//     préférence menuCycling le permet (son et étoile de limite, comme
//     lib/menu.js/stepMenuCursor) ;
//   - une fiche d'entité. Tab / Maj+Tab passe à la fiche découverte
//     suivante / précédente de la même collection, du même saut que
//     Ctrl+haut/bas (les inconnues sautées), sans cycle : à la borne, son
//     "block" et annonce étoilée. Dans les deux cas, l'annonce est celle de
//     Retour arrière (titre puis ligne courante).
// Le changement se fait EN PLACE (le menu intérieur de l'écran est
// reconstruit), jamais par un dépilement qui réannoncerait l'écran du
// dessous.

import { t } from "../../../data/i18n/index.js";
import { pushScreen } from "../../../lib/screens.js";
import { makeMenuScreen, announceMenuLine, stepMenuCursor } from "../../../lib/menu.js";
import { announce, stripTrailingPeriod } from "../../../lib/announce.js";
import { resolveAction, defineBindings } from "../../../lib/input.js";
import { randomRate } from "../../../lib/audio.js";
import { resolveTuning } from "../../../config/tuning.js";
import { collectionEntries, collectionNameKey, collectionProgress, discoveryFacts } from "../../../core/collections.js";
import collections from "../../../collections/index.js";
import entityRegistry from "../../../entities/types/index.js";
import { entryNameKey } from "../../discoveries.js";
import { playMenuSound } from "../../menu-sounds.js";
import { createSoundPreview } from "./sound-preview.js";

const COLLECTION_BINDINGS = defineBindings("collectionNav", {
  nextCollection: { keys: ["Tab"], mods: [] },
  prevCollection: { keys: ["Tab"], mods: ["shift"] },
});

const SHEET_BINDINGS = defineBindings("entitySheetNav", {
  nextSheet: { keys: ["Tab"], mods: [] },
  prevSheet: { keys: ["Tab"], mods: ["shift"] },
});

// Ordre de l'onglet, celui du passage d'une collection à l'autre.
const COLLECTION_IDS = Object.keys(collections);

// Une entrée qui a une fiche : une entité découverte.
function hasSheet(entry) {
  return entry.discovered && entry.entity !== undefined;
}

// Prochaine entrée à fiche après `index` dans le sens `delta`, ou -1.
function findSheetIndex(entries, index, delta) {
  for (let i = index + delta; i >= 0 && i < entries.length; i += delta) {
    if (hasSheet(entries[i])) return i;
  }
  return -1;
}

// Écran qui ENVELOPPE un écran-menu remplaçable en place (`current()`),
// et intercepte Tab / Maj+Tab de sa table (`bindings`, section d'aide
// `sectionId`) avant de lui passer le reste du clavier.
function makeSwitchingScreen({ current, bindings, sectionId, onSwitch, onExit }) {
  return {
    isMenuScreen: true,
    onEnter: () => current().onEnter(),
    onTick: () => current().onTick?.(),
    onExit,
    reannounceCurrentEntry: () => current().reannounceCurrentEntry(),
    helpSections: () => [{ id: sectionId }, ...(current().helpSections?.() ?? [])],
    onKeyDown(event) {
      const action = resolveAction(bindings, event.key, event.mods);
      if (action) {
        // Comportement navigateur de Tab déjà neutralisé en amont, voir
        // lib/input.js/ALWAYS_NEUTRALIZED_BINDINGS.
        onSwitch(action);
        return;
      }
      current().onKeyDown(event);
    },
  };
}

// FICHE d'une entité découverte : nom, description (celle que donne Espace
// en jeu), texte encyclopédique, lieux de rencontre (écrits, jamais
// déduits du contenu), et "Écouter" si elle a un vocal. Chaque ligne se
// réannonce à Entrée. `listMenu` : le menu de la collection, dessous, dont
// le curseur suit la fiche affichée (Échap revient sur sa ligne).
function openEntitySheet(collectionId, entries, startIndex, listMenu) {
  const preview = createSoundPreview();
  let index = startIndex;
  let menu = null;
  let screen = null;

  // Le vocal du type : centré, au volume de l'interface, avec le gain et
  // la variation de ton de son type ; un fichier différent du pool à
  // chaque écoute, comme en jeu.
  function listen(type, vocal) {
    preview.play(vocal.path, {
      gain: resolveTuning("vocalGain", { type }, vocal),
      rate: randomRate(resolveTuning("pitchVariation", { type }, vocal)),
    });
  }

  // `cursor` : la ligne à garder d'une fiche à l'autre (bornée à la
  // nouvelle, qui peut ne pas avoir de vocal).
  function build(cursor) {
    const entry = entries[index];
    const archetype = entityRegistry[entry.entity];
    const name = t(archetype.nameKey);
    const lines = [
      ["collections.sheet.name", { name }],
      ["collections.sheet.description", { description: stripTrailingPeriod(t(archetype.descriptionKey)) }],
      ["collections.sheet.lore", { lore: stripTrailingPeriod(t(entry.loreKey)) }],
      ["collections.sheet.places", { places: stripTrailingPeriod(t(entry.placesKey)) }],
    ];
    const menuEntries = lines.map(([label, labelParams]) => ({
      label,
      labelParams,
      onActivate: () => announce(t(label, labelParams), { assertive: true }),
    }));
    const vocal = archetype.sounds && archetype.sounds.vocal;
    if (vocal) menuEntries.push({ label: "collections.sheet.listen", onActivate: () => listen(entry.entity, vocal) });
    menu = {
      title: "collections.sheet.title",
      titleParams: { name },
      closable: true,
      cursor: Math.min(cursor, menuEntries.length - 1),
      entries: menuEntries,
    };
    screen = makeMenuScreen(menu, t);
  }

  function switchSheet(action) {
    const next = findSheetIndex(entries, index, action === "nextSheet" ? 1 : -1);
    if (next < 0) {
      playMenuSound("block");
      announceMenuLine(screen.openAnnouncementText(), true);
      return;
    }
    preview.stop();
    index = next;
    listMenu.cursor = next;
    build(menu.cursor);
    announceMenuLine(screen.openAnnouncementText());
  }

  build(0);
  pushScreen(
    makeSwitchingScreen({
      current: () => screen,
      bindings: SHEET_BINDINGS,
      sectionId: "entitySheetNav",
      onSwitch: switchSheet,
      onExit: preview.stop,
    })
  );
}

// Ligne d'UNE entrée de collection. Non découverte : "Inconnu", sautée par
// Ctrl+haut/bas (placeholder, voir lib/menu.js). Découverte : un OBJET se lit
// "{nom} : {description}", Espace/Entrée la réannonce ; une ENTITÉ se lit
// par son nom, Entrée ouvre sa fiche. Sans numéro, contrairement aux
// améliorations.
function collectionEntryLine(collectionId, entries, index, listMenu) {
  const entry = entries[index];
  if (!entry.discovered) return { label: "collections.entry.unknown", placeholder: true };
  if (entry.entity !== undefined) {
    return {
      label: "collections.entry.entity",
      labelParams: { name: t(entryNameKey(collectionId, entry)) },
      onActivate: () => openEntitySheet(collectionId, entries, index, listMenu),
    };
  }
  const labelParams = { name: t(entry.nameKey), description: stripTrailingPeriod(t(entry.descriptionKey)) };
  return {
    label: "collections.entry.known",
    labelParams,
    onActivate: () => announce(t("collections.entry.known", labelParams), { assertive: true }),
  };
}

// Une COLLECTION, empilée par-dessus l'onglet : ses entrées dans l'ordre
// déclaré. `setReturnCursor` (voir la coquille) garde la ligne de l'onglet
// alignée sur la collection affichée : Échap y revient.
function openCollectionMenu(startIndex, getSession, setReturnCursor) {
  let index = startIndex;
  let screen = null;

  function build() {
    const collectionId = COLLECTION_IDS[index];
    const entries = collectionEntries(collectionId, collections[collectionId], discoveryFacts(getSession()));
    const menu = { title: collectionNameKey(collectionId), closable: true, entries: [] };
    menu.entries = entries.map((_, i) => collectionEntryLine(collectionId, entries, i, menu));
    screen = makeMenuScreen(menu, t);
    setReturnCursor(index);
  }

  // Bornes : celles d'une flèche dans un menu (lib/menu.js/stepMenuCursor)
  // — cycle si la préférence le permet, annonce étoilée à la borne.
  function switchCollection(action) {
    const step = stepMenuCursor(index, action === "nextCollection" ? 1 : -1, COLLECTION_IDS.length);
    if (step.index !== index) {
      index = step.index;
      build();
    }
    announceMenuLine(screen.openAnnouncementText(), step.boundary);
  }

  build();
  pushScreen(
    makeSwitchingScreen({
      current: () => screen,
      bindings: COLLECTION_BINDINGS,
      sectionId: "collectionNav",
      onSwitch: switchCollection,
    })
  );
}

// Onglet Collections : toutes les collections du registre
// (collections/index.js), chacune avec sa progression ("{nom}, 1 sur 3").
export function buildCollectionsTabScreen(getSession, setReturnCursor, cursor) {
  const facts = discoveryFacts(getSession());
  const menu = {
    title: "collections.title",
    cursor,
    closable: true,
    entries: COLLECTION_IDS.map((collectionId, index) => ({
      label: "collections.entry",
      labelParams: { name: t(collectionNameKey(collectionId)), ...collectionProgress(collections[collectionId], facts) },
      onActivate: () => openCollectionMenu(index, getSession, setReturnCursor),
    })),
  };
  return makeMenuScreen(menu, t);
}
