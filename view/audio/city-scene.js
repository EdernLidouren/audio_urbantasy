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
  preloadOneShot,
  keepAudioContextAwake,
  createPositionedSound,
  createReverbBus,
  playAmbiences,
  stopGlobal,
  setGlobalVolume,
  preloadMusic,
  startMusicSequence,
  switchMusicSequence,
  fadeOutMusic,
} from "../../lib/audio.js";
import { announce } from "../../lib/announce.js";
import { resolveAsset, hasAsset, assetKeyMembers } from "../../lib/assets.js";
import registry from "../../entities/types/index.js";
import player from "../../entities/player.js";
import { TUNING_DEFAULTS, resolveTuning } from "../../config/tuning.js";
import { getPref, PREF_CONSTRAINTS } from "../../config/preferences.js";
import { t } from "../../i18n/index.js";
import { MOVE_STEP, getActiveWorld } from "../../core/state.js";
import { surfaceAt, surfaceProps } from "../../core/surfaces.js";
import { phaseAt } from "../../core/time.js";
import { isPresent } from "../../core/presence.js";
import { gaitOf } from "../../core/equipment.js";
import { ITEM_REGISTRY } from "../../core/items.js";

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

// Musique du lieu POUR UNE PHASE (voir core/time.js/phaseAt) : musicDay/
// musicNight si le lieu les déclare, sinon repli sur `music` (champ
// unique, rétrocompatible — voir core/level.js) pour la phase manquante.
// Un lieu sans AUCUN des trois champs n'a simplement pas de musique, aux
// deux phases (renvoie undefined, comme `world.music` absent aujourd'hui).
function resolveMusicForPhase(world, phase) {
  if (phase === "day" && world.musicDay) return world.musicDay;
  if (phase === "night" && world.musicNight) return world.musicNight;
  return world.music;
}

// Fonction de TIRAGE transmise à startMusicSequence/switchMusicSequence
// (lib/audio.js) : resolveAsset EST déjà le tirage "sans répétition
// immédiate" (voir lib/assets.js/pickFromPool, mécanisme générique de tout
// pool) — appelée FRAÎCHEMENT à chaque morceau de la séquence (jamais
// mémorisée ici), pour qu'un enchaînement retire vraiment un membre
// différent du précédent quand le pool en compte plusieurs. `phase` figée
// au moment de la CRÉATION de cette fonction (paramètre, jamais la variable
// mutable currentPhase) : une bascule ultérieure appelle pickMusicPath à
// nouveau avec la NOUVELLE phase, jamais en relisant un état partagé.
function pickMusicPath(world, phase) {
  return () => resolveAsset(resolveMusicForPhase(world, phase));
}

// STEP_DISTANCE ne concerne aucune entité (c'est le pas du joueur) : défaut
// global lu directement. AUDIBLE_RANGE, PAN_SATURATION, INTERACT_RANGE et
// REVERB_SEND (des entités) concernent chaque entité individuellement :
// résolus via resolveTuning (cascade son -> instance -> type -> défaut
// global), voir plus bas.
const STEP_DISTANCE = TUNING_DEFAULTS.stepDistance;
// Tous les gaits que LE JOUEUR peut porter — "barefoot" (défaut, rien
// équipé, voir core/equipment.js/gaitOf) PLUS chaque gait déclaré par un
// objet equippable au slot "feet" (core/items.js/ITEM_REGISTRY). Dérivé du
// registre, jamais une liste dupliquée à la main : un futur objet
// equippable ajouté au registre met ce préchargement à jour tout seul.
// Nécessaire pour le PRÉCHARGEMENT (voir plus bas) : l'équipement peut
// changer PENDANT une visite (équiper/déséquiper, voir
// view/menus/inventory-menu.js), donc TOUS ces gaits doivent déjà être
// amorcés au montage, pas seulement celui actif à l'instant du montage.
const PLAYER_GAIT_POOL = [
  "barefoot",
  ...new Set(Object.values(ITEM_REGISTRY).filter((props) => props.slot === "feet").map((props) => props.gait)),
];
// Anti-mitraillette pour le son de COLLISION UNIQUEMENT (voir
// playCollisionSound plus bas) — le pas, lui, n'utilise plus aucun
// cooldown : son débit est borné par STEP_DISTANCE (voir stepWalker), un
// mécanisme purement géométrique, jamais temporel.
const MIN_STEP_INTERVAL_MS = TUNING_DEFAULTS.minStepIntervalMs;
// Durée du fondu de sortie UNIVERSEL de la musique (voir
// lib/audio.js/fadeOutMusic) — bascule de phase ET transition de lieu,
// jamais utilisée à l'entrée dans une scène (musique de la phase courante
// jouée directement, sans fondu).
const MUSIC_FADE_MS = TUNING_DEFAULTS.musicFadeMs;
// Fourchette de la pause ("respiration") entre deux morceaux — enchaînement
// naturel ET bascule de phase (même mécanisme, voir lib/audio.js). Sans
// effet en mode musicLoop (boucle continue).
const MUSIC_BREATHER_RANGE = { min: TUNING_DEFAULTS.musicBreatherMinMs, max: TUNING_DEFAULTS.musicBreatherMaxMs };
// Niveaux du modèle de volume par zones (voir volumeForDistance) : ce sont
// des constantes de forme de courbe, pas des réglages par entité.
const FULL_VOLUME = TUNING_DEFAULTS.fullVolume;
const FAR_VOLUME_MAX = TUNING_DEFAULTS.farVolumeMax;
// Fourchette du délai de démarrage aléatoire des balises (désempilement
// d'attaques, voir buildEntitySoundEntry plus bas) — partagée, jamais
// résolue par entité.
const BEACON_STAGGER_MIN_MS = TUNING_DEFAULTS.beaconStaggerMinMs;
const BEACON_STAGGER_MAX_MS = TUNING_DEFAULTS.beaconStaggerMaxMs;

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

