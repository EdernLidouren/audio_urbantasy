// Découvertes de collection, côté VUE (voir core/collections.js,
// doc/collections.md). Trois rôles :
//   1. VALIDER les collections au chargement du module (structure, objets
//      référencés) : une collection mal écrite fait échouer le démarrage,
//      jamais une entrée introuvable en silence. Les TEXTES manquants, eux,
//      sont signalés au journal d'avertissements (Shift+L) sans bloquer :
//      une traduction oubliée ne doit pas empêcher de jouer.
//   2. ANNONCER chaque nouvelle découverte, déduite du DIFF entre deux états
//      de la partie (announceNewDiscoveries, appelée par le setSession de
//      main.js, qui voit passer toute mise à jour) — jamais d'émission
//      dispersée dans les sources d'acquisition.
//   3. Se TAIRE quand la partie est remplacée en bloc (import) ou modifiée
//      par un outil de debug : tout annoncer d'un coup n'aurait pas de sens
//      (muteNextDiscoveryCheck).

import collections from "../collections/index.js";
import { ITEM_REGISTRY } from "../core/items.js";
import {
  validateCollection,
  collectionNameKey,
  entryTextKeys,
  newlyDiscoveredEntries,
} from "../core/collections.js";
import { t, hasKey } from "../data/i18n/index.js";
import { announce } from "../lib/announce.js";
import { playOneShot } from "../lib/audio.js";
import { resolveAsset } from "../lib/assets.js";
import { getPref, PREF_CONSTRAINTS } from "../config/preferences.js";
import { reportCollectionTextMissing } from "./debug-warnings.js";

for (const [collectionId, collection] of Object.entries(collections)) {
  validateCollection(collectionId, collection, ITEM_REGISTRY);
}

// Les traductions sont déjà chargées ici (data/i18n/index.js les attend au
// chargement de son module). Pas de repli sur les textes de l'objet : un
// repli masquerait l'oubli.
for (const [collectionId, collection] of Object.entries(collections)) {
  const keys = [collectionNameKey(collectionId)];
  for (const entry of collection.entries) {
    const { nameKey, descriptionKey } = entryTextKeys(collectionId, entry.item);
    keys.push(nameKey, descriptionKey);
  }
  for (const key of keys) {
    if (!hasKey(key)) reportCollectionTextMissing(key);
  }
}

let muted = false;

// La PROCHAINE mise à jour de la partie ne déclenchera aucune annonce de
// découverte : à appeler juste avant un remplacement en bloc (import d'une
// partie) ou une écriture d'outil de debug.
export function muteNextDiscoveryCheck() {
  muted = true;
}

function playDiscoverySound(path) {
  try {
    const factor = getPref("interfaceVolume", PREF_CONSTRAINTS.interfaceVolume.default) / 100;
    playOneShot(resolveAsset(path), { volume: factor });
  } catch (error) {
    console.warn(`collections : son de découverte indisponible ("${path}") : ${error.message}`);
  }
}

// prev/next : deux états successifs de la partie (null hors partie -> rien).
// Comparaison quasi gratuite à chaque tick : sans nouvelle acquisition,
// acquiredItems garde la même référence (voir core/bag.js/markAcquired).
export function announceNewDiscoveries(prev, next) {
  if (muted) {
    muted = false;
    return;
  }
  if (!prev || !next) return;
  const found = newlyDiscoveredEntries(collections, prev.acquiredItems, next.acquiredItems);
  if (found.length === 0) return;

  // Une seule annonce polie (plusieurs écritures successives s'écraseraient
  // dans la live region), différée d'un tour : la découverte est détectée
  // PENDANT l'action qui fait entrer l'objet, avant que celle-ci annonce le
  // ramassage ou l'achat ; ainsi elle passe après, au lieu d'être coupée.
  const text = found
    .map(({ collectionId, item }) =>
      t("collections.discovered", {
        name: t(entryTextKeys(collectionId, item).nameKey),
        collection: t(collectionNameKey(collectionId)),
      })
    )
    .join(" ");
  const sounds = [...new Set(found.map(({ collectionId }) => collections[collectionId].discoverySound).filter(Boolean))];
  setTimeout(() => {
    for (const path of sounds) playDiscoverySound(path);
    announce(text);
  }, 0);
}
