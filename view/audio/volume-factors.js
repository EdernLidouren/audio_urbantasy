// Facteurs de volume des PRÉFÉRENCES (Options > Audio, voir
// view/menus/audio-menu.js), un par catégorie. Stockés en pourcentage
// [0,100] comme les sliders, rendus ici en facteur [0,1] — appliqué PAR-DESSUS
// le volume déjà calculé (distance, réglages), jamais à sa place. Relus à
// chaque appel : un changement de préférence prend effet aussitôt. Repli :
// le défaut du slider (config/preferences.js/PREF_CONSTRAINTS).

import { getPref, PREF_CONSTRAINTS } from "../../config/preferences.js";

// Gain de sortie global, au-dessus de toutes les catégories.
export function masterVolumeFactor() {
  return getPref("masterVolume", PREF_CONSTRAINTS.masterVolume.default) / 100;
}

// Balises, vocaux, sons de transition et sons ponctuels d'entité : tout ce
// qui relève de la "présence d'une entité".
export function beaconVolumeFactor() {
  return getPref("beaconVolume", PREF_CONSTRAINTS.beaconVolume.default) / 100;
}

// Pas (joueur et entités) et sons de collision.
export function footstepVolumeFactor() {
  return getPref("footstepVolume", PREF_CONSTRAINTS.footstepVolume.default) / 100;
}

export function musicVolumeFactor() {
  return getPref("musicVolume", PREF_CONSTRAINTS.musicVolume.default) / 100;
}

// Sons d'interface : menus, sauvegarde, bascules, découvertes, effets
// "playSound" non diégétiques.
export function interfaceVolumeFactor() {
  return getPref("interfaceVolume", PREF_CONSTRAINTS.interfaceVolume.default) / 100;
}

export function ambienceVolumeFactor() {
  return getPref("ambienceVolume", PREF_CONSTRAINTS.ambienceVolume.default) / 100;
}
