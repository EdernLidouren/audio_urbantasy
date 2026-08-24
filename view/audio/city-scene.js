// Scène audio de la ville : lit session + registre pour positionner le son
// de chaque entité et déclencher les bruits de pas. Ne fournit que des
// distances et des réglages à audio.js — la plomberie Web Audio (dont le
// passe-bas et le bus de réverb) y reste entièrement.
//
// Spatialisation en stereo + volume dérivés de la distance au joueur, pas en
// HRTF (voir CLAUDE.md). Un passe-bas dépendant de la distance se superpose
// au volume/pan (lointain = étouffé), sans les remplacer. Un bus de réverb
// PARTAGÉ (un seul pour toute la scène) se superpose en plus, discrètement,
// pour donner un sentiment d'espace — le chemin sec (pan/filtre/volume)
// reste la seule source de localisation et de distance. Modèle d'entité et
// vocabulaire de sons (balise/mouvement/ponctuel) : voir entities/model.md.

import { playOneShot, createPositionedSound, createReverbBus } from "../../lib/audio.js";
import { announce } from "../../lib/announce.js";
import registry from "../../entities/types.js";
import player from "../../entities/player.js";
import { TUNING_DEFAULTS, resolveTuning } from "../../config/tuning.js";
import { t } from "../../i18n/index.js";

// STEP_DISTANCE ne concerne aucune entité (c'est le pas du joueur) : défaut
// global lu directement. AUDIBLE_RANGE, PAN_SATURATION, INTERACT_RANGE et
// REVERB_SEND (des entités) concernent chaque entité individuellement :
// résolus via resolveTuning (cascade son -> instance -> type -> défaut
// global), voir plus bas.
const STEP_DISTANCE = TUNING_DEFAULTS.stepDistance;
// Anti-mitraillette sur le SON du pas uniquement — le déplacement, lui,
// reste pleinement réactif à chaque tick. Nettement sous l'intervalle de
// marche soutenue (~330ms), donc invisible en marche normale.
const MIN_STEP_INTERVAL_MS = TUNING_DEFAULTS.minStepIntervalMs;
// Niveaux du modèle de volume par zones (voir volumeForDistance) : ce sont
// des constantes de forme de courbe, pas des réglages par entité.
const FULL_VOLUME = TUNING_DEFAULTS.fullVolume;
const FAR_VOLUME_MAX = TUNING_DEFAULTS.farVolumeMax;

// Réverb : propriétés du bus lui-même (un seul par scène, jamais par
// entité), défauts globaux lus directement, pas de cascade par entité.
const REVERB_DURATION_SEC = TUNING_DEFAULTS.reverbDurationSec;
const REVERB_DECAY = TUNING_DEFAULTS.reverbDecay;
const REVERB_WET = TUNING_DEFAULTS.reverbWet;

// Son de déplacement du joueur (auditeur, jamais dans entities). reverbSend
// n'a pas de niveau "type"/"instance" applicable (le joueur n'en a pas) :
// simple repli sound -> défaut global dédié (footstepReverbSend), pas la
// cascade générale de resolveTuning (dont le défaut global porterait sur
// "reverbSend", la valeur des ENTITÉS — délibérément différente).
const MOVEMENT_SOUND = player.sounds.movement;
const FOOTSTEP_REVERB_SEND =
  MOVEMENT_SOUND.reverbSend !== undefined ? MOVEMENT_SOUND.reverbSend : TUNING_DEFAULTS.footstepReverbSend;

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

  const progress = (dist - interactRange) / range;
  return FAR_VOLUME_MAX * (1 - progress);
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

  const progress = (dist - interactRange) / range;
  return cutoffMax * Math.pow(cutoffMin / cutoffMax, progress);
}

// Entités dont la zone d'interaction (interactRange résolu PAR ENTITÉ, via
// la cascade) englobe le joueur à l'instant x, triées par x croissant (le
// plus à gauche d'abord). Raisonne en distance relative à chaque entité,
// jamais en position figée : fonctionne aussi si une entité venait à se
// déplacer un jour, sans code spécial. Le tri est fait ici une seule fois :
// consommé aussi bien par l'annonce d'occupation que par la résolution de
// cible d'interaction (chooseInteractionTarget, view/interaction.js), qui
// doivent voir exactement le même ensemble dans le même ordre.
function occupiedEntities(entitySounds, x) {
  return entitySounds
    .filter(({ entity, interactRange }) => Math.abs(entity.x - x) <= interactRange)
    .map(({ entity }) => entity)
    .sort((a, b) => a.x - b.x);
}

