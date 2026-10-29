// Découvertes de collection, côté VUE (voir core/collections.js,
// doc/collections.md), et sons de récompense des autres progrès du joueur
// (amélioration obtenue, émote apprise). Quatre rôles :
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
//   4. SONNER une amélioration obtenue ou une émote apprise, déduites du
//      même diff (session.improvements, session.emotes) : le son seul, la
//      source (ex. le vieux cadastre) porte déjà son annonce.
//
// Tous ces sons sont des sons d'INTERFACE (assets/sounds/ui/), non
// spatialisés, au volume de l'interface (playInterfaceSound).

import collections from "../collections/index.js";
import entityRegistry from "../entities/types/index.js";
import { ITEM_REGISTRY } from "../core/items.js";
import {
  validateCollection,
  collectionNameKey,
  entryTextKeys,
  newlyDiscoveredEntries,
  discoveryFacts,
} from "../core/collections.js";
import { t, hasKey } from "../data/i18n/index.js";
import { announce } from "../lib/announce.js";
import { playInterfaceSound } from "./menu-sounds.js";
import { reportCollectionTextMissing } from "./debug-warnings.js";
import { TUNING_DEFAULTS } from "../config/tuning.js";

// Sons de récompense hors collections : un par genre de progrès, pas par
// amélioration ni par émote (aucune n'en réclame un propre aujourd'hui).
const IMPROVEMENT_REWARD_SOUND = "assets/sounds/ui/global_reward";
const EMOTE_REWARD_SOUND = "assets/sounds/ui/emote_reward";

for (const [collectionId, collection] of Object.entries(collections)) {
  validateCollection(collectionId, collection, ITEM_REGISTRY, entityRegistry);
}

// Clé du NOM d'une entrée : son nom de collection pour un objet, le nom de
// son type pour une entité (une seule source, celle que le jeu annonce
// déjà). Lue aussi par l'onglet Collections.
export function entryNameKey(collectionId, entry) {
  if (entry.entity !== undefined) return entityRegistry[entry.entity].nameKey;
  return entryTextKeys(collectionId, entry).nameKey;
}

// Les traductions sont déjà chargées ici (data/i18n/index.js les attend au
// chargement de son module). Pas de repli sur les textes de l'objet : un
// repli masquerait l'oubli.
for (const [collectionId, collection] of Object.entries(collections)) {
  const keys = [collectionNameKey(collectionId)];
  for (const entry of collection.entries) {
    keys.push(...Object.values(entryTextKeys(collectionId, entry)));
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

// Retardé de discoverySoundDelayMs (config/tuning-values.js) : laisse finir
// le son de ramassage ou d'achat qui a provoqué la découverte.
function playDiscoverySound(path, what) {
  setTimeout(() => playInterfaceSound(path, what), TUNING_DEFAULTS.discoverySoundDelayMs);
}

// Vrai si `next` porte une clé absente de `prev` (faits SPARSE
// { [id]: true }). Même référence -> rien de neuf, sans parcours.
function gainedKey(prev, next) {
  if (prev === next || !next) return false;
  return Object.keys(next).some((id) => !(prev && prev[id]));
}

// Rôle 4 : un son par genre de progrès, même si plusieurs arrivent ensemble.
function playProgressRewards(prev, next) {
  if (gainedKey(prev.improvements, next.improvements)) {
    playDiscoverySound(IMPROVEMENT_REWARD_SOUND, "amélioration obtenue");
  }
  if (gainedKey(prev.emotes, next.emotes)) {
    playDiscoverySound(EMOTE_REWARD_SOUND, "émote apprise");
  }
}

// prev/next : deux états successifs de la partie (null hors partie -> rien).
// Comparaison quasi gratuite à chaque tick : sans nouvelle acquisition ni
// observation, acquiredItems et observedEntityTypes gardent la même
// référence (core/bag.js/markAcquired, core/observations.js/markObserved).
export function announceNewDiscoveries(prev, next) {
  if (muted) {
    muted = false;
    return;
  }
  if (!prev || !next) return;
  playProgressRewards(prev, next);
  const found = newlyDiscoveredEntries(collections, discoveryFacts(prev), discoveryFacts(next));
  if (found.length === 0) return;

  // Une seule annonce polie (plusieurs écritures successives s'écraseraient
  // dans la live region), différée d'un tour : la découverte est détectée
  // PENDANT l'action qui fait entrer l'objet ou qui décrit l'entité, avant
  // que celle-ci annonce le ramassage, l'achat ou la description ; ainsi
  // elle passe après, au lieu d'être coupée.
  const text = found
    .map(({ collectionId, entry }) =>
      t("collections.discovered", {
        name: t(entryNameKey(collectionId, entry)),
        collection: t(collectionNameKey(collectionId)),
      })
    )
    .join(" ");
  const sounds = [...new Set(found.map(({ collectionId }) => collections[collectionId].discoverySound).filter(Boolean))];
  setTimeout(() => {
    for (const path of sounds) playDiscoverySound(path, "découverte de collection");
    announce(text);
  }, 0);
}
