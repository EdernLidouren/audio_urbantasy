// RENDU SPATIAL, pur : de la distance entre une source et le joueur à un
// pan, un volume et une fréquence de coupure. Spatialisation en stéréo +
// volume, jamais en HRTF : un rendu explicite et réglable, que l'oreille
// relie directement à la distance. Aucun son joué ici.
//
// ÉTOUFFEMENT : { amount, gain, lowpassHz }. `amount` (0..1) dose ; `gain`
// et `lowpassHz` viennent d'un PROFIL — l'autre face d'une scène à deux
// faces, ou la perception surnaturelle (voir ./muffle.js). Une seule chaîne
// de rendu pour les deux, seuls le dosage et le profil diffèrent.

import { TUNING_DEFAULTS } from "../../config/tuning.js";

// Niveaux de la courbe de volume (voir volumeForDistance) : constantes de
// forme, jamais des réglages par entité.
const FULL_VOLUME = TUNING_DEFAULTS.fullVolume;
const FAR_VOLUME_MAX = TUNING_DEFAULTS.farVolumeMax;

export const NO_MUFFLE = Object.freeze({ amount: 0, gain: 1, lowpassHz: undefined });

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Volume : interpolé continûment selon `amount`.
export function applyMuffleToVolume(volume, muffle) {
  if (muffle.amount <= 0) return volume;
  return volume * (1 - muffle.amount * (1 - muffle.gain));
}

// Coupure : composée avec celle de la distance, jamais à sa place.
function applyMuffleToCutoff(cutoff, muffle) {
  if (muffle.amount <= 0) return cutoff;
  return cutoff * (1 - muffle.amount) + muffle.lowpassHz * muffle.amount;
}

// Volume selon la distance, en deux couches jamais mélangées :
//   - un PLANCHER linéaire, de FAR_VOLUME_MAX (dist=0) à 0 (audibleRange),
//     le même pour toute entité ;
//   - un PALIER à FULL_VOLUME quand `highlighted` (surlignage de proximité,
//     voir doc/entity-model.md, "Surlignage audio de proximité") : SAUT NET,
//     volontairement — un fondu de quelques centaines de ms s'est révélé
//     inaudible en marchant (la fenêtre de proximité est trop courte).
export function volumeForDistance(dist, audibleRange, highlighted) {
  if (dist >= audibleRange) return 0;
  if (highlighted) return FULL_VOLUME;

  return FAR_VOLUME_MAX * (1 - dist / audibleRange);
}

// Coupure du passe-bas selon la distance, SANS palier :
//   - dist <= interactRange : cutoffMax (son clair) ;
//   - jusqu'à audibleRange : interpolation LOGARITHMIQUE vers cutoffMin
//     (l'oreille perçoit la fréquence sur une échelle log : une rampe
//     linéaire sonnerait comme un saut puis presque rien) ;
//   - au-delà : cutoffMin.
// Continue à dist=interactRange (pas de saut, contrairement au volume).
function cutoffForDistance(dist, interactRange, audibleRange, cutoffMin, cutoffMax) {
  if (dist <= interactRange) return cutoffMax;
  if (dist >= audibleRange) return cutoffMin;

  const range = audibleRange - interactRange;
  if (range <= 0) return cutoffMin;

  const progress = (dist - interactRange) / range;
  return cutoffMax * Math.pow(cutoffMin / cutoffMax, progress);
}

// Rendu CONTINU d'une source qui suit le joueur (balise continue, son
// ponctuel suivi) : UNE formule pour tous. `entry` porte les portées
// résolues de l'entité (voir ./entity-sound-entry.js). Le volume rendu est
// sans unité : l'appelant le multiplie par ses propres facteurs
// (préférence, gain de rôle, hauteur).
export function spatialRendering(entry, relX, muffle) {
  const dist = Math.abs(relX);
  const pan = clamp(relX / entry.panSaturation, -1, 1);
  const volume = applyMuffleToVolume(volumeForDistance(dist, entry.audibleRange, entry.highlight && dist <= entry.interactRange), muffle);
  const cutoff = applyMuffleToCutoff(cutoffForDistance(dist, entry.interactRange, entry.audibleRange, entry.cutoffMin, entry.cutoffMax), muffle);
  return { pan, volume, cutoff };
}