// Phrase d'annonce : noms séparés par ", ", dans l'ordre déjà trié par
// occupiedEntities. Chaque labelKey est déjà résolu par parseLevel (nameKey
// d'instance sinon label du type) ; on ne fait que le traduire ici.
function buildOccupancyAnnouncement(entities) {
  return entities.map((entity) => t(entity.labelKey)).join(", ");
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

// getSession : accesseur (pas la session elle-même), car le core remplace
// l'objet session à chaque tick (immutabilité) — update() doit relire l'état
// courant à chaque appel plutôt que capturer une session figée à la création.
export function createCityAudioScene(getSession) {
  // Les voix positionnées d'abord : createPositionedSound crée un Howl, ce
  // qui garantit que Howler.ctx existe (Howler le crée au tout premier
  // `new Howl()`) avant de construire le bus de réverb juste après — lui
  // n'a pas de retente paresseuse comme le filtre par voix, il lui faut le
  // contexte tout de suite.
  const entitySounds = getSession().level.entities.map((entity) => {
    // beacon : la boucle positionnée du type (voir entities/model.md pour
    // le vocabulaire des rôles de son).
    const beacon = registry[entity.type].sounds.beacon;
    return {
      entity,
      sound: createPositionedSound(beacon.path),
      // Résolus une fois ici : statiques pour la durée de vie de la scène.
      audibleRange: resolveTuning("audibleRange", entity),
      panSaturation: resolveTuning("panSaturation", entity),
      interactRange: resolveTuning("interactRange", entity),
      cutoffMin: resolveTuning("cutoffMin", entity),
      cutoffMax: resolveTuning("cutoffMax", entity),
      // Cascade son -> instance -> type -> global : ni la balise, ni
      // l'instance, ni le type ne définissent reverbSend aujourd'hui, donc
      // ça retombe sur le défaut global — comportement identique à avant
      // l'introduction du modèle de son.
      reverbSend: resolveTuning("reverbSend", entity, beacon),
    };
  });

  // Un seul bus de réverb pour toute la scène, jamais un par entité.
  const reverbBus = createReverbBus({
    durationSec: REVERB_DURATION_SEC,
    decay: REVERB_DECAY,
    wet: REVERB_WET,
  });

  for (const { sound, reverbSend } of entitySounds) {
    sound.sendToReverb(reverbBus.input, reverbSend);
  }

  let lastFootstepX = getSession().player.x;
  let previousX = getSession().player.x;
  // Seule source de vérité pour "était en mouvement au tick précédent".
  let wasMoving = false;
  // Instant (performance.now()) du dernier pas RÉELLEMENT joué.
  let lastFootstepAt = -Infinity;
  // Ids des entités occupées (zone d'interaction englobant le joueur) au
  // tick précédent — seule source de vérité pour détecter un changement.
  let occupiedIds = new Set();
  // Entités occupées au tick courant, déjà triées par x (voir
  // occupiedEntities) — exposé via getInteractionCandidates() pour que
  // l'écran ville résolve une cible d'interaction (Espace/Entrée) sans
  // recalculer l'occupation en double.
  let currentOccupied = [];

  // Point de passage unique pour tout déclenchement de pas (immédiat ou de
  // cadence) : applique le cooldown sur le son, jamais sur le déplacement.
  // Trop tôt -> le pas est simplement sauté, pas de file d'attente.
  function playFootstep() {
    const now = performance.now();
    if (now - lastFootstepAt < MIN_STEP_INTERVAL_MS) return;
    playOneShot(MOVEMENT_SOUND.path, {
      reverbSend: FOOTSTEP_REVERB_SEND,
      reverbBusInput: reverbBus.input,
    });
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

    // Occupation par diff : n'agit QUE si l'ensemble a changé depuis le
    // tick précédent. Une nouvelle photo (assertive) coupe la précédente
    // devenue obsolète ; l'ensemble vide ne déclenche aucune annonce, juste
    // un réarmement silencieux pour la prochaine entrée. Pas de `channel`
    // imposé ici : on laisse le canal par défaut du module (liveRegion,
    // ariaNotify expérimental via setAnnounceChannel) décider, pour comparer
    // les deux sur exactement le même déclenchement.
    const occupied = occupiedEntities(entitySounds, x);
    currentOccupied = occupied;
    const occupiedIdsNow = new Set(occupied.map((entity) => entity.id));
    if (!setsEqual(occupiedIdsNow, occupiedIds)) {
      if (occupiedIdsNow.size > 0) {
        announce(buildOccupancyAnnouncement(occupied), { assertive: true });
      }
      occupiedIds = occupiedIdsNow;
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
      sound.stop(); // nettoie aussi son propre envoi de réverb
    }
    reverbBus.destroy();
  }

  // Candidats d'interaction courants (Espace/Entrée) : même ensemble, même
  // tri que la dernière annonce d'occupation calculée en update().
  function getInteractionCandidates() {
    return currentOccupied;
  }

  // Pause/reprise SÉLECTIVE : uniquement les balises positionnées des
  // entités (pas le bus de réverb, qui ne fait que traiter un signal — sans
  // signal entrant il est déjà silencieux — et pas une future
  // musique/ambiance globale, qui n'est pas une "voix de la scène"). Utilisé
  // par le menu de désambiguïsation (view/interaction.js) pour dégager le
  // canal pendant qu'il est ouvert, sans toucher au contexte audio global.
  function pauseBeacons() {
    for (const { sound } of entitySounds) {
      sound.pause();
    }
  }
  function resumeBeacons() {
    for (const { sound } of entitySounds) {
      sound.resume();
    }
  }

  return { update, destroy, getInteractionCandidates, pauseBeacons, resumeBeacons };
}
