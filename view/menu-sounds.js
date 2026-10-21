// Fait le pont entre les évènements ABSTRAITS que lib/menu.js connaît
// (wrap/block/select/cancel/toggle — des noms génériques, sans savoir quel
// fichier y correspond) et les assets concrets du jeu. Injecté une fois via
// configureMenuSounds (voir main.js, même patron que
// configureMenuPreferences) : lib/menu.js reste ainsi portable, il ne
// connaît jamais ces chemins.
//
// Deux rôles supplémentaires, joués par les menus SPÉCIFIQUES à Templeton
// (jamais par lib/menu.js) : "reset" quand des préférences sont remises à
// leurs valeurs par défaut (options globales, sous-menus), "refusal" quand
// une VALIDATION explicite est refusée avec un message (rien à vendre, pas
// de catalogue, rien de sélectionné, fonds insuffisants) — distinct de
// "block", réservé aux tentatives sans effet et sans message (borne d'un
// slider, cyclage refusé, Entrée sur un slider).
//
// Centrés, non spatialisés — des sons d'UI, comme le son de sauvegarde
// (voir view/save-storage.js). Défensif : un son manquant avertit, ne
// plante jamais.

import { playOneShot } from "../lib/audio.js";
import { resolveAsset } from "../lib/assets.js";
import { getPref, PREF_CONSTRAINTS } from "../config/preferences.js";

const MENU_SOUND_KEYS = {
  wrap: "assets/sounds/ui/wrap",
  block: "assets/sounds/ui/block",
  select: "assets/sounds/ui/select",
  cancel: "assets/sounds/ui/cancel",
  toggle: "assets/sounds/ui/toggle",
  reset: "assets/sounds/ui/reset",
  refusal: "assets/sounds/ui/refusal",
};

// Catégorie "interface" (Options > Audio, voir view/menus/audio-menu.js) :
// relu à CHAQUE déclenchement, jamais mis en cache — même raisonnement que
// footstepVolumeFactor (view/audio/volume-factors.js), un son ponctuel n'a pas
// d'instance déjà en cours à rafraîchir.
function interfaceVolumeFactor() {
  return getPref("interfaceVolume", PREF_CONSTRAINTS.interfaceVolume.default) / 100;
}

export function playMenuSound(eventName) {
  const key = MENU_SOUND_KEYS[eventName];
  if (!key) return; // évènement inconnu : silencieux, jamais de crash

  try {
    playOneShot(resolveAsset(key), { volume: interfaceVolumeFactor() });
  } catch (error) {
    console.warn(`menu: son "${eventName}" indisponible ("${key}") : ${error.message}`);
  }
}
