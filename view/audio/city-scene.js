// Scène audio de la ville : lit session + registre pour positionner le son
// de chaque entité et déclencher les bruits de pas (du joueur ET des
// entités mobiles, voir jouer les sons de déplacement plus bas). Ne fournit
// que des distances et des réglages à audio.js — la plomberie Web Audio
// (dont le passe-bas et le bus de réverb) y reste entièrement.
//
// Spatialisation en stereo + volume dérivés de la distance au joueur, pas en
// HRTF (voir CLAUDE.md). Un passe-bas dépendant de la distance se superpose
// au volume/pan (lointain = étouffé), sans les remplacer — SEULEMENT pour
// une balise CONTINUE (voix maintenue) : un one-shot (balise intermittente,
// vocal, son de déplacement) est trop court pour qu'un filtre continu ait un
// sens, voir playPositionedOneShot plus bas. Un bus de réverb PARTAGÉ (un
// seul pour toute la scène) se superpose en plus, discrètement, pour donner
// un sentiment d'espace — le chemin sec (pan/filtre/volume) reste la seule
// source de localisation et de distance.
//
// Deux rôles de son POSITIONNÉ, techniquement identiques (même calcul pan/
// distance/filtre) mais distincts par leur INTENTION, voir entities/model.md :
// - beacon (LOCALISATION) — continu ou intermittent régulier, sert à situer
//   l'entité dans l'espace ;
// - vocal (EXPRESSION) — TOUJOURS intermittent, à intervalle long et très
//   variable, ne sert pas à localiser, juste à peupler l'ambiance.
// Chacun optionnel indépendamment (aucune entité n'est tenue d'avoir l'un ou
// l'autre) ; leur mécanisme de déclenchement intermittent est UNIQUE et
// PARTAGÉ (voir resolveIntermittentSource/updateIntermittentSources), seules
// les clés de cascade et les valeurs par défaut diffèrent par rôle. Modèle
// d'entité complet et vocabulaire de sons (balise/vocal/mouvement/ponctuel) :
// voir entities/model.md — les valeurs par défaut listées ci-dessous
// viennent toutes de config/tuning-values.js, jamais dupliquées ici.
//
// Aléa de rendu NON déterministe (Math.random, jamais le PRNG seedé du
// core) : l'intervalle d'une source intermittente (beacon ou vocal) et la
// variation de hauteur (pitchVariation) sont de la présentation pure, sans
// effet sur l'état de partie — les faire dépendre du PRNG seedé coderait
// dans le core un souci qui ne le concerne pas (voir resolveAsset,
// lib/assets.js, qui tire déjà ses pools au hasard de la même façon,
// précédent déjà en place).

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
import { resolveAsset, hasAsset } from "../../lib/assets.js";
import registry from "../../entities/types/index.js";
import player from "../../entities/player.js";
import { TUNING_DEFAULTS, resolveTuning } from "../../config/tuning.js";
import { getPref, PREF_CONSTRAINTS } from "../../config/preferences.js";
import { t } from "../../i18n/index.js";
import { MOVE_STEP, getActiveWorld } from "../../core/state.js";
import { surfaceAt, surfaceProps } from "../../core/surfaces.js";

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

// Clé d'asset "<name>_walk" sous assets/sounds/footsteps/ — convention
// PARTAGÉE par une surface, un gait ou un naturalWalk (voir
// resolveFootstepPath ci-dessous) : un simple nom + suffixe, jamais composé
// (voir entities/model.md, "pas de produit cartésien surface×chaussure").
function footstepKey(name) {
  return `assets/sounds/footsteps/${name}_walk`;
}

// Plancher garanti du son de pas : le SEUL chemin dont l'existence n'est
// JAMAIS vérifiée (contrairement aux crans ci-dessous, tous testés via
// hasAsset) — DOIT rester présent en permanence. "shoes" : le pool neutre
// général du jeu (voir entities/player.js) — remplace "concrete", retiré de
// assets/ lors de l'ajout des pools shoes_walk/sand_walk.
const FOOTSTEP_FLOOR_PATH = footstepKey("shoes");

