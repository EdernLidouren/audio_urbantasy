// Scène audio de la ville : lit session + registre pour positionner le son
// de chaque entité et déclencher les bruits de pas. Ne fournit que des
// distances et des réglages à audio.js — la plomberie Web Audio (dont le
// passe-bas) y reste entièrement.
//
// Spatialisation en stereo + volume dérivés de la distance au joueur, pas en
// HRTF (voir CLAUDE.md). Un passe-bas dépendant de la distance se superpose
// au volume/pan (lointain = étouffé), sans les remplacer.

import { playOneShot, createPositionedSound } from "../audio.js";
import registry from "../../entities/types.js";
import { TUNING_DEFAULTS, resolveTuning } from "../../config/tuning.js";

// STEP_DISTANCE ne concerne aucune entité (c'est le pas du joueur) : défaut
// global lu directement. AUDIBLE_RANGE, PAN_SATURATION et INTERACT_RANGE
// concernent chaque entité individuellement : résolus via resolveTuning
// (cascade instance -> type -> défaut global), voir plus bas.
const STEP_DISTANCE = TUNING_DEFAULTS.stepDistance;
// Anti-mitraillette sur le SON du pas uniquement — le déplacement, lui,
// reste pleinement réactif à chaque tick. Nettement sous l'intervalle de
// marche soutenue (~330ms), donc invisible en marche normale.
const MIN_STEP_INTERVAL_MS = TUNING_DEFAULTS.minStepIntervalMs;
const FOOTSTEP_SOUND = "sounds/footstep_concrete_walk_1.mp3";
// Niveaux du modèle de volume par zones (voir volumeForDistance) : ce sont
// des constantes de forme de courbe, pas des réglages par entité.
const FULL_VOLUME = TUNING_DEFAULTS.fullVolume;
const FAR_VOLUME_MAX = TUNING_DEFAULTS.farVolumeMax;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Volume par zones (palier volontaire à interactRange, pas une rampe
// continue) :
//   - dist <= interactRange       : FULL_VOLUME, plateau plein et stable.
//   - interactRange < dist < audibleRange : décroissance linéaire de
//     FAR_VOLUME_MAX vers 0. Le saut FULL_VOLUME -> FAR_VOLUME_MAX à la
//     frontière est le signal audio "tu quittes la zone d'interaction".
//   - dist >= audibleRange        : 0, silence.
function volumeForDistance(dist, interactRange, audibleRange) {
  if (dist <= interactRange) return FULL_VOLUME;
  if (dist >= audibleRange) return 0;

  const range = audibleRange - interactRange;
  if (range <= 0) return 0; // config incohérente (audibleRange <= interactRange)

  const t = (dist - interactRange) / range;
  return FAR_VOLUME_MAX * (1 - t);
}

// Fréquence de coupure du passe-bas par zones, contrairement au volume SANS
// palier : ouverture progressive et régulière sur toute l'approche.
//   - dist <= interactRange : cutoffMax (son clair, non filtré).
//   - interactRange..audibleRange : interpolation LOGARITHMIQUE (pas
//     linéaire) de cutoffMax vers cutoffMin — l'oreille perçoit la
//     fréquence sur une échelle log, une rampe linéaire sonnerait comme un
//     changement brusque puis presque rien.
//   - dist >= audibleRange : cutoffMin (le plus étouffé).
// Continue par construction : à dist=interactRange, exposant t=0 -> cutoffMax
// des deux côtés, pas de saut (contrairement à volumeForDistance).
function cutoffForDistance(dist, interactRange, audibleRange, cutoffMin, cutoffMax) {
  if (dist <= interactRange) return cutoffMax;
  if (dist >= audibleRange) return cutoffMin;

  const range = audibleRange - interactRange;
  if (range <= 0) return cutoffMin;

  const t = (dist - interactRange) / range;
  return cutoffMax * Math.pow(cutoffMin / cutoffMax, t);
}

// getSession : accesseur (pas la session elle-même), car le core remplace
// l'objet session à chaque tick (immutabilité) — update() doit relire l'état
// courant à chaque appel plutôt que capturer une session figée à la création.
export function createCityAudioScene(getSession) {
  const entitySounds = getSession().level.entities.map((entity) => ({
    entity,
    sound: createPositionedSound(registry[entity.type].sound),
    // Résolus une fois ici : statiques pour la durée de vie de la scène.
    audibleRange: resolveTuning("audibleRange", entity),
    panSaturation: resolveTuning("panSaturation", entity),
    interactRange: resolveTuning("interactRange", entity),
    cutoffMin: resolveTuning("cutoffMin", entity),
    cutoffMax: resolveTuning("cutoffMax", entity),
  }));

  let lastFootstepX = getSession().player.x;
  let previousX = getSession().player.x;
  // Seule source de vérité pour "était en mouvement au tick précédent".
  let wasMoving = false;
  // Instant (performance.now()) du dernier pas RÉELLEMENT joué.
  let lastFootstepAt = -Infinity;

  // Point de passage unique pour tout déclenchement de pas (immédiat ou de
  // cadence) : applique le cooldown sur le son, jamais sur le déplacement.
  // Trop tôt -> le pas est simplement sauté, pas de file d'attente.
  function playFootstep() {
    const now = performance.now();
    if (now - lastFootstepAt < MIN_STEP_INTERVAL_MS) return;
    playOneShot(FOOTSTEP_SOUND);
    lastFootstepAt = now;
  }

  function update() {
    const x = getSession().player.x;

    for (const { entity, sound, audibleRange, panSaturation, interactRange, cutoffMin, cutoffMax } of entitySounds) {
      const relX = entity.x - x;
      const dist = Math.abs(relX);
      // Pan inchangé : toujours dérivé de panSaturation, indépendant du volume.
      const pan = clamp(relX / panSaturation, -1, 1);
      const volume = volumeForDistance(dist, interactRange, audibleRange);
      sound.update(pan, volume);
      // Passe-bas : se superpose au volume/pan, ne les remplace pas.
      sound.setCutoff(cutoffForDistance(dist, interactRange, audibleRange, cutoffMin, cutoffMax));
    }

    // Pas centré, sans pan : c'est le joueur lui-même.

    // Transition immobile -> en mouvement : premier pas immédiat, sans
    // attendre d'avoir parcouru STEP_DISTANCE au complet. L'accumulateur
    // repart de x courant, la cadence de croisière reprend normalement dès
    // le tick suivant.
    const isMoving = x !== previousX;
    if (isMoving && !wasMoving) {
      playFootstep();
      lastFootstepX = x;
    }
    wasMoving = isMoving;
    previousX = x;

    while (Math.abs(x - lastFootstepX) >= STEP_DISTANCE) {
      playFootstep();
      lastFootstepX += Math.sign(x - lastFootstepX) * STEP_DISTANCE;
    }
  }

  function destroy() {
    for (const { sound } of entitySounds) {
      sound.stop();
    }
  }

  return { update, destroy };
}
