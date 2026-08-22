// Scène audio de la ville : lit session + registre pour positionner le son
// de chaque entité et déclencher les bruits de pas. Délègue tout le son à
// audio.js — ne touche jamais Howler directement.
//
// Spatialisation en stereo + volume dérivés de la distance au joueur, pas en
// HRTF (voir CLAUDE.md).

import { playOneShot, createPositionedSound } from "../audio.js";
import registry from "../../entities/types.js";
import { TUNING_DEFAULTS, resolveTuning } from "../../config/tuning.js";

// STEP_DISTANCE ne concerne aucune entité (c'est le pas du joueur) : défaut
// global lu directement. AUDIBLE_RANGE et PAN_SATURATION concernent chaque
// entité individuellement : résolus via resolveTuning (cascade
// instance -> type -> défaut global), voir plus bas.
const STEP_DISTANCE = TUNING_DEFAULTS.stepDistance;
// Anti-mitraillette sur le SON du pas uniquement — le déplacement, lui,
// reste pleinement réactif à chaque tick. Nettement sous l'intervalle de
// marche soutenue (~330ms), donc invisible en marche normale.
const MIN_STEP_INTERVAL_MS = TUNING_DEFAULTS.minStepIntervalMs;
const FOOTSTEP_SOUND = "sounds/footstep_concrete_walk_1.mp3";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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

    for (const { entity, sound, audibleRange, panSaturation } of entitySounds) {
      const relX = entity.x - x;
      const dist = Math.abs(relX);
      const pan = clamp(relX / panSaturation, -1, 1);
      const volume = dist >= audibleRange ? 0 : clamp(1 - dist / audibleRange, 0, 1);
      sound.update(pan, volume);
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