// Résout le CHEMIN du son de pas d'un mobile (joueur ou entité) au point x
// d'un monde donné — VUE : dérive un nom de fichier depuis le flag
// `neutral` de core/surfaces.js, le core lui-même ne connaît AUCUN son. DEUX
// branches disjointes selon `neutral`, JAMAIS de croisement surface×gait
// (voir entities/model.md) — au plus 3 crans, chacun une clé à UNE seule
// dimension, chacun vérifié via hasAsset (jamais resolveAsset : on doit
// pouvoir tester l'existence AVANT de trancher, sans jamais lever) :
//   - sol SPÉCIAL (neutral:false) : "<surface>_walk" si son pool existe ->
//     sinon bascule en branche NEUTRE (un sol spécial sans son dédié sonne
//     comme un sol neutre, jamais comme un silence).
//   - sol NEUTRE (neutral:true) : "<gait>_walk" si l'entité a un gait ET
//     que son pool existe -> sinon le pas NATUREL de l'entité :
//     "<naturalWalk>_walk" si résolu ET existant, SINON son propre (ownPath,
//     si l'entité en a un — voir entities/model.md, "chien important") ->
//     sinon le plancher garanti (FOOTSTEP_FLOOR_PATH, jamais vérifié).
// Ne peut jamais échouer : au pire, retombe sur FOOTSTEP_FLOOR_PATH.
function resolveFootstepPath(world, x, { gait, naturalWalk, ownPath } = {}) {
  const surface = surfaceAt(world, x);
  const props = surfaceProps(surface);

  if (props && !props.neutral) {
    const specialKey = footstepKey(surface);
    if (hasAsset(specialKey)) return specialKey;
  }

  if (gait) {
    const gaitKey = footstepKey(gait);
    if (hasAsset(gaitKey)) return gaitKey;
  }

  if (naturalWalk) {
    const naturalKey = footstepKey(naturalWalk);
    if (hasAsset(naturalKey)) return naturalKey;
  }

  return ownPath || FOOTSTEP_FLOOR_PATH;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Taux de lecture tiré uniformément dans [1-pitchVariation, 1+pitchVariation]
// (voir TUNING_DEFAULTS.pitchVariation) — 1 (aucune variation) si
// pitchVariation est 0 ou absent, jamais d'appel à Math.random() inutile
// dans ce cas.
function randomRate(pitchVariation) {
  if (!pitchVariation) return 1;
  return 1 + (Math.random() * 2 - 1) * pitchVariation;
}

// Prochain délai (ms) avant un déclenchement intermittent (beacon ou
// vocal) : voir TUNING_DEFAULTS.beaconInterval/vocalInterval et leurs
// variations respectives. Borné à 0 au cas où la variation dépasserait
// l'intervalle lui-même (config extrême) — jamais un délai négatif.
function jitteredIntervalMs(interval, variation) {
  return Math.max(0, interval + (Math.random() * 2 - 1) * variation);
}

// Clés de cascade propres à chaque RÔLE de source positionnée intermittente
// (voir resolveIntermittentSource ci-dessous) — c'est la SEULE différence
// entre un beacon intermittent et un vocal : le mécanisme de déclenchement/
// replanification lui-même est unique et partagé (voir
// updateIntermittentSources, plus bas dans createCityAudioScene).
const BEACON_TUNING_KEYS = { interval: "beaconInterval", intervalVariation: "beaconIntervalVariation", gain: "beaconGain" };
const VOCAL_TUNING_KEYS = { interval: "vocalInterval", intervalVariation: "vocalIntervalVariation", gain: "vocalGain" };

// Résout une source positionnée INTERMITTENTE (beacon en mode
// "intermittent", ou vocal — toujours intermittent) : chemin, cadence
// (interval/intervalVariation), gain propre et variation de hauteur, tous
// résolus contre CE descripteur de son (cascade son -> instance ->
// archétype -> défaut global, voir entities/model.md) via les clés du rôle
// (keys). nextAt (mutable, relu/réécrit à chaque tick — voir
// updateIntermittentSources) réamorcé à 0 : premier déclenchement dès le
// premier tick.
function resolveIntermittentSource(entity, descriptor, keys) {
  return {
    path: descriptor.path,
    interval: resolveTuning(keys.interval, entity, descriptor),
    intervalVariation: resolveTuning(keys.intervalVariation, entity, descriptor),
    gain: resolveTuning(keys.gain, entity, descriptor),
    pitchVariation: resolveTuning("pitchVariation", entity, descriptor),
    reverbSend: resolveTuning("reverbSend", entity, descriptor),
    nextAt: 0,
  };
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
  // Les voix positionnées d'abord (si au moins une entité est en balise
  // CONTINUE) : createPositionedSound crée un Howl, ce qui garantit que
  // Howler.ctx existe (Howler le crée au tout premier `new Howl()`) avant de
  // construire le bus de réverb juste après — lui n'a pas de retente
  // paresseuse comme le filtre par voix, il lui faut le contexte tout de
  // suite. Limite connue : un niveau dont AUCUNE entité n'aurait de balise
  // continue (tout en intermittent/vocal/absent) ne créerait aucun Howl ici,
  // et createReverbBus se dégraderait silencieusement (pas de contexte ->
  // pas de bus, voir lib/audio.js) — non atteignable avec le contenu actuel
  // (toujours au moins une balise continue), pas corrigé pour ce cas
  // hypothétique.
  // Capturé une fois ici (monde ACTIF à la création de la scène) : réutilisé
  // pour construire entitySounds ET amorcer lastMovementSurface de chaque
  // entité (voir plus bas) — le monde du TICK courant, lui, reste relu à
  // chaque update() (voir plus bas), jamais celui-ci qui ne vaut que pour
  // l'amorçage.
  const initialWorld = getActiveWorld(getSession());
  const entitySounds = initialWorld.entities.map((entity) => {
    // beacon (localisation) et vocal (expression) : descripteurs de son du
    // type, tous deux OPTIONNELS et indépendants (voir entities/model.md) —
    // ni l'un ni l'autre n'est "le" son obligatoire d'une entité.
    const sounds = registry[entity.type].sounds;
    const beacon = sounds.beacon;
    const vocal = sounds.vocal;

    // Résolus une fois ici : statiques pour la durée de vie de la scène,
    // propriétés de l'ENTITÉ (pas d'un rôle de son particulier) — partagées
    // par le beacon, le vocal ET le son de déplacement ci-dessous.
    const audibleRange = resolveTuning("audibleRange", entity);
    const panSaturation = resolveTuning("panSaturation", entity);
    const interactRange = resolveTuning("interactRange", entity);
    const cutoffMin = resolveTuning("cutoffMin", entity);
    const cutoffMax = resolveTuning("cutoffMax", entity);

    // Son de déplacement (rôle "movement", voir entities/model.md) :
    // DORMANT si l'archétype n'en porte pas — la plupart des types n'ont pas
    // vocation à marcher. Cadencé par la DISTANCE parcourue, jamais par un
    // intervalle de temps : traité à part des sources intermittentes
    // ci-dessous (beacon/vocal), qui partagent, elles, le même mécanisme.
    const movement = sounds.movement;
    const movementFields = movement
      ? {
          movementPath: movement.path,
          movementReverbSend: resolveTuning("reverbSend", entity, movement),
          movementPitchVariation: resolveTuning("pitchVariation", entity, movement),
          movementGain: resolveTuning("movementGain", entity, movement),
          // stepDistance reste le même réglage GLOBAL que le joueur
          // (STEP_DISTANCE), jamais surchargé indépendamment — seul
          // movementStepMultiplier module la cadence (voir
          // config/tuning-values.js).
          movementStepDistance: STEP_DISTANCE / resolveTuning("movementStepMultiplier", entity, movement),
          // Position de départ = spawn de l'entité : le premier pas ne sonne
          // qu'après avoir parcouru movementStepDistance depuis là, comme le
          // joueur au tout premier tick d'une partie.
          lastMovementX: entity.x,
          // Sol au spawn — voir updateEntityMovementSounds : un changement
          // de sol déclenche un pas IMMÉDIAT, sans attendre movementStepDistance.
          lastMovementSurface: surfaceAt(initialWorld, entity.x),
          // Cooldown anti-mitraillette PROPRE à cette entité (même principe
          // que footstepCooldown pour le joueur, voir playPacedSound) —
          // sans lui, le déclenchement immédiat sur changement de sol
          // pouvait se redéclencher chaque tick (ex. léger flottement de
          // position près d'une frontière) : rien ne le limitait avant,
          // l'accumulateur par distance suffisait tant qu'aucun second
          // déclencheur n'existait.
          movementCooldown: { lastAt: -Infinity },
          // gait/naturalWalk (voir entities/model.md, "Surfaces de sol et
          // son de pas") : propriétés de l'ENTITÉ, pas d'un rôle de son —
          // même cascade que audibleRange/panSaturation ci-dessus (pas de
          // `sound` en 3e paramètre, jamais surchargées par descripteur de
          // son). Résolues seulement ICI (une entité sans movement n'a de
          // toute façon aucun pas à faire sonner) : point de départ du choix
          // DYNAMIQUE du fichier à chaque pas, voir resolveFootstepPath.
          gait: resolveTuning("gait", entity),
          naturalWalk: resolveTuning("naturalWalk", entity),
        }
      : {};

    // sound (voix positionnée CONTINUE, un Howl persistant) UNIQUEMENT si
    // le beacon existe ET qu'il est en mode "continu" (défaut) — sinon
    // (intermittent, ou pas de beacon du tout), rien de permanent à
    // maintenir ici : intermittentSources ci-dessous s'en charge en
    // one-shot, à sa propre cadence (voir updateIntermittentSources).
    // beaconGain/beaconReverbSend ne sont résolus que dans ce cas : seuls
    // applyEntityAudio (volume/tick) et le branchement au bus de réverb
    // juste après ce bloc en ont besoin.
    let sound = null;
    let beaconGain;
    let beaconReverbSend;
    const intermittentSources = [];

    if (beacon) {
      const beaconMode = resolveTuning("beaconMode", entity, beacon);
      if (beaconMode === "continu") {
        beaconGain = resolveTuning("beaconGain", entity, beacon);
        beaconReverbSend = resolveTuning("reverbSend", entity, beacon);
        const beaconPitchVariation = resolveTuning("pitchVariation", entity, beacon);
        // pitchVariation, s'il y en a une, tirée UNE FOIS ici (voir la note
        // du header sur les balises continues).
        sound = createPositionedSound(resolveAsset(beacon.path), { rate: randomRate(beaconPitchVariation) });
      } else {
        intermittentSources.push(resolveIntermittentSource(entity, beacon, BEACON_TUNING_KEYS));
      }
    }

    // vocal : TOUJOURS intermittent (aucun mode continu pour ce rôle, voir
    // entities/model.md) — même mécanisme que le beacon intermittent
    // ci-dessus, juste une deuxième source dans le même tableau.
    if (vocal) {
      intermittentSources.push(resolveIntermittentSource(entity, vocal, VOCAL_TUNING_KEYS));
    }

    return {
      entity,
      audibleRange,
      panSaturation,
      interactRange,
      cutoffMin,
      cutoffMax,
      sound,
      beaconGain,
      beaconReverbSend,
      intermittentSources,
      ...movementFields,
    };
  });

  // Un seul bus de réverb pour toute la scène, jamais un par entité. Lieu ->
  // défaut global (voir REVERB_DURATION_SEC_DEFAULT/REVERB_DECAY_DEFAULT
  // ci-dessus) : deux niveaux de repli, pas la cascade générale de
  // resolveTuning (celle-ci reste entité-only).
  const world = getActiveWorld(getSession());
  const reverbBus = createReverbBus({
    durationSec: world.reverbDurationSec ?? REVERB_DURATION_SEC_DEFAULT,
    decay: world.reverbDecay ?? REVERB_DECAY_DEFAULT,
    wet: REVERB_WET,
  });

  // sound absent (pas de beacon continu : intermittent, vocal seul, ou
  // aucun des deux) : pas de voix persistante à brancher au bus —
  // playPositionedOneShot passe reverbBusInput/reverbSend directement à
  // chaque déclenchement (voir plus bas), comme playOneShot le fait déjà
  // pour les pas.
  for (const { sound, beaconReverbSend } of entitySounds) {
    if (sound) sound.sendToReverb(reverbBus.input, beaconReverbSend);
  }

  // Son de collision par entité (optionnel, dormant si absent OU si
  // l'entité n'est pas blocksMovement — voir entities/types/index.js). Résolu par
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
  const music = world.music;
  if (music) {
    playGlobal("music", resolveAsset(music));
    setGlobalVolume("music", musicVolumeFactor());
  }

  const ambiences = world.ambiences;
  if (ambiences && ambiences.length > 0) {
    playAmbiences(ambiences.map(resolveAsset));
    setGlobalVolume("ambience", ambienceVolumeFactor());
  }

  let lastFootstepX = getSession().player.x;
  // Sol du dernier pas joué — voir update() : un changement de sol
  // déclenche un pas IMMÉDIAT, sans attendre STEP_DISTANCE.
  let lastFootstepSurface = surfaceAt(initialWorld, getSession().player.x);
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
  // Renvoie si le son a RÉELLEMENT joué (false si le cooldown l'a supprimé)
  // — l'appelant en a besoin pour savoir s'il peut considérer un pas
  // "consommé" (voir update()/updateEntityMovementSounds : un déclenchement
  // immédiat sur changement de sol ne doit JAMAIS se marquer comme fait
  // tant que le son n'est pas réellement sorti, sinon la traversée suivante
  // se retrouve muette au lieu de simplement réessayer au tick suivant).
  function playPacedSound(path, reverbSend, cooldown) {
    const now = performance.now();
    if (now - cooldown.lastAt < MIN_STEP_INTERVAL_MS) return false;
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
    return true;
  }

  // Chemin résolu à CHAQUE pas (voir resolveFootstepPath) — jamais figé au
  // MOVEMENT_SOUND.path d'origine, qui ne sert que de repli "son propre" du
  // joueur si gait/naturalWalk (champs directs sur player, pas de cascade
  // instance/archétype pour lui — voir entities/player.js) ne résolvent
  // rien. Renvoie si le son a réellement joué (voir playPacedSound).
  function playFootstep(x, world) {
    const path = resolveFootstepPath(world, x, { gait: player.gait, naturalWalk: player.naturalWalk, ownPath: MOVEMENT_SOUND.path });
    return playPacedSound(path, FOOTSTEP_REVERB_SEND, footstepCooldown);
  }

  // Dormant si l'entité ne porte pas de collisionSound (voir
  // entities/types/index.js) — jamais joué dans ce cas.
  function playCollisionSound(entityId) {
    const path = collisionSoundByEntityId.get(entityId);
    if (path) playPacedSound(path, FOOTSTEP_REVERB_SEND, collisionCooldown);
  }

  // Son PONCTUEL mais POSITIONNÉ (contrairement à playPacedSound, centré sur
  // le joueur) : source intermittente (beacon ou vocal, voir
  // updateIntermittentSources) ou pas d'une entité mobile (voir
  // updateEntityMovementSounds). Pan/volume calculés une seule fois, au
  // moment du déclenchement — jamais maintenus après coup, contrairement à
  // une balise continue (applyEntityAudio) : c'est pourquoi ce chemin ne
  // touche jamais au passe-bas (voir le header du fichier). gain (défaut 1) :
  // facteur propre optionnel (ex. beaconGain/vocalGain/movementGain) ;
  // pitchVariation (défaut 0) : voir randomRate.
  function playPositionedOneShot(
    path,
    { relX, interactRange, audibleRange, panSaturation, reverbSend, volumeFactor, gain = 1, pitchVariation = 0 }
  ) {
    const dist = Math.abs(relX);
    const pan = clamp(relX / panSaturation, -1, 1);
    const volume = volumeForDistance(dist, interactRange, audibleRange) * volumeFactor * gain;
    playOneShot(resolveAsset(path), {
      reverbSend,
      reverbBusInput: reverbBus.input,
      volume,
      stereo: pan,
      rate: randomRate(pitchVariation),
    });
  }

  // Sources positionnées INTERMITTENTES (voir entitySounds/
  // intermittentSources) : un beacon en mode "intermittent" ET/OU un vocal
  // (toujours intermittent) partagent ICI le même mécanisme de
  // déclenchement/replanification — factorisé pour ne jamais dupliquer
  // cette logique entre les deux rôles, seuls path/interval/gain/... (déjà
  // résolus par rôle, voir resolveIntermittentSource) diffèrent. Pour
  // chaque source dont nextAt est atteint : un one-shot positionné, puis
  // replanification — jamais de `while` de rattrapage ici (contrairement
  // aux pas, cadencés par une DISTANCE qui n'avance pas pendant une pause) :
  // nextAt est une horloge MURALE (performance.now()) qui continue
  // d'avancer même écran de jeu à l'arrêt (menu au sommet de la pile, voir
  // CLAUDE.md) — un `while` y déclencherait une rafale de rattrapage au
  // retour. Ici, au plus UN déclenchement par source et par reprise, quelle
  // que soit la durée de la pause. volumeFactor unique (préférence
  // utilisateur "Volume des balises") pour les deux rôles : beacon et vocal
  // relèvent tous deux de la même catégorie "présence d'entité" côté
  // utilisateur, distincte du pas (footstepVolume) — seul le gain PROPRE à
  // chaque source (beaconGain/vocalGain) les différencie individuellement.
  function updateIntermittentSources(x, liveById) {
    const now = performance.now();
    const volumeFactor = beaconVolumeFactor();
    for (const entry of entitySounds) {
      for (const src of entry.intermittentSources) {
        if (now < src.nextAt) continue;

        playPositionedOneShot(src.path, {
          relX: liveById.get(entry.entity.id).x - x,
          interactRange: entry.interactRange,
          audibleRange: entry.audibleRange,
          panSaturation: entry.panSaturation,
          reverbSend: src.reverbSend,
          volumeFactor,
          gain: src.gain,
          pitchVariation: src.pitchVariation,
        });
        src.nextAt = now + jitteredIntervalMs(src.interval, src.intervalVariation);
      }
    }
  }

  // Son de déplacement des entités mobiles (rôle "movement", voir
  // entities/model.md) — dormant pour toute entité sans ce rôle
  // (movementPath absent, voir entitySounds). Même principe de cadence par
  // DISTANCE que le joueur (lastMovementX/movementStepDistance), mais SANS
  // le "premier pas immédiat" du joueur (voir update()) : une entité
  // "wander" n'a pas de transition immobile -> mouvement pilotée par une
  // touche, elle erre en continu tant qu'elle a un behavior — rien à
  // détecter en plus de l'accumulateur de distance lui-même. Fichier résolu
  // à CHAQUE pas via resolveFootstepPath (surface AU POINT DE L'ENTITÉ, pas
  // celle du joueur) — movementPath sert de repli "son propre" (voir
  // entities/model.md), plus le chemin fixe d'avant l'introduction des
  // surfaces.
  //
  // Changement de sol -> pas IMMÉDIAT (lastMovementSurface, voir
  // entitySounds), en plus de la cadence par distance : sans lui, la
  // transition sonore pouvait accuser jusqu'à movementStepDistance de retard
  // sur la frontière RÉELLE, dans les deux sens de marche (l'accumulateur ne
  // regarde qu'une distance absolue depuis le dernier pas, jamais si le sol
  // a changé entre-temps) — symétrique au correctif du joueur, voir update().
  // Protégé par movementCooldown (voir entitySounds) : sans lui, un léger
  // flottement de position près d'une frontière pouvait redéclencher CHAQUE
  // tick, sans aucune limite (contrairement au joueur, déjà protégé par
  // footstepCooldown/playPacedSound).
  function updateEntityMovementSounds(x, world, liveById) {
    const volumeFactor = footstepVolumeFactor();

    // Renvoie si le son a réellement joué (voir playPacedSound, même
    // principe) — l'appelant en a besoin pour savoir si le déclenchement
    // immédiat peut se marquer "traité" (sinon on force une nouvelle
    // tentative au tick suivant, jamais une transition perdue en silence).
    function playEntityFootstep(entry, atX) {
      const now = performance.now();
      if (now - entry.movementCooldown.lastAt < MIN_STEP_INTERVAL_MS) return false;
      const path = resolveFootstepPath(world, atX, {
        gait: entry.gait,
        naturalWalk: entry.naturalWalk,
        ownPath: entry.movementPath,
      });
      playPositionedOneShot(path, {
        relX: atX - x,
        interactRange: entry.interactRange,
        audibleRange: entry.audibleRange,
        panSaturation: entry.panSaturation,
        reverbSend: entry.movementReverbSend,
        volumeFactor,
        gain: entry.movementGain,
        pitchVariation: entry.movementPitchVariation,
      });
      entry.movementCooldown.lastAt = now;
      return true;
    }

    for (const entry of entitySounds) {
      if (!entry.movementPath) continue;

      const liveX = liveById.get(entry.entity.id).x;

      const currentSurface = surfaceAt(world, liveX);
      if (currentSurface !== entry.lastMovementSurface) {
        if (playEntityFootstep(entry, liveX)) {
          entry.lastMovementX = liveX;
          entry.lastMovementSurface = currentSurface;
        }
      }

      while (Math.abs(liveX - entry.lastMovementX) >= entry.movementStepDistance) {
        playEntityFootstep(entry, liveX);
        entry.lastMovementX += Math.sign(liveX - entry.lastMovementX) * entry.movementStepDistance;
        entry.lastMovementSurface = currentSurface;
      }
    }
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
    return new Map(getActiveWorld(getSession()).entities.map((entity) => [entity.id, entity]));
  }

  // sound absent (pas de beacon continu) : rien à maintenir en continu,
  // ignoré ici — updateIntermittentSources() s'en charge à sa propre cadence.
  function applyEntityAudio(x) {
    const beaconFactor = beaconVolumeFactor();
    const liveById = liveEntitiesById();
    for (const { entity, sound, audibleRange, panSaturation, interactRange, cutoffMin, cutoffMax, beaconGain } of entitySounds) {
      if (!sound) continue;
      const relX = liveById.get(entity.id).x - x;
      const dist = Math.abs(relX);
      // Pan inchangé : toujours dérivé de panSaturation, indépendant du volume.
      const pan = clamp(relX / panSaturation, -1, 1);
      const volume = volumeForDistance(dist, interactRange, audibleRange) * beaconFactor * beaconGain;
      sound.update(pan, volume);
      // Passe-bas : se superpose au volume/pan, ne les remplace pas.
      sound.setCutoff(cutoffForDistance(dist, interactRange, audibleRange, cutoffMin, cutoffMax));
    }
  }

  function update() {
    const session = getSession();
    const x = session.player.x;
    const blockedBy = session.player.blockedBy;
    // Monde actif de CE tick — lu une fois, transmis à tout ce qui doit
    // connaître la carte des surfaces (voir resolveFootstepPath) plutôt que
    // de rappeler getActiveWorld(getSession()) à chaque son de pas.
    const world = getActiveWorld(session);

    applyEntityAudio(x);

    // Une seule photo des entités vivantes pour le reste du tick (occupation
    // + les deux sons ponctuels ci-dessous) : la session ne change pas entre
    // ces appels, inutile de la reconstruire trois fois.
    const liveById = liveEntitiesById();
    updateIntermittentSources(x, liveById);
    updateEntityMovementSounds(x, world, liveById);

    // Occupation par diff : n'agit QUE si l'ensemble a changé depuis le
    // tick précédent. Une nouvelle photo (assertive) coupe la précédente
    // devenue obsolète ; l'ensemble vide ne déclenche aucune annonce, juste
    // un réarmement silencieux pour la prochaine entrée. Pas de `channel`
    // imposé ici : on laisse le canal par défaut du module (liveRegion,
    // ariaNotify expérimental via setAnnounceChannel) décider, pour comparer
    // les deux sur exactement le même déclenchement.
    const occupied = occupiedEntities(entitySounds, liveById, x);
    currentOccupied = occupied;
    const occupiedIdsNow = new Set(occupied.map((entity) => entity.id));
    if (!setsEqual(occupiedIdsNow, occupiedIds)) {
      if (occupiedIdsNow.size > 0) {
        announce(buildOccupancyAnnouncement(occupied), { assertive: true });
      }
      occupiedIds = occupiedIdsNow;
    }

    // Pas centré, sans pan : c'est le joueur lui-même.

    // Transition immobile -> en mouvement, OU changement de sol en cours de
    // marche : pas IMMÉDIAT, sans attendre d'avoir parcouru STEP_DISTANCE au
    // complet. Sans le second cas, la transition sonore pouvait accuser
    // jusqu'à STEP_DISTANCE de retard sur la frontière RÉELLE entre deux
    // surfaces, dans les DEUX sens de marche (l'accumulateur ne mesure
    // qu'une distance absolue depuis le dernier pas, jamais si le sol a
    // changé entre-temps — voir surfaceAt/core/surfaces.js).
    //
    // L'accumulateur ET le sol mémorisé ne repartent de x courant QUE SI le
    // son a réellement joué (voir playFootstep/playPacedSound) — sinon
    // (cooldown trop récent, ex. juste après un pas de cadence normal) on
    // laisse surfaceChanged VRAI : le prochain tick retentera, jusqu'à ce
    // que le cooldown se libère. Sans cette garde, un déclenchement
    // supprimé se marquait quand même "traité", et la traversée pouvait
    // rester silencieuse jusqu'à STEP_DISTANCE de plus.
    const currentSurface = surfaceAt(world, x);
    const surfaceChanged = currentSurface !== lastFootstepSurface;
    const isMoving = x !== previousX;
    if (isMoving && (!wasMoving || surfaceChanged)) {
      if (playFootstep(x, world)) {
        lastFootstepX = x;
        lastFootstepSurface = currentSurface;
      }
    }
    wasMoving = isMoving;
    previousX = x;

    while (Math.abs(x - lastFootstepX) >= STEP_DISTANCE) {
      playFootstep(x, world);
      lastFootstepX += Math.sign(x - lastFootstepX) * STEP_DISTANCE;
      lastFootstepSurface = currentSurface;
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
    // sound absent (pas de beacon continu) : rien à arrêter, ses one-shots
    // se terminent d'eux-mêmes (mêmes Howl partagés que playOneShot ailleurs).
    for (const { sound } of entitySounds) {
      if (sound) sound.stop(); // nettoie aussi son propre envoi de réverb
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
  // sound absent (pas de beacon continu) : rien à mettre en pause — au pire
  // un one-shot déjà lancé continue derrière le menu (aussi court qu'un pas,
  // négligeable), et updateIntermittentSources() ne tourne de toute façon
  // plus tant qu'un menu est au sommet de la pile (voir update()).
  function pauseBeacons() {
    for (const { sound } of entitySounds) {
      if (sound) sound.pause();
    }
  }
  function resumeBeacons() {
    for (const { sound } of entitySounds) {
      if (sound) sound.resume();
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
