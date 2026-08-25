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

import {
  playOneShot,
  createPositionedSound,
  createReverbBus,
  playGlobal,
  playAmbiences,
  stopGlobal,
  setGlobalVolume,
} from "../../lib/audio.js";
import { announce } from "../../lib/announce.js";
import { resolveAsset } from "../../lib/assets.js";
import registry from "../../entities/types.js";
import player from "../../entities/player.js";
import { TUNING_DEFAULTS, resolveTuning } from "../../config/tuning.js";
import { getPref, PREF_CONSTRAINTS } from "../../config/preferences.js";
import { t } from "../../i18n/index.js";
import { MOVE_STEP } from "../../core/state.js";

// Facteurs de préférence (Options > Audio, voir view/menus/audio-menu.js) :
// stockés en pourcentage [0,100] (même domaine que les sliders), convertis
// ici en facteur [0,1] appliqué MULTIPLICATIVEMENT par-dessus le volume déjà
// calculé (distance, cascade de tuning...) — jamais à sa place. Fallback =
// PREF_CONSTRAINTS.default (même source que les sliders, voir
// config/preferences.js) : comportement inchangé tant qu'aucune préférence
// n'est posée, cohérent avec ce que le slider affiche dès sa première
// ouverture.
function beaconVolumeFactor() {
  return getPref("beaconVolume", PREF_CONSTRAINTS.beaconVolume.default) / 100;
}
function footstepVolumeFactor() {
  return getPref("footstepVolume", PREF_CONSTRAINTS.footstepVolume.default) / 100;
}
function musicVolumeFactor() {
  return getPref("musicVolume", PREF_CONSTRAINTS.musicVolume.default) / 100;
}
function ambienceVolumeFactor() {
  return getPref("ambienceVolume", PREF_CONSTRAINTS.ambienceVolume.default) / 100;
}

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
// entité). Durée/decay sont surchargeables PAR LIEU (level.reverbDurationSec/
// reverbDecay, voir level/schema.md) — repli sur ces défauts globaux si le
// lieu n'en fournit pas ; wet reste global (jamais surchargé par lieu,
// non demandé). Pas de cascade par entité dans tous les cas.
const REVERB_DURATION_SEC_DEFAULT = TUNING_DEFAULTS.reverbDurationSec;
const REVERB_DECAY_DEFAULT = TUNING_DEFAULTS.reverbDecay;
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
// plus à gauche d'abord). entitySounds porte la config STATIQUE par entité
// (interactRange...), résolue une fois à la création de la scène ; liveById
// porte la position COURANTE (x change au tick pour une entité "wander",
// voir core/reduce.js) — jointes ici par id, jamais une entité figée à sa
// position de spawn. Le tri est fait ici une seule fois : consommé aussi
// bien par l'annonce d'occupation que par la résolution de cible
// d'interaction (chooseInteractionTarget, view/interaction.js), qui doivent
// voir exactement le même ensemble dans le même ordre.
function occupiedEntities(entitySounds, liveById, x) {
  return entitySounds
    .filter(({ entity, interactRange }) => Math.abs(liveById.get(entity.id).x - x) <= interactRange)
    .map(({ entity }) => liveById.get(entity.id))
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

// Scène ville actuellement vivante, s'il y en a une (voir
// refreshActiveBeaconVolumes plus bas).
let activeScene = null;

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
      // Résolu une fois ici (balise = boucle persistante, pas de nouveau
      // tirage à chaque tick) : beacon.path peut être un pool, un membre
      // précis, ou un chemin direct — resolveAsset gère les trois.
      sound: createPositionedSound(resolveAsset(beacon.path)),
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

  // Un seul bus de réverb pour toute la scène, jamais un par entité. Lieu ->
  // défaut global (voir REVERB_DURATION_SEC_DEFAULT/REVERB_DECAY_DEFAULT
  // ci-dessus) : deux niveaux de repli, pas la cascade générale de
  // resolveTuning (celle-ci reste entité-only).
  const level = getSession().level;
  const reverbBus = createReverbBus({
    durationSec: level.reverbDurationSec ?? REVERB_DURATION_SEC_DEFAULT,
    decay: level.reverbDecay ?? REVERB_DECAY_DEFAULT,
    wet: REVERB_WET,
  });

  for (const { sound, reverbSend } of entitySounds) {
    sound.sendToReverb(reverbBus.input, reverbSend);
  }

  // Son de collision par entité (optionnel, dormant si absent OU si
  // l'entité n'est pas blocksMovement — voir entities/types.js). Résolu par
  // id, pas par référence figée : blockedBy (core/reduce.js) ne nomme
  // jamais une entité non bloquante, donc ce lookup suffit, pas besoin de
  // revérifier blocksMovement ici.
  const collisionSoundByEntityId = new Map(
    entitySounds.map(({ entity }) => [entity.id, registry[entity.type].collisionSound])
  );

  // Musique et ambiances du lieu : canaux GLOBAUX non spatialisés (aucun
  // pan/filtre/réverb, voir lib/audio.js), propriété du niveau, pas d'une
  // entité — optionnels, un niveau sans champ music/ambiences ne joue
  // simplement rien sur le canal correspondant. Ambiances : jusqu'à deux
  // couches simultanées, un seul curseur de volume pour les deux.
  // level.music/.ambiences peuvent être un pool, un membre précis, ou un
  // chemin direct — resolveAsset() gère les trois, résolu une fois ici (pas
  // un nouveau tirage par tick, la musique/ambiance ne se retire pas).
  const music = level.music;
  if (music) {
    playGlobal("music", resolveAsset(music));
    setGlobalVolume("music", musicVolumeFactor());
  }

  const ambiences = level.ambiences;
  if (ambiences && ambiences.length > 0) {
    playAmbiences(ambiences.map(resolveAsset));
    setGlobalVolume("ambience", ambienceVolumeFactor());
  }

  let lastFootstepX = getSession().player.x;
  let previousX = getSession().player.x;
  // Seule source de vérité pour "était en mouvement au tick précédent".
  let wasMoving = false;
  // Instant (performance.now()) du dernier son RÉELLEMENT joué, un
  // cooldown PAR CANAL (pas/collision) — jamais partagé : sur le tick où le
  // joueur vient buter, x avance encore jusqu'au bord (pas normal) PUIS
  // blockedBy s'active (son de collision) dans le MÊME tick ; un cooldown
  // commun ferait que le pas consomme le cooldown et fasse taire le son de
  // collision immédiat qui suit aussitôt.
  const footstepCooldown = { lastAt: -Infinity };
  const collisionCooldown = { lastAt: -Infinity };
  // Ids des entités occupées (zone d'interaction englobant le joueur) au
  // tick précédent — seule source de vérité pour détecter un changement.
  let occupiedIds = new Set();
  // Entités occupées au tick courant, déjà triées par x (voir
  // occupiedEntities) — exposé via getInteractionCandidates() pour que
  // l'écran ville résolve une cible d'interaction (Espace/Entrée) sans
  // recalculer l'occupation en double.
  let currentOccupied = [];
  // Distance que le joueur AURAIT parcourue depuis le début du blocage
  // courant (voir le bloc collision dans update()) — jamais la distance
  // réellement parcourue, puisque x ne bouge pas pendant une butée.
  let collisionAccumX = 0;
  // Seule source de vérité pour "était bloqué au tick précédent" — même
  // rôle que wasMoving pour les pas, pour détecter la transition et jouer
  // un premier son immédiat (voir update()).
  let wasBlocked = false;

  // Point de passage commun à tout son cadencé comme les pas (pas normal OU
  // butée contre une entité bloquante — centré sur le joueur, sans pan
  // particulier) : applique le cooldown de SON canal, jamais sur le
  // déplacement. Trop tôt -> le son est simplement sauté, pas de file
  // d'attente. cooldown est un objet {lastAt} propre à l'appelant (voir
  // footstepCooldown/collisionCooldown) : jamais partagé entre canaux.
  function playPacedSound(path, reverbSend, cooldown) {
    const now = performance.now();
    if (now - cooldown.lastAt < MIN_STEP_INTERVAL_MS) return;
    // Résolu à CHAQUE appel (pas une fois pour la scène) : si path est un
    // pool, chaque déclenchement peut tirer un fichier différent (variété),
    // contrairement à une balise (boucle persistante, résolue une seule
    // fois à la création).
    playOneShot(resolveAsset(path), {
      reverbSend,
      reverbBusInput: reverbBus.input,
      volume: footstepVolumeFactor(),
    });
    cooldown.lastAt = now;
  }

  function playFootstep() {
    playPacedSound(MOVEMENT_SOUND.path, FOOTSTEP_REVERB_SEND, footstepCooldown);
  }

  // Dormant si l'entité ne porte pas de collisionSound (voir
  // entities/types.js) — jamais joué dans ce cas.
  function playCollisionSound(entityId) {
    const path = collisionSoundByEntityId.get(entityId);
    if (path) playPacedSound(path, FOOTSTEP_REVERB_SEND, collisionCooldown);
  }

  // Recalcule et applique pan/volume/passe-bas de chaque balise pour la
  // position x donnée. Factorisé hors de update() : réutilisé tel quel par
  // refreshBeaconVolumes() pour qu'un changement de préférence prenne effet
  // immédiatement sur les balises DÉJÀ en train de jouer, même quand le tick
  // de la ville est arrêté (un menu au sommet de la pile, ex. Options >
  // Audio — voir CLAUDE.md sur le routage par pile d'écrans).
  // entitySounds fige entity à la création de la scène (config statique) ;
  // une entité "wander" (core/reduce.js) déplace sa position à CHAQUE tick,
  // donc la position réelle doit être relue ici depuis la session courante,
  // jamais depuis la référence figée — sinon la balise sonne juste, mais
  // reste plantée à son point de spawn.
  function liveEntitiesById() {
    return new Map(getSession().level.entities.map((entity) => [entity.id, entity]));
  }

  function applyEntityAudio(x) {
    const beaconFactor = beaconVolumeFactor();
    const liveById = liveEntitiesById();
    for (const { entity, sound, audibleRange, panSaturation, interactRange, cutoffMin, cutoffMax } of entitySounds) {
      const relX = liveById.get(entity.id).x - x;
      const dist = Math.abs(relX);
      // Pan inchangé : toujours dérivé de panSaturation, indépendant du volume.
      const pan = clamp(relX / panSaturation, -1, 1);
      const volume = volumeForDistance(dist, interactRange, audibleRange) * beaconFactor;
      sound.update(pan, volume);
      // Passe-bas : se superpose au volume/pan, ne les remplace pas.
      sound.setCutoff(cutoffForDistance(dist, interactRange, audibleRange, cutoffMin, cutoffMax));
    }
  }

  function update() {
    const session = getSession();
    const x = session.player.x;
    const blockedBy = session.player.blockedBy;

    applyEntityAudio(x);

    // Occupation par diff : n'agit QUE si l'ensemble a changé depuis le
    // tick précédent. Une nouvelle photo (assertive) coupe la précédente
    // devenue obsolète ; l'ensemble vide ne déclenche aucune annonce, juste
    // un réarmement silencieux pour la prochaine entrée. Pas de `channel`
    // imposé ici : on laisse le canal par défaut du module (liveRegion,
    // ariaNotify expérimental via setAnnounceChannel) décider, pour comparer
    // les deux sur exactement le même déclenchement.
    const occupied = occupiedEntities(entitySounds, liveEntitiesById(), x);
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

    // Butée contre une entité bloquante (core/reduce.js signale blockedBy) :
    // x ne bouge pas, donc aucun pas normal ci-dessus — le son de collision
    // le REMPLACE, il ne s'y ajoute pas. Même structure que le pas
    // ci-dessus : transition immobile -> bloqué = son immédiat (sans
    // attendre l'accumulateur, sinon un simple appui bref ne s'entend pas —
    // même souci qu'avait le premier pas), puis cadence de croisière tant
    // que le joueur tente d'avancer contre le corps, à la vitesse de marche
    // (STEP_DISTANCE), jamais mitraillette. Remis à zéro dès que le blocage
    // cesse.
    const isBlocked = blockedBy !== null;
    if (isBlocked && !wasBlocked) {
      playCollisionSound(blockedBy);
    }
    wasBlocked = isBlocked;

    if (isBlocked) {
      collisionAccumX += MOVE_STEP;
      while (collisionAccumX >= STEP_DISTANCE) {
        collisionAccumX -= STEP_DISTANCE;
        playCollisionSound(blockedBy);
      }
    } else {
      collisionAccumX = 0;
    }
  }

  function destroy() {
    for (const { sound } of entitySounds) {
      sound.stop(); // nettoie aussi son propre envoi de réverb
    }
    reverbBus.destroy();
    // Sortie RÉELLE de la scène uniquement (voir view/city-screen.js,
    // onExit) : un menu/pause empilé par-dessus n'appelle jamais destroy(),
    // donc n'arrête jamais musique/ambiances — seule la vraie sortie le fait.
    stopGlobal("music");
    stopGlobal("ambience");
    if (activeScene === api) activeScene = null;
  }

  // Candidats d'interaction courants (Espace/Entrée) : même ensemble, même
  // tri que la dernière annonce d'occupation calculée en update().
  function getInteractionCandidates() {
    return currentOccupied;
  }

  // Rafraîchit les balises à la position courante du joueur, sans repasser
  // par le reste de update() (pas de re-déclenchement de pas ni de
  // ré-évaluation de l'occupation) — voir applyEntityAudio ci-dessus.
  function refreshBeaconVolumes() {
    applyEntityAudio(getSession().player.x);
  }

  // Pause/reprise SÉLECTIVE : uniquement les balises positionnées des
  // entités (pas le bus de réverb, qui ne fait que traiter un signal — sans
  // signal entrant il est déjà silencieux — et pas musique/ambiances,
  // canaux globaux non spatialisés, qui ne sont pas des "voix de la scène"
  // — voir lib/audio.js playGlobal/stopGlobal). Utilisé par les menus qui
  // se superposent au jeu (désambiguïsation, pause — voir
  // view/interaction.js, view/menus/pause-menu.js) pour dégager le canal
  // positionné pendant qu'ils sont ouverts, sans toucher au contexte audio
  // global ni à la musique/aux ambiances, qui continuent derrière eux.
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

  const api = { update, destroy, getInteractionCandidates, pauseBeacons, resumeBeacons, refreshBeaconVolumes };
  // Au plus une scène ville vivante à la fois dans cette appli (jamais
  // imbriquée) : permet à un menu ouvert par-dessus (Options > Audio) de
  // rafraîchir la scène courante sans passer une référence explicite à
  // travers main.js — voir refreshActiveBeaconVolumes ci-dessous.
  activeScene = api;
  return api;
}

// Rafraîchit en temps réel le volume des balises de la scène ville
// actuellement active, s'il y en a une (ex. Options ouvert depuis le menu
// principal, avant toute entrée en ville : no-op). Voir
// view/menus/audio-menu.js, appelé en onChange d'un slider de volume.
export function refreshActiveBeaconVolumes() {
  if (activeScene) activeScene.refreshBeaconVolumes();
}
