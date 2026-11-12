// Jeu des billes, sons de l'écran : la VALIDATION AU CHARGEMENT des réglages sonores
// (profils, places, profondeur, roulements, collision, variations de ton). Une
// valeur fausse échoue au chargement, au lieu de se découvrir en pleine partie, en
// silence. Point d'entrée et vue d'ensemble : marbles/view/sounds.js.

import {
  MARBLE_SIZES,
  MARBLE_SOUND_PROFILES,
  MARBLES_COLLISION,
  MARBLES_PITCH_VARIATION,
  MARBLES_ROLLS,
  MARBLES_SETTINGS,
  MARBLES_SOUND_DEPTH,
  MARBLES_SOUND_PLACES,
} from "../../config/values.js";
import { SLOTS } from "../../core/marbles.js";

// --- Validation au chargement ---

const TIMING_SETTINGS = ["shuffleToDrawMs", "drawSoundIntervalMs", "swapSoundDelayMs", "wearSoundIntervalMs", "crackToOutMs"];

// Échoue au chargement : un calibre sans profil, ou un profil incomplet, se
// découvrirait sinon en pleine partie, en silence. Le calibre de chaque bille, lui,
// est validé par la simulation (marbles/core/content.js/validateMarbleTypes).
export function validateMarbleSounds(sizes, profiles, settings) {
  for (const [size, id] of Object.entries(sizes)) {
    const profile = profiles[size];
    if (profile === undefined) throw new Error(`marbles : calibre "${id}" sans profil sonore.`);
    for (const role of ["beacon", "drop", "roll", "impact"]) {
      if (typeof profile[role] !== "string") throw new Error(`marbles : profil sonore du calibre "${id}" sans ${role}.`);
    }
  }
  for (const name of TIMING_SETTINGS) {
    const value = settings[name];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`marbles : ${name} doit être un nombre >= 0.`);
  }
}

validateMarbleSounds(MARBLE_SIZES, MARBLE_SOUND_PROFILES, MARBLES_SETTINGS);

function checkNumber(value, name, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`marbles : ${name} doit être un nombre entre ${min} et ${max}.`);
  }
}

// Chaque place a son panoramique dans [-1, 1] et sa profondeur dans [0, 1].
export function validateSoundPlaces(places) {
  checkNumber(places.hand?.fromX, "hand.fromX", -1, 1);
  checkNumber(places.hand?.toX, "hand.toX", -1, 1);
  checkNumber(places.hand?.y, "hand.y", 0, 1);
  for (const place of [...SLOTS, "discard", "pot"]) {
    checkNumber(places[place]?.x, `${place}.x`, -1, 1);
    checkNumber(places[place]?.y, `${place}.y`, 0, 1);
  }
}

export function validateSoundDepth(depth) {
  checkNumber(depth.farGainDb, "farGainDb", -60, 0);
  checkNumber(depth.nearLowpassHz, "nearLowpassHz", 20, 24000);
  checkNumber(depth.farLowpassHz, "farLowpassHz", 20, 24000);
  checkNumber(depth.nearReverbSend, "nearReverbSend", 0, 1);
  checkNumber(depth.farReverbSend, "farReverbSend", 0, 1);
  checkNumber(depth.reverb?.durationSec, "reverb.durationSec", 0.05, 10);
  checkNumber(depth.reverb?.decay, "reverb.decay", 0.1, 100);
  checkNumber(depth.reverb?.wet, "reverb.wet", 0, 1);
}

// Une vitesse nulle ferait un trajet sans fin.
export function validateRolls(rolls) {
  for (const style of SPEED_STYLES) {
    checkNumber(rolls[style]?.speed, `${style}.speed`, 0.01, 100);
    checkNumber(rolls[style]?.endRatio, `${style}.endRatio`, 0.01, 1);
  }
  checkNumber(rolls.rotation?.notchMs, "rotation.notchMs", 50, 5000);
  checkNumber(rolls.rotation?.endRatio, "rotation.endRatio", 0.01, 1);
  checkNumber(rolls.rotation?.gain, "rotation.gain", 0, 1);
  checkNumber(rolls.rotation?.dropGain, "rotation.dropGain", 0, 1);
  checkNumber(rolls.restRate, "restRate", 0.1, 1);
  checkNumber(rolls.fadeMs, "fadeMs", 0, 1000);
  checkNumber(rolls.impactToOutMs, "impactToOutMs", 0, 5000);
  checkNumber(rolls.outStaggerMs, "outStaggerMs", 0, 5000);
}

// Les styles dont la durée vient de la vitesse ; la rotation a ses crans.
const SPEED_STYLES = ["place", "strike", "swap", "knocked", "out"];

// Chaque calibre a son poids, strictement positif (un rapport de poids nuls n'a pas
// de sens).
export function validateCollision(collision, sizes = MARBLE_SIZES) {
  checkNumber(collision.flamMs, "flamMs", 0, 200);
  checkNumber(collision.weightExponent, "weightExponent", 0, 3);
  for (const [size, id] of Object.entries(sizes)) checkNumber(collision.weights?.[size], `weights.${id}`, 0.01, 100);
}

// Une variation au-delà de la moitié ferait d'un son un autre son.
export function validatePitchVariation(variation) {
  for (const sound of ["impact", "drop", "roll", "polish", "crack"]) checkNumber(variation[sound], `pitchVariation.${sound}`, 0, 0.5);
}

validateSoundPlaces(MARBLES_SOUND_PLACES);
validateSoundDepth(MARBLES_SOUND_DEPTH);
validateRolls(MARBLES_ROLLS);
validateCollision(MARBLES_COLLISION);
validatePitchVariation(MARBLES_PITCH_VARIATION);