// TOUTES les clés que resolveFootstepPath pourrait un jour choisir pour ce
// mobile (gait/naturalWalk/ownPath), quel que soit le sol — pour le
// PRÉCHARGEMENT de scène (voir preloadSceneSounds), qui doit amorcer le
// décodage de chaque candidat AVANT que la marche ne commence, jamais pour
// la résolution elle-même (qui reste au tick, selon le sol courant).
function footstepCandidateKeys({ gait, naturalWalk, ownPath } = {}) {
  const keys = [];
  if (gait) keys.push(footstepKey(gait));
  if (naturalWalk) keys.push(footstepKey(naturalWalk));
  if (ownPath) keys.push(ownPath);
  return keys;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// État minimal d'UN "marcheur" (le joueur ou une entité mobile) pour
// stepWalker ci-dessous — voir sa doc pour le rôle de chaque champ. Un
// walker par mobile : voir playerWalker (joueur) et entry.walker (par
// entité, dans buildEntitySoundEntry).
function createWalkerState(x) {
  return { lastStepX: x, wasMoving: false, previousX: x };
}

// Déclenchement UNIFIÉ du son de pas — MÉCANISME UNIQUE, partagé par le
// joueur et toute entité mobile (voir update()/updateEntityMovementSounds,
// les deux seuls appelants). Remplace l'ancien système à deux voies (pas
// immédiat de reprise + pas immédiat de frontière de surface + cadence,
// trois cooldowns différents) par un seul principe : le débit de pas est
// borné PAR LA DISTANCE, jamais par un minuteur — plus aucun cooldown ici.
//
// `walker` (voir createWalkerState) est MUTÉ EN PLACE :
//   - lastStepX : position du DERNIER PAS JOUÉ (jalon de distance).
//   - wasMoving : le marcheur bougeait-il au TICK PRÉCÉDENT.
//   - previousX : position du marcheur au TICK PRÉCÉDENT — SEULE façon
//     fiable de distinguer "immobile" de "en cours de marche entre deux
//     jalons" : lastStepX n'avance QUE par pas de stepDistance, donc
//     `x !== lastStepX` reste vrai la plupart du temps même à l'arrêt (dès
//     que la position de repos ne tombe pas PILE sur un multiple de
//     stepDistance depuis le dernier pas) — sans previousX, un marcheur
//     resterait perçu "en mouvement" pour toujours après son tout premier
//     pas, et taper-relâcher-retaper la touche perdrait le pas de départ
//     après la toute première fois. Simple comparaison de position, aucune
//     notion de temps ni de direction : symétrique par construction.
//
// `playStepAt(atX)` : callback fourni par l'appelant, invoqué UNE FOIS PAR
// PAS à jouer, à la position EXACTE de ce pas (le jalon franchi, jamais la
// position finale du tick — voir la boucle plus bas : un grand déplacement
// qui franchit plusieurs jalons en un seul tick joue donc CHAQUE pas à SA
// propre position, chacun résolvant sa propre surface). Ce module ne
// connaît que LE MOMENT où jouer, jamais COMMENT (centré pour le joueur,
// positionné avec pan/gain pour une entité — à la charge de l'appelant).
//
// DÉMARRAGE (immobile -> en mouvement) : un SEUL pas immédiat à x, pour ne
// jamais "voler" le premier pas d'un tapotement bref — le SEUL cas
// spécial. Un changement de SURFACE, lui, NE déclenche RIEN en soi : c'est
// le PROCHAIN jalon normal qui la fera entendre, à sa position
// (resolveFootstepPath relit déjà la surface à CETTE position à chaque
// appel, inchangé) — plus de détection dédiée, plus de cooldown de
// frontière : le système est donc SYMÉTRIQUE par construction, avancer
// puis reculer sur la même frontière rejoue le même jalon dans les deux
// sens.
function stepWalker(walker, x, stepDistance, playStepAt) {
  const isMoving = x !== walker.previousX;

  if (isMoving) {
    if (!walker.wasMoving) {
      playStepAt(x);
      walker.lastStepX = x;
    } else {
      while (Math.abs(x - walker.lastStepX) >= stepDistance) {
        walker.lastStepX += Math.sign(x - walker.lastStepX) * stepDistance;
        playStepAt(walker.lastStepX);
      }
    }
  }

  walker.wasMoving = isMoving;
  walker.previousX = x;
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

// Délai de démarrage ALÉATOIRE (voir BEACON_STAGGER_MIN_MS/MAX_MS,
// lib/audio.js/createPositionedSound startDelayMs) — désempile l'attaque
// d'une balise CONTINUE nouvellement créée par rapport aux autres démarrées
// dans la même fenêtre (montage de scène ou apparition tardive groupée,
// voir buildEntitySoundEntry, seul appelant). Aléa de RENDU, Math.random()
// comme randomRate/jitteredIntervalMs ci-dessus — jamais le PRNG seedé du
// core, aucun effet sur l'état de partie (voir "Déterminisme et rendu
// audio", entities/model.md).
function drawBeaconStaggerDelayMs() {
  return BEACON_STAGGER_MIN_MS + Math.random() * (BEACON_STAGGER_MAX_MS - BEACON_STAGGER_MIN_MS);
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

// enterSound/exitSound (voir core/presence.js, entities/model.md) : rôles
// sonores PONCTUELS et POSITIONNÉS, déclenchés par une bascule de présence
// OBSERVÉE (core/reduce.js/stepEntities), jamais par une cadence/intervalle
// — contrairement à resolveIntermittentSource ci-dessus, pas de nextAt à
// replanifier. Chemin/gain/pitchVariation/reverbSend résolus UNE FOIS ici
// (cascade son -> instance -> archétype -> défaut global), comme les
// autres rôles. descriptor absent -> null (rôle optionnel, indépendant de
// l'autre — une entité peut n'avoir que l'un des deux, voir neon.js).
const ENTER_SOUND_TUNING_KEYS = { gain: "enterSoundGain" };
const EXIT_SOUND_TUNING_KEYS = { gain: "exitSoundGain" };
function resolveTransitionSound(entity, descriptor, keys) {
  if (!descriptor) return null;
  return {
    path: descriptor.path,
    gain: resolveTuning(keys.gain, entity, descriptor),
    pitchVariation: resolveTuning("pitchVariation", entity, descriptor),
    reverbSend: resolveTuning("reverbSend", entity, descriptor),
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
    .filter(({ entity, interactRange }) => {
      const live = liveById.get(entity.id);
      // Dormante (voir core/presence.js) : jamais occupée, jamais
      // interactive — "comme si absente" (troisième plan coupé par le
      // drapeau, voir le header du fichier).
      if (live.present === false) return false;
      return Math.abs(live.x - x) <= interactRange;
    })
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
// Construit l'entrée entitySounds d'UNE entité (config statique résolue une
// fois : sons, portées, cascade de réglages, voix continue le cas échéant)
// — EXTRAIT du montage de scène pour être réutilisé tel quel par
// syncNewEntitySounds ci-dessous (voir createCityAudioScene), qui l'appelle
// pour toute entité apparue APRÈS le montage (ex. entité ÉPHÉMÈRE, voir
// core/state.js/spawnEphemeral, entities/model.md/"Entités éphémères") —
// UNE SEULE construction, deux appelants (montage initial, apparition
// tardive), jamais deux implémentations à maintenir en parallèle. `world`
// sert UNIQUEMENT à résoudre le sol au spawn (surfaceAt) — pour une entité
// tardive, c'est le monde du TICK courant, jamais un monde figé au
// montage : son sol de départ doit refléter sa position RÉELLE au moment
// où elle apparaît, pas celle d'une autre entité ni un instant passé.
function buildEntitySoundEntry(entity, world, time) {
  // beacon (localisation) et vocal (expression) : descripteurs de son du
  // type, tous deux OPTIONNELS et indépendants (voir entities/model.md) —
  // ni l'un ni l'autre n'est "le" son obligatoire d'une entité.
  const sounds = registry[entity.type].sounds;
  const beacon = sounds.beacon;
  const vocal = sounds.vocal;
  // enterSound/exitSound (voir core/presence.js) : rôles PONCTUELS
  // distincts du beacon, optionnels et indépendants l'un de l'autre —
  // résolus une fois ci-dessous (resolveTransitionSound), null si absent.
  const enterSound = resolveTransitionSound(entity, sounds.enterSound, ENTER_SOUND_TUNING_KEYS);
  const exitSound = resolveTransitionSound(entity, sounds.exitSound, EXIT_SOUND_TUNING_KEYS);

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
        // État de déclenchement DÉDIÉ à cette entité (voir stepWalker,
        // updateEntityMovementSounds) — même mécanisme, même forme, que
        // playerWalker pour le joueur : un walker par mobile, jamais
        // partagé.
        walker: createWalkerState(entity.x),
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

  // muteOnConsumed (voir entities/model.md/"Collectible persistant",
  // entities/types/crate.js) : registre SEULEMENT, jamais cascadé par
  // instance (comme `sounds`, contrairement à consumedDescriptionKey qui,
  // lui, est baké par core/level.js) — effet POST-ACTIVATION "beacon
  // absent" d'un collectible looté (core/money.js/lootEntity), résolu ici
  // pour être lu par muteConsumedBeacons ci-dessous, à chaque tick.
  const muteOnConsumed = Boolean(registry[entity.type].muteOnConsumed);

  // sound (voix positionnée CONTINUE, un Howl persistant) UNIQUEMENT si
  // le beacon existe ET qu'il est en mode "continu" (défaut) — sinon
  // (intermittent, ou pas de beacon du tout), rien de permanent à
  // maintenir ici : intermittentSources ci-dessous s'en charge en
  // one-shot, à sa propre cadence (voir updateIntermittentSources).
  // beaconGain/beaconReverbSend ne sont résolus que dans ce cas : seuls
  // applyEntityAudio (volume/tick) et le branchement au bus de réverb
  // (au montage, ou dans addLateEntitySoundEntry) en ont besoin.
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
      // staggerBeacon (défaut true, voir config/tuning-values.js) :
      // OPT-OUT du désempilement d'attaques — appliqué INDISTINCTEMENT à
      // TOUTE balise continue nouvellement créée ici (montage de scène OU
      // apparition tardive groupée, voir syncNewEntitySounds), jamais
      // seulement si "plusieurs à la fois" sont détectées (voir
      // entities/model.md) : un délai isolé de quelques dizaines de ms est
      // imperceptible.
      const staggerBeacon = resolveTuning("staggerBeacon", entity, beacon);
      // pitchVariation, s'il y en a une, tirée UNE FOIS ici (voir la note
      // du header sur les balises continues). cacheKey: entity.id — stable
      // d'une visite à l'autre (voir lib/audio.js/createPositionedSound) :
      // une balise déjà entendue une fois ne se redécode pas à chaque
      // aller-retour, cohérent avec les mondes gardés en mémoire.
      sound = createPositionedSound(resolveAsset(beacon.path), {
        rate: randomRate(beaconPitchVariation),
        cacheKey: entity.id,
        startDelayMs: staggerBeacon ? drawBeaconStaggerDelayMs() : 0,
      });
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

  // Présence conditionnelle (voir core/presence.js) : résolue ICI, au
  // montage (ou à l'apparition tardive) — recalculée directement via
  // isPresent (pas relue sur entity.present, pas garanti à jour à cet
  // instant précis, voir core/reduce.js/stepEntities) à partir du MÊME
  // `time`. Une balise CONTINUE créée dormante est immédiatement stoppée :
  // le Howl existe déjà (décodage amorcé, prêt pour une bascule future)
  // mais ne joue jamais tant que l'entité reste dormante. AUCUN son de
  // transition ici (enterSound/exitSound) : cet état de départ n'est PAS
  // une bascule (voir core/reduce.js/stepEntities, presenceChanged reste
  // null au premier calcul) — seules les bascules OBSERVÉES en cours de
  // jeu déclenchent, voir applyEntityAudio, qui lit presenceChanged sur
  // l'entité VIVANTE à chaque tick (jamais un diff maison ici).
  if (sound && !isPresent(entity, { time })) sound.stop();

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
    enterSound,
    exitSound,
    muteOnConsumed,
    ...movementFields,
  };
}

export function createCityAudioScene(getSession) {
  // Contexte maintenu éveillé pour toute la scène (voir
  // lib/audio.js/keepAudioContextAwake) — au tout début du montage, avant
  // même la première voix créée plus bas.
  keepAudioContextAwake();

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
  // pour construire entitySounds (voir plus bas) — le monde du TICK
  // courant, lui, reste relu à chaque update() (voir plus bas), jamais
  // celui-ci qui ne vaut que pour
  // l'amorçage.
  const initialWorld = getActiveWorld(getSession());
  const entitySounds = initialWorld.entities.map((entity) =>
    buildEntitySoundEntry(entity, initialWorld, getSession().time)
  );

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

  // Ajoute une entrée entitySounds pour une entité apparue EN COURS DE
  // SCÈNE, après le montage — même construction que le montage initial
  // (buildEntitySoundEntry), juste appelée plus tard. Branchement au bus de
  // réverb ET entrée dans collisionSoundByEntityId inclus (mêmes gestes que
  // les blocs ci-dessus, pour qu'une entité tardive soit traitée EXACTEMENT
  // comme une entité déclarée). PAS de préchargement pour elle (voir
  // warmUpFootstep/preloadKeys plus bas, qui ne balaient QUE les entités
  // connues au montage) : acceptable pour du contenu créé en jeu (ex.
  // entité ÉPHÉMÈRE, voir core/state.js/spawnEphemeral) — au pire un tout
  // premier son légèrement en retard le temps du décodage à froid, jamais
  // un son perdu ni un plantage. Voir syncNewEntitySounds ci-dessous, seule
  // appelante.
  function addLateEntitySoundEntry(entity, world) {
    const entry = buildEntitySoundEntry(entity, world, getSession().time);
    entitySounds.push(entry);
    if (entry.sound) entry.sound.sendToReverb(reverbBus.input, entry.beaconReverbSend);
    collisionSoundByEntityId.set(entity.id, registry[entity.type].collisionSound);
    return entry;
  }

  // Synchronise entitySounds avec world.entities : toute entité apparue EN
  // COURS DE SCÈNE (ex. entité ÉPHÉMÈRE) et pas encore connue d'entitySounds
  // reçoit sa propre entrée ICI — appelée une fois par tick, tôt dans
  // update(), avant tout calcul positionné (même emplacement que
  // cleanupRemovedEntities/muteConsumedBeacons). Sans elle, une entité créée
  // après le montage resterait invisible au rendu ET à l'interaction :
  // occupiedEntities/getInteractionCandidates ne lisent QUE entitySounds,
  // jamais world.entities directement. N'AJOUTE jamais rien de plus qu'une
  // entrée manquante (jamais de retrait — cleanupRemovedEntities s'en
  // charge séparément) : entitySounds ne fait donc que CROÎTRE pour la
  // durée de vie d'une scène, jamais rétrécir, ce qui garantit qu'un id
  // déjà connu le reste pour toujours (removedEntityIds/mutedOnConsumedIds
  // ci-dessus en dépendent).
  function syncNewEntitySounds(world) {
    const knownIds = new Set(entitySounds.map(({ entity }) => entity.id));
    for (const entity of world.entities) {
      if (!knownIds.has(entity.id)) addLateEntitySoundEntry(entity, world);
    }
  }

  // "Réchauffe" les pas critiques EN PREMIER, avant le grand préchargement
  // de pool ci-dessous : un vrai playOneShot à volume 0, pendant que le
  // joueur est encore immobile — force l'allocation complète de la voix
  // (pas seulement le décodage), pour que le tout premier pas RÉEL soit
  // instantané, sans artefact audible (volume 0, jamais entendu). Un seul
  // candidat par mobile (celui que resolveFootstepPath choisirait
  // MAINTENANT, à sa position de spawn) : suffisant pour amorcer le
  // pipeline audio lui-même (contexte, noeuds Web Audio...), commun à tout
  // fichier du même format.
  //
  // ORDRE délibéré (diagnostiqué en direct, chronométré) : le navigateur
  // plafonne à ~6 requêtes concurrentes par origine (HTTP/1.1) — avec
  // plusieurs dizaines de fichiers à précharger d'un coup (voir
  // preloadKeys ci-dessous), tout ce qui n'est pas parmi les tout premiers
  // émis attend son tour par vagues. Émettre CE fichier précis ICI, avant
  // le balayage complet des pools, lui garantit une des toutes premières
  // requêtes plutôt que de le laisser en position aléatoire dans une file
  // de ~50 — ensureOneShot (lib/audio.js) déduplique par chemin, donc le
  // balayage complet plus bas retrouvera un Howl déjà chargé pour ce
  // membre précis, jamais une deuxième requête.
  function warmUpFootstep(atX, candidates) {
    // resolveAsset ici, comme playPacedSound (jamais la clé de pool brute
    // telle que resolveFootstepPath la renvoie — voir hasAsset/assetKeyMembers
    // ci-dessus, qui manipulent la clé, pas playOneShot, qui attend un
    // fichier réel).
    playOneShot(resolveAsset(resolveFootstepPath(initialWorld, atX, candidates)), { volume: 0 });
  }
  warmUpFootstep(getSession().player.x, {
    gait: gaitOf(getSession().equipment),
    naturalWalk: player.naturalWalk,
    ownPath: MOVEMENT_SOUND.path,
  });
  for (const { entity, movementPath, gait, naturalWalk } of entitySounds) {
    if (!movementPath) continue;
    warmUpFootstep(entity.x, { gait, naturalWalk, ownPath: movementPath });
  }

  // Préchargement de scène (voir lib/audio.js/preloadOneShot,
  // lib/assets.js/assetKeyMembers) : amorce le décodage de TOUT ce que
  // cette scène pourrait jouer, AVANT que le gameplay ne commence. Un Howl
  // fraîchement créé décode déjà en tâche de fond (Howler, preload:true par
  // défaut) — mais une lecture demandée AVANT la fin du décodage est mise
  // en ATTENTE par Howler jusqu'à la fin du chargement : audible comme un
  // pas "en retard"/qui saute, jamais un son perdu (diagnostiqué en
  // direct : Howl.state() vaut "loading" au moment du tout premier pas,
  // joueur ET compagnon). Avec un pool de plusieurs dizaines de membres
  // (ex. shoes_walk), CHAQUE membre encore jamais tiré est individuellement
  // "à froid" à son premier tirage — précharger TOUT le pool, pas
  // seulement celui que resolveFootstepPath choisirait maintenant, sinon le
  // symptôme peut se reproduire à tout moment de la marche (confirmé en
  // direct : un membre jamais joué restait "loading" même après de longues
  // secondes de jeu). Asynchrone et non bloquant par construction — juste
  // la création des Howl ici, jamais d'attente — le premier rendu de la
  // scène n'est donc jamais retardé, même avec beaucoup de fichiers.
  const preloadKeys = new Set();
  for (const { intermittentSources, movementPath, gait, naturalWalk, entity, enterSound, exitSound } of entitySounds) {
    for (const src of intermittentSources) preloadKeys.add(src.path);
    for (const key of footstepCandidateKeys({ gait, naturalWalk, ownPath: movementPath })) preloadKeys.add(key);
    const collisionSound = collisionSoundByEntityId.get(entity.id);
    if (collisionSound) preloadKeys.add(collisionSound);
    // enterSound/exitSound (voir core/presence.js) : préchargés comme tout
    // le reste — une bascule peut survenir dès le premier tick joué (une
    // entité déjà présente au montage peut redevenir dormante quelques
    // secondes plus tard), aucune raison d'attendre un premier déclenchement
    // à froid.
    if (enterSound) preloadKeys.add(enterSound.path);
    if (exitSound) preloadKeys.add(exitSound.path);
  }
  // Tous les gaits POSSIBLES du joueur (PLAYER_GAIT_POOL), pas seulement
  // celui actif au montage — voir son commentaire : équiper/déséquiper en
  // cours de visite ne doit jamais tomber sur un pool encore jamais amorcé.
  for (const gait of PLAYER_GAIT_POOL) {
    for (const key of footstepCandidateKeys({ gait, naturalWalk: player.naturalWalk, ownPath: MOVEMENT_SOUND.path })) {
      preloadKeys.add(key);
    }
  }
  preloadKeys.add(FOOTSTEP_FLOOR_PATH);
  // defaultSurface est la couche de BASE (voir core/surfaces.js/surfaceAt) :
  // aussi jouable que n'importe quel segment, souvent PLUS (c'est la surface
  // par défaut de toute la scène) — oubliée ici, son pool entier restait
  // jamais préchargé (diagnostiqué en direct : dirt_walk en defaultSurface,
  // chaque pas piochait un membre à froid, plusieurs requêtes concurrentes
  // non préchargées ont fini par saturer dev-server.py, mono-thread).
  preloadKeys.add(footstepKey(initialWorld.defaultSurface));
  for (const segment of initialWorld.segments) preloadKeys.add(footstepKey(segment.surface));

  for (const key of preloadKeys) {
    for (const member of assetKeyMembers(key)) preloadOneShot(member);
  }

  // Musique : précharge TOUS les membres des pools jour ET nuit (pas
  // seulement la phase courante, voir lib/audio.js/preloadMusic) — une
  // bascule de phase ne doit jamais tomber sur un membre jamais amorcé.
  // resolveMusicForPhase retombe déjà sur `music` pour la phase manquante :
  // les deux appels ci-dessous couvrent aussi le cas rétrocompatible (un
  // seul champ `music`, sans musicDay/musicNight — pool à un élément si un
  // membre précis, voir lib/assets.js/assetKeyMembers).
  for (const phase of ["day", "night"]) {
    const musicKey = resolveMusicForPhase(world, phase);
    if (musicKey) {
      for (const member of assetKeyMembers(musicKey)) preloadMusic(member);
    }
  }

  // Musique et ambiances du lieu : canaux GLOBAUX non spatialisés (aucun
  // pan/filtre/réverb, voir lib/audio.js), propriété du niveau, pas d'une
  // entité — optionnels, un niveau sans champ music/ambiences ne joue
  // simplement rien sur le canal correspondant. Ambiances : jusqu'à deux
  // couches simultanées, un seul curseur de volume pour les deux.
  //
  // Musique PAR PHASE (voir core/time.js/phaseAt, resolveMusicForPhase) :
  // à l'ENTRÉE dans une scène, on joue directement la musique de la phase
  // COURANTE — jamais de fondu depuis le silence (comportement historique).
  // ENCHAÎNEMENT AVEC RESPIRATION par défaut (voir lib/audio.js/
  // startMusicSequence) : un morceau joue une fois (loop:false), se termine,
  // une pause aléatoire (MUSIC_BREATHER_RANGE), puis un nouveau morceau du
  // pool démarre — sans répétition immédiate si le pool en compte plusieurs
  // (resolveAsset). `musicLoop` (voir level/schema.md) bascule EN BOUCLE
  // CONTINUE à la place (ex. magasin/ambiance tendue) : figé pour tout le
  // lieu, ne varie jamais avec la phase. currentPhase mémorise la phase pour
  // update() ci-dessous, seul endroit qui la refait varier (sur bascule,
  // avec fondu + respiration, voir switchMusicSequence).
  let currentPhase = phaseAt(getSession().time);
  const musicLoop = Boolean(world.musicLoop);
  if (resolveMusicForPhase(world, currentPhase)) {
    setGlobalVolume("music", musicVolumeFactor());
    startMusicSequence({
      pickPath: pickMusicPath(world, currentPhase),
      loop: musicLoop,
      breatherRange: MUSIC_BREATHER_RANGE,
    });
  }

  const ambiences = world.ambiences;
  if (ambiences && ambiences.length > 0) {
    playAmbiences(ambiences.map(resolveAsset));
    setGlobalVolume("ambience", ambienceVolumeFactor());
  }

  // État de déclenchement du pas du joueur — voir stepWalker. Même forme,
  // même mécanisme, que entry.walker pour chaque entité mobile.
  const playerWalker = createWalkerState(getSession().player.x);
  // Instant (performance.now()) du dernier son de COLLISION joué — voir
  // playCollisionSound plus bas. Canal séparé du pas (qui n'a plus aucun
  // cooldown) : sur le tick où le joueur vient buter, x avance encore
  // jusqu'au bord (pas normal) PUIS blockedBy s'active (son de collision)
  // dans le MÊME tick — un cooldown commun ferait que le pas consomme le
  // cooldown et fasse taire le son de collision immédiat qui suit aussitôt.
  const collisionCooldown = { lastAt: -Infinity };
  // Ids des entités occupées (zone d'interaction englobant le joueur) au
  // tick précédent — seule source de vérité pour détecter un changement.
  let occupiedIds = new Set();
  // Entités occupées au tick courant, déjà triées par x (voir
  // occupiedEntities) — exposé via getInteractionCandidates() pour que
  // l'écran ville résolve une cible d'interaction (Espace/Entrée) sans
  // recalculer l'occupation en double.
  let currentOccupied = [];
  // Ids d'entités DÉJÀ nettoyées (son arrêté, voir cleanupRemovedEntities
  // plus bas) après leur disparition de world.entities (ex. ramassées,
  // voir core/money.js/pickupEntity) — jamais réinitialisé pendant la vie
  // de cette scène (recréée franche à chaque transition). Garantit un seul
  // sound.stop() par entité, jamais répété à chaque tick.
  const removedEntityIds = new Set();
  // Ids d'entités dont le beacon a déjà été explicitement arrêté suite à
  // leur passage à consumed (voir entities/model.md/"Collectible
  // persistant", muteConsumedBeacons plus bas) — même principe que
  // removedEntityIds : un seul sound.stop() par entité, jamais répété.
  // DISTINCT de removedEntityIds : une entité consumed reste dans
  // world.entities (jamais retirée, voir core/state.js/markConsumed) — seule
  // sa VOIX change d'état, pas sa présence dans le monde.
  const mutedOnConsumedIds = new Set();
  // Distance que le joueur AURAIT parcourue depuis le début du blocage
  // courant (voir le bloc collision dans update()) — jamais la distance
  // réellement parcourue, puisque x ne bouge pas pendant une butée.
  let collisionAccumX = 0;
  // Seule source de vérité pour "était bloqué au tick précédent" — même
  // rôle que playerWalker.wasMoving pour les pas, pour détecter la
  // transition et jouer un premier son immédiat (voir update()).
  let wasBlocked = false;

  // Point de passage pour le son de COLLISION (butée contre une entité
  // bloquante, centré sur le joueur, sans pan particulier) — SEUL appelant
  // restant, voir playCollisionSound : le pas n'utilise plus aucun
  // cooldown (voir stepWalker/playFootstep). Trop tôt -> le son est
  // simplement sauté, pas de file d'attente.
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

  // Joue le son de pas du joueur à LA POSITION donnée (le pas de démarrage,
  // ou un jalon franchi — voir stepWalker) — chemin résolu à CHAQUE appel
  // (voir resolveFootstepPath), jamais figé au MOVEMENT_SOUND.path
  // d'origine, qui ne sert que de repli "son propre" si gait/naturalWalk ne
  // résolvent rien. gait relu FRAÎCHEMENT depuis l'équipement COURANT à
  // CHAQUE pas (gaitOf, core/equipment.js) — jamais mis en cache : c'est ce
  // qui fait qu'équiper/déséquiper change le pas SUIVANT automatiquement,
  // sans notification. AUCUN cooldown : le débit est déjà borné par
  // stepDistance côté stepWalker, jamais par un deuxième garde-fou temporel
  // ici.
  function playFootstep(atX, world) {
    const gait = gaitOf(getSession().equipment);
    const path = resolveFootstepPath(world, atX, { gait, naturalWalk: player.naturalWalk, ownPath: MOVEMENT_SOUND.path });
    playOneShot(resolveAsset(path), { reverbSend: FOOTSTEP_REVERB_SEND, reverbBusInput: reverbBus.input, volume: footstepVolumeFactor() });
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

  // Son de TRANSITION (enterSound/exitSound, voir core/presence.js,
  // resolveTransitionSound) : ponctuel et positionné, comme
  // playPositionedOneShot ci-dessus dont il n'est qu'un appel nommé — même
  // catégorie de volume que la balise (préférence "Volume des balises",
  // ces sons accompagnent la présence d'une entité comme le beacon
  // lui-même). Jamais soumis à la pause sélective des balises (sound.pause/
  // resume ne concerne QUE la voix continue, voir lib/audio.js) : un
  // one-shot Howler joue jusqu'au bout quoi qu'il arrive ensuite au beacon.
  function playTransitionSound(entry, relX, transitionSound) {
    playPositionedOneShot(transitionSound.path, {
      relX,
      interactRange: entry.interactRange,
      audibleRange: entry.audibleRange,
      panSaturation: entry.panSaturation,
      reverbSend: transitionSound.reverbSend,
      volumeFactor: beaconVolumeFactor(),
      gain: transitionSound.gain,
      pitchVariation: transitionSound.pitchVariation,
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
      // Dormante (voir core/presence.js) : aucun déclenchement, ET aucune
      // replanification — src.nextAt reste tel quel, gelé jusqu'au retour
      // en présence (voir le header du fichier, "comme si absente").
      if (liveById.get(entry.entity.id).present === false) continue;
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
  // (movementPath absent, voir entitySounds). MÊME mécanisme UNIFIÉ que le
  // pas du joueur (voir stepWalker) : chaque entité porte son propre
  // entry.walker, déclenché exactement pareil — un pas de démarrage à la
  // reprise du mouvement, puis un pas par jalon de movementStepDistance
  // franchi, chacun résolvant sa propre surface via resolveFootstepPath (au
  // point DE L'ENTITÉ, jamais celui du joueur). Aucun cas spécial ici :
  // c'est stepWalker qui porte toute la logique, ce module ne fait que lui
  // fournir la position vivante de l'entité et SON callback de lecture
  // (positionné, avec pan/gain propres — jamais centré comme le joueur).
  function updateEntityMovementSounds(x, world, liveById) {
    const volumeFactor = footstepVolumeFactor();

    for (const entry of entitySounds) {
      if (!entry.movementPath) continue;
      const live = liveById.get(entry.entity.id);
      // Dormante (voir core/presence.js) : aucun pas — cohérent avec le
      // core, qui ne tique déjà plus son comportement/mouvement (voir
      // core/reduce.js/stepEntities) : liveX resterait de toute façon
      // figé, mais on l'évite explicitement plutôt que d'en dépendre.
      if (live.present === false) continue;

      stepWalker(entry.walker, live.x, entry.movementStepDistance, (atX) => {
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
      });
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
  //
  // Entité RETIRÉE de world.entities en cours de scène (ex. ramassage, voir
  // core/money.js/pickupEntity) : n'a plus d'entrée ici — synthétise un live
  // "éteint" (present:false) plutôt que de laisser un `undefined` remonter
  // jusqu'aux appelants (applyEntityAudio, occupiedEntities,
  // updateIntermittentSources, updateEntityMovementSounds, pauseBeacons/
  // resumeBeacons) : ils savent TOUS déjà traiter present:false comme
  // "comme si absente" (voir core/presence.js), aucun garde-fou à dupliquer
  // par appelant. Position figée au dernier snapshot connu (entitySounds,
  // capturé à la création de la scène) : jamais lue pour du calcul
  // positionné réel, puisque present:false fait sortir avant partout.
  // AUCUNE bascule "exited" synthétisée ici volontairement (contrairement à
  // une vraie sortie de présence, voir core/presence.js) : cette fonction
  // est appelée depuis PLUSIEURS endroits non synchronisés entre eux avec
  // le tick (pauseBeacons/resumeBeacons, déclenchés par l'ouverture d'un
  // menu) — un signal "une seule fois" posé ici serait consommé par le
  // PREMIER appelant venu, pas forcément applyEntityAudio, et le beacon ne
  // s'arrêterait alors jamais proprement. Voir cleanupRemovedEntities
  // ci-dessous, seule responsable de l'arrêt réel du son, appelée UNE FOIS
  // par tick, inconditionnellement, tôt dans update().
  function liveEntitiesById() {
    const byId = new Map(getActiveWorld(getSession()).entities.map((entity) => [entity.id, entity]));
    for (const { entity } of entitySounds) {
      if (!byId.has(entity.id)) byId.set(entity.id, { ...entity, present: false });
    }
    return byId;
  }

  // Arrête pour de bon le son d'une entité qui vient de disparaître de
  // world.entities (ex. ramassage, voir core/money.js/pickupEntity) —
  // JAMAIS de résidu sonore (exigence explicite du ramassage). Découplé de
  // liveEntitiesById (voir son commentaire) : appelé UNE FOIS par tick,
  // inconditionnellement, tôt dans update() — removedEntityIds garantit un
  // seul stop() par entité, jamais répété. Pas d'exitSound ici : une
  // disparition définitive n'est pas une bascule de présence (réversible),
  // rien à annoncer en plus du son de ramassage déjà joué par la vue
  // (view/interaction.js).
  function cleanupRemovedEntities(world) {
    const liveIds = new Set(world.entities.map((entity) => entity.id));
    for (const entry of entitySounds) {
      if (liveIds.has(entry.entity.id) || removedEntityIds.has(entry.entity.id)) continue;
      removedEntityIds.add(entry.entity.id);
      if (entry.sound) entry.sound.stop();
    }
  }

  // Beacon mis en SOURDINE, PERMANEMMENT, dès qu'une entité passe consumed
  // (voir entities/model.md/"Collectible persistant") — SEULEMENT si son
  // type déclare muteOnConsumed:true (registre, voir entities/types/
  // crate.js). DISTINCT de cleanupRemovedEntities ci-dessus : l'entité
  // RESTE dans world.entities (jamais retirée) — elle reste observable/
  // interactable, juste sa balise continue s'éteint pour de bon (effet
  // POST-ACTIVATION "beacon absent", composable avec la description
  // alternative — voir resolveDescription, view/interaction.js). Appelée
  // UNE FOIS par tick comme cleanupRemovedEntities : couvre aussi bien une
  // consommation EN COURS de scène qu'une entité déjà consumed retrouvée
  // dès le premier tick d'une scène tout juste (re)montée (aucun état de
  // départ spécial à poser à la construction — mutedOnConsumedIds démarre
  // simplement vide, ce tick s'en charge). howl.stop() est déjà idempotent
  // (voir lib/audio.js) — mutedOnConsumedIds évite seulement l'appel
  // répété, pas un bug s'il l'était.
  function muteConsumedBeacons(world) {
    for (const entry of entitySounds) {
      if (!entry.muteOnConsumed || !entry.sound || mutedOnConsumedIds.has(entry.entity.id)) continue;
      const live = world.entities.find((entity) => entity.id === entry.entity.id);
      if (live && live.consumed) {
        entry.sound.stop();
        mutedOnConsumedIds.add(entry.entity.id);
      }
    }
  }

  // sound absent (pas de beacon continu) : rien à maintenir en continu,
  // ignoré pour le pan/volume/passe-bas — updateIntermittentSources() s'en
  // charge à sa propre cadence. Une entité SANS beacon peut malgré tout
  // porter enterSound/exitSound (rôles indépendants) : la bascule est donc
  // vérifiée pour TOUTE entité, jamais seulement celles à voix continue.
  //
  // Présence conditionnelle (voir core/presence.js) : la bascule est
  // détectée par le CORE (live.presenceChanged, "entered"/"exited"/null —
  // voir core/reduce.js/stepEntities), JAMAIS un diff maison ici. "exited" :
  // exitSound (si défini) joué D'ABORD, PUIS le beacon s'arrête — deux Howl
  // entièrement séparés (voir lib/audio.js/playOneShot vs
  // createPositionedSound), le stop() du second ne coupe jamais le premier.
  // "entered" : enterSound (si défini), PUIS le beacon reprend
  // (sound.resume(), redémarre proprement après un stop() antérieur). Sans
  // bascule ce tick (null) : rien de spécial, juste la mise à jour normale
  // ci-dessous si présente.
  function applyEntityAudio(x) {
    const beaconFactor = beaconVolumeFactor();
    const liveById = liveEntitiesById();
    for (const entry of entitySounds) {
      const { entity, sound, audibleRange, panSaturation, interactRange, cutoffMin, cutoffMax, beaconGain } = entry;
      const live = liveById.get(entity.id);
      const relX = live.x - x;

      if (live.presenceChanged === "exited") {
        if (entry.exitSound) playTransitionSound(entry, relX, entry.exitSound);
        if (sound) sound.stop();
      } else if (live.presenceChanged === "entered") {
        if (entry.enterSound) playTransitionSound(entry, relX, entry.enterSound);
        if (sound) sound.resume();
      }

      if (!sound || live.present === false) continue;

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

    // TÔT, avant tout calcul positionné : intègre d'abord toute entité
    // apparue en jeu depuis le dernier tick (ex. entité ÉPHÉMÈRE, voir
    // core/state.js/spawnEphemeral) — voir syncNewEntitySounds. Puis arrête
    // pour de bon le son d'une entité qui vient de disparaître (ex.
    // ramassage, voir core/money.js/pickupEntity) — voir
    // cleanupRemovedEntities. Puis, même logique pour une entité CONSUMED
    // (voir core/money.js/lootEntity) qui, elle, reste dans le monde — voir
    // muteConsumedBeacons.
    syncNewEntitySounds(world);
    cleanupRemovedEntities(world);
    muteConsumedBeacons(world);

    // Bascule de phase jour/nuit (voir core/time.js/phaseAt) : on compare à
    // la phase MÉMORISÉE, on n'agit QUE sur la différence — jamais en
    // continu (phaseAt est réévalué chaque tick, mais currentPhase ne
    // change que sur un vrai changement, voir CLAUDE.md/le prompt d'origine
    // "on agit sur la TRANSITION, pas en continu"). Fondu UNIVERSEL PUIS
    // respiration PUIS nouvelle séquence (voir lib/audio.js/
    // switchMusicSequence) — jamais l'entrée en scène ci-dessus, qui joue
    // déjà la bonne phase directement. Nouvelle phase SANS musique
    // déclarée : la précédente doit quand même s'éteindre (même fondu
    // universel), jamais continuer à jouer indéfiniment dans la phase
    // suivante.
    const phase = phaseAt(session.time);
    if (phase !== currentPhase) {
      currentPhase = phase;
      if (resolveMusicForPhase(world, currentPhase)) {
        switchMusicSequence({
          pickPath: pickMusicPath(world, currentPhase),
          loop: musicLoop,
          breatherRange: MUSIC_BREATHER_RANGE,
          fadeMs: MUSIC_FADE_MS,
        });
      } else {
        fadeOutMusic(MUSIC_FADE_MS);
      }
    }

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

    // Pas du joueur — voir stepWalker : mécanisme UNIFIÉ avec les entités
    // mobiles (updateEntityMovementSounds), un seul pas de démarrage à la
    // reprise du mouvement puis un pas par jalon de STEP_DISTANCE franchi,
    // chacun à sa propre position (donc sa propre surface). Centré, sans
    // pan : c'est le joueur lui-même.
    stepWalker(playerWalker, x, STEP_DISTANCE, (atX) => playFootstep(atX, world));

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
    // onExit/transitionThroughDoor) : un menu/pause empilé par-dessus
    // n'appelle jamais destroy(), donc n'arrête jamais musique/ambiances —
    // seule la vraie sortie le fait. Musique : fondu UNIVERSEL (voir
    // lib/audio.js/fadeOutMusic), jamais une coupure sèche — la transition
    // elle-même reste IMMÉDIATE (la scène suivante démarre tout de suite,
    // voir transitionThroughDoor), le morceau sortant fond simplement en
    // arrière-plan par-dessus le début de la nouvelle scène. Léger
    // chevauchement assumé (non masqué ici) : une future transition sonore
    // d'habillage pourrait le couvrir, non requise aujourd'hui. Ambiance :
    // inchangée, coupure franche.
    fadeOutMusic(MUSIC_FADE_MS);
    stopGlobal("ambience");
    if (activeScene === api) activeScene = null;
  }

  // Candidats d'interaction courants POUR UN VERBE (kind : "describe" ->
  // Espace, "activate" -> Entrée) : sous-ensemble FILTRÉ de la dernière
  // occupation calculée en update() — même portée (interactRange), même tri,
  // mais restreint aux entités qui portent la capacité de CE verbe
  // (observable/interactable, voir core/level.js et entities/model.md). Une
  // entité à portée sans la capacité voulue n'est simplement jamais dans le
  // résultat — c'est ce filtre, PAS la désambiguïsation, qui décide si un
  // verbe a quelque chose à faire ici (voir view/interaction.js/
  // chooseInteractionTarget, qui reste inchangée : elle reçoit déjà un
  // ensemble filtré, jamais consciente elle-même du verbe pour ce choix).
  function getInteractionCandidates(kind) {
    const capability = kind === "describe" ? "observable" : "interactable";
    return currentOccupied.filter((entity) => entity[capability]);
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
  //
  // present === false EXCLU explicitement (entité dormante OU RETIRÉE, voir
  // liveEntitiesById) : son beacon a déjà été arrêté (howl.stop(), voir
  // applyEntityAudio pour une dormante/bascule "exited", ou
  // cleanupRemovedEntities pour une RETIRÉE) — resume() y rappellerait
  // howl.play(), qui REDÉMARRERAIT la voix depuis le début (contrairement à
  // pause()/resume() sur une voix simplement en pause) : un beacon fantôme
  // réapparaîtrait pour une entité dormante ou, pire, définitivement
  // disparue (ex. argent ramassé). undefined (entité SANS règle de
  // présence, l'immense majorité) reste inclus : ce n'est PAS "false".
  function pauseBeacons() {
    const liveById = liveEntitiesById();
    for (const { entity, sound } of entitySounds) {
      if (sound && liveById.get(entity.id).present !== false) sound.pause();
    }
  }
  function resumeBeacons() {
    const liveById = liveEntitiesById();
    for (const { entity, sound } of entitySounds) {
      if (sound && liveById.get(entity.id).present !== false) sound.resume();
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
