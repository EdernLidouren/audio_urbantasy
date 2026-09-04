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
//
// RECTO/VERSO, étape 2/2 — COEXISTENCE (voir CLAUDE.md) : pour une scène à
// deux faces, le core tique désormais LES DEUX (core/reduce.js/TICK,
// isolées). Cette vue rend la face COURANTE normalement (entitySounds,
// inchangé) ET l'AUTRE face en ÉTOUFFÉ (otherEntitySounds) — même
// positionnement (pan/distance) que d'habitude, PLUS un passe-bas et une
// atténuation de gain (MUFFLING_LOWPASS_HZ/MUFFLING_GAIN,
// config/tuning-values.js), voir playPositionedOneShot. Un seul son est
// EXCLU du rendu NORMAL de l'autre face : le BEACON (localisation) — on
// DEVINE sa présence, on ne la localise jamais (buildEntitySoundEntry/
// includeBeacon). Occupation/interaction restent scopées à la face
// courante (entitySounds seul) : le rendu étouffé n'ajoute AUCUNE cible
// d'interaction.
//
// RECTO/VERSO, étape 3/3 — BASCULE ANIMÉE (voir view/city-screen.js/
// sideSwitchEffect) : au lieu d'un échange instantané (normal <-> étouffé),
// crossfadeFaceSwap (plus bas) CROISE les deux filtres d'occlusion — la
// face courante ferme le sien pendant que l'autre ouvre le sien, toutes
// deux restant AUDIBLES (jamais un fondu vers le silence). SEULE exception
// BORNÉE à `includeBeacon:false` : le temps de ce croisement, des balises
// TEMPORAIRES portent le filtre qui s'ouvre pour les beacons continus de
// l'autre face — détruites dès le croisement terminé, jamais ajoutées à
// otherEntitySounds.

import {
  playOneShot,
  preloadOneShot,
  keepAudioContextAwake,
  createPositionedSound,
  createReverbBus,
  setGlobalVolume,
  preloadMusic,
  setMusicLayer,
  clearMusicLayers,
  setAmbienceLayer,
  clearAmbienceLayers,
  setWeatherAmbienceLayer,
  declareAmbienceLayers,
  randomRate,
} from "../../lib/audio.js";
import { announce } from "../../lib/announce.js";
import { resolveAsset, hasAsset, assetKeyMembers } from "../../lib/assets.js";
import registry from "../../entities/types/index.js";
import player from "../../entities/player.js";
import { TUNING_DEFAULTS, resolveTuning } from "../../config/tuning.js";
import { getPref, PREF_CONSTRAINTS } from "../../config/preferences.js";
import { PERCEPTION_MUSIC_POOL, PERCEPTION_AMBIENCE_POOL } from "../../config/perception.js";
import { WEATHER_STATES } from "../../config/weather-values.js";
import { t } from "../../data/i18n/index.js";
import { MOVE_STEP, getActiveWorld, getInactiveFace } from "../../core/state.js";
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

// Message météo COMPOSÉ à un changement d'état (voir advanceWeather,
// core/weather.js, et son appelant plus bas) : {fin de L'ANCIEN état} +
// {début du NOUVEL état}, assemblés PAR GABARIT i18n
// ("weather.transition.both"/"weather.transition.startOnly", une clé par
// langue — voir data/i18n/*/weather.json) — jamais de concaténation en
// dur ici, l'ordre/le connecteur/la ponctuation vivent ENTIÈREMENT dans
// ces deux gabarits. Chaîne vide = signal "omets cette partie" (ex.
// weather.transition.clear.end vide — "dégagé" n'a rien à dire en
// PARTANT) : RÈGLE GÉNÉRALE sur la valeur résolue, jamais un cas spécial
// codé en dur sur un état précis — n'importe quel état pourrait un jour
// déclarer un fragment vide et serait traité pareil. fin ET début non
// vides -> gabarit "both" ; fin vide -> gabarit "startOnly" (le début
// seul) ; le cas symétrique (début vide, fin non vide) n'existe dans
// aucun contenu actuel, mais reste couvert : même gabarit "startOnly",
// nourri du fragment survivant (nommage du paramètre sans conséquence
// puisque le gabarit ne fait qu'interpoler une chaîne dans une phrase).
// Les deux vides (état hypothétique) -> chaîne vide, announce() s'en
// dépêtre déjà (no-op silencieux sur "", voir lib/announce.js).
function composeWeatherTransitionMessage(fromState, toState) {
  const end = t(`weather.transition.${fromState}.end`);
  const start = t(`weather.transition.${toState}.start`);
  if (end && start) return t("weather.transition.both", { end, start });
  if (start) return t("weather.transition.startOnly", { start });
  if (end) return t("weather.transition.startOnly", { start: end });
  return "";
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
// Fondu de l'ambiance MÉTÉO (voir core/weather.js, lib/audio.js/
// setWeatherAmbienceLayer) — une seule durée pour toute transition météo,
// jamais dupliquée en dur ici.
const WEATHER_AMBIENCE_FADE_MS = TUNING_DEFAULTS.weatherAmbienceFadeMs;
// Niveaux du modèle de volume par zones (voir volumeForDistance) : ce sont
// des constantes de forme de courbe, pas des réglages par entité.
const FULL_VOLUME = TUNING_DEFAULTS.fullVolume;
const FAR_VOLUME_MAX = TUNING_DEFAULTS.farVolumeMax;
// Fourchette du délai de démarrage aléatoire des balises (désempilement
// d'attaques, voir buildEntitySoundEntry plus bas) — partagée, jamais
// résolue par entité.
const BEACON_STAGGER_MIN_MS = TUNING_DEFAULTS.beaconStaggerMinMs;
const BEACON_STAGGER_MAX_MS = TUNING_DEFAULTS.beaconStaggerMaxMs;
// Rendu ÉTOUFFÉ de l'AUTRE face (RECTO/VERSO étape 2/2, voir
// config/tuning-values.js pour le détail des deux réglages) — appliqués à
// TOUT one-shot positionné d'une entité de la face non courante, jamais aux
// beacons (exclus entièrement, voir buildEntitySoundEntry/includeBeacon).
const MUFFLING_LOWPASS_HZ = TUNING_DEFAULTS.mufflingLowpassHz;
const MUFFLING_GAIN = TUNING_DEFAULTS.mufflingGain;
// Durée (ms) du fondu de PERCEPTION SURNATURELLE (voir
// core/presence.js/"perceptionActive") — crossfade musique/ambiance ET
// rampe du filtre d'étouffement des entités mondaines, la MÊME durée pour
// les deux (voir plus bas, currentMundaneMuffleAmount). Le cooldown de la
// touche (view/city-screen.js) est DÉRIVÉ de cette même valeur
// (config/tuning-values.js/perceptionCooldownMs) — jamais dupliquée ici.
const PERCEPTION_FADE_MS = TUNING_DEFAULTS.perceptionFadeMs;
// Cadence des pas de TRAJET pendant une transition recto/verso (voir
// playTransitionSteps plus bas) — réglage PARTAGÉ, jamais résolu par
// passage (voir config/tuning-values.js/transitionStepIntervalMs).
const TRANSITION_STEP_INTERVAL_MS = TUNING_DEFAULTS.transitionStepIntervalMs;

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

// Clé d'asset "<name>_walk" sous assets/sounds/footsteps/<catégorie>/ —
// convention PARTAGÉE par une surface, un gait ou un naturalWalk (voir
// resolveFootstepPath ci-dessous) : un simple nom + suffixe, jamais composé
// (voir entities/model.md, "pas de produit cartésien surface×chaussure").
// `category` : "surfaces" (sol) ou "gaits" (chaussure/allure ET pas naturel
// — naturalWalk PARTAGE le même sous-dossier que gait, jamais un troisième :
// voir entities/model.md, "naturalWalk" peut réutiliser un nom de gait
// existant, ex. "barefoot", par conception).
function footstepKey(category, name) {
  return `assets/sounds/footsteps/${category}/${name}_walk`;
}

// Plancher garanti du son de pas : le SEUL chemin dont l'existence n'est
// JAMAIS vérifiée (contrairement aux crans ci-dessous, tous testés via
// hasAsset) — DOIT rester présent en permanence. "shoes" (catégorie
// "gaits") : le pool neutre général du jeu (voir entities/player.js) —
// remplace "concrete", retiré de assets/ lors de l'ajout des pools
// shoes_walk/sand_walk.
const FOOTSTEP_FLOOR_PATH = footstepKey("gaits", "shoes");

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
    const specialKey = footstepKey("surfaces", surface);
    if (hasAsset(specialKey)) return specialKey;
  }

  if (gait) {
    const gaitKey = footstepKey("gaits", gait);
    if (hasAsset(gaitKey)) return gaitKey;
  }

  if (naturalWalk) {
    const naturalKey = footstepKey("gaits", naturalWalk);
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
  if (gait) keys.push(footstepKey("gaits", gait));
  if (naturalWalk) keys.push(footstepKey("gaits", naturalWalk));
  if (ownPath) keys.push(ownPath);
  return keys;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Une condition EXIGE-t-elle la perception ? Au premier niveau
// ("perceptionActive" directement) OU imbriquée dans un "allOf" (voir
// core/presence.js), à n'importe quelle profondeur — une entité dont la
// présence combine la perception à D'AUTRES conditions (ex.
// entities/types/cumulo-lupus.js, perception ET météo) reste "surnaturelle"
// au même titre qu'une condition perceptionActive seule, voir
// isPerceptionGated ci-dessous.
function conditionRequiresPerception(cond) {
  if (!cond) return false;
  if (cond.type === "perceptionActive") return true;
  if (cond.type === "allOf" && Array.isArray(cond.conditions)) {
    return cond.conditions.some(conditionRequiresPerception);
  }
  return false;
}

// Une entité est "surnaturelle" si elle ne PORTE aucun champ dédié (voir
// entities/model.md, header : "les entités portent la logique, pas la
// structure des scènes") — juste une entité normale dont la présence est
// conditionnée par "perceptionActive" (voir core/presence.js,
// entities/types/ghost.js), SEULE ou combinée (conditionRequiresPerception
// ci-dessus). Détecté ICI, STRUCTURELLEMENT (inspection de entity.presence,
// jamais un flag séparé) : sert à l'EXEMPTER du filtre d'étouffement des
// entités mondaines (voir currentMundaneMuffleAmount plus bas) — une entité
// surnaturelle émerge pleine et claire, jamais étouffée par son propre
// mécanisme de révélation.
function isPerceptionGated(entity) {
  return Boolean(entity.presence && entity.presence.some((rule) => conditionRequiresPerception(rule.when)));
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

// randomRate (voir TUNING_DEFAULTS.pitchVariation) : déplacé dans
// lib/audio.js — utilitaire GÉNÉRIQUE (aucune connaissance du jeu), importé
// ci-dessus, SEUL point de calcul, partagé avec playDescribedOneShot (un
// effet "playSound", voir view/interaction.js) — plus de définition locale
// ici.

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

// DESCRIPTEUR DE SON PARTAGÉ — cœur commun (gain/pitchVariation/reverbSend)
// résolu en CASCADE (son -> instance -> archétype -> défaut global, voir
// config/tuning.js/resolveTuning) contre `descriptor` — SEUL point de
// résolution de ce triplet, réutilisé par TOUS les rôles positionnés
// ci-dessous (beacon continu/intermittent, vocal, enterSound/exitSound) :
// ajouter un réglage commun demain (voir CLAUDE.md/"Format déclaratif") ne
// touche qu'ici. `gainKey` : SEULE clé de cascade qui varie par rôle
// (beaconGain/vocalGain/enterSoundGain/exitSoundGain — voir
// entities/model.md) ; pitchVariation/reverbSend partagent toujours la MÊME
// clé partout. `useFlyingReverbSend` (défaut false) : SEULS les rôles
// CONTINU/INTERMITTENT swappent reverbSend -> flyingReverbSend pour une
// entité isFlying (voir "Chaîne de filtres hauteur", entities/model.md) —
// enterSound/exitSound n'ont jamais fait ce swap, comportement PRÉEXISTANT
// préservé tel quel, jamais unifié par ce regroupement.
function resolveSoundSettings(entity, descriptor, gainKey, { useFlyingReverbSend = false } = {}) {
  return {
    gain: resolveTuning(gainKey, entity, descriptor),
    pitchVariation: resolveTuning("pitchVariation", entity, descriptor),
    reverbSend:
      useFlyingReverbSend && entity.isFlying
        ? resolveTuning("flyingReverbSend", entity, descriptor)
        : resolveTuning("reverbSend", entity, descriptor),
  };
}

// Résout une source positionnée INTERMITTENTE (beacon en mode
// "intermittent", ou vocal — toujours intermittent) : chemin, cadence
// (interval/intervalVariation), + le cœur commun (resolveSoundSettings
// ci-dessus) via les clés du rôle (keys). nextAt (mutable, relu/réécrit à
// chaque tick — voir updateIntermittentSources) réamorcé à 0 : premier
// déclenchement dès le premier tick.
//
// isFlying (voir entities/model.md) : highpassHz/heightGain résolus EN PLUS
// du swap reverbSend (resolveSoundSettings) — sinon (entité non volante)
// highpassHz reste `undefined` (aucun filtre tenté) et heightGain reste
// neutre (1), chemin STRICTEMENT inchangé. Chaîne de filtres "hauteur
// suggérée", voir config/tuning-values.js.
function resolveIntermittentSource(entity, descriptor, keys) {
  const { gain, pitchVariation, reverbSend } = resolveSoundSettings(entity, descriptor, keys.gain, {
    useFlyingReverbSend: true,
  });
  return {
    path: descriptor.path,
    interval: resolveTuning(keys.interval, entity, descriptor),
    intervalVariation: resolveTuning(keys.intervalVariation, entity, descriptor),
    gain,
    pitchVariation,
    reverbSend,
    highpassHz: entity.isFlying ? resolveTuning("flyingHighpassHz", entity, descriptor) : undefined,
    heightGain: entity.isFlying ? resolveTuning("flyingVolumeFactor", entity, descriptor) : 1,
    nextAt: 0,
  };
}

// enterSound/exitSound (voir core/presence.js, entities/model.md) : rôles
// sonores PONCTUELS et POSITIONNÉS, déclenchés par une bascule de présence
// OBSERVÉE (core/reduce.js/stepEntities), jamais par une cadence/intervalle
// — contrairement à resolveIntermittentSource ci-dessus, pas de nextAt à
// replanifier. Chemin + cœur commun (resolveSoundSettings) résolus UNE FOIS
// ici, comme les autres rôles. descriptor absent -> null (rôle optionnel,
// indépendant de l'autre — une entité peut n'avoir que l'un des deux, voir
// neon.js).
const ENTER_SOUND_TUNING_KEYS = { gain: "enterSoundGain" };
const EXIT_SOUND_TUNING_KEYS = { gain: "exitSoundGain" };
function resolveTransitionSound(entity, descriptor, keys) {
  if (!descriptor) return null;
  return { path: descriptor.path, ...resolveSoundSettings(entity, descriptor, keys.gain) };
}

// Effet "playSound" DIÉGÉTIQUE (voir view/interaction.js/runPlaySoundEffect,
// playEntityOneShot plus bas) : un son PONCTUEL positionné sur une entité,
// EXACTEMENT comme enterSound/exitSound ci-dessus — même mécanisme de
// résolution (resolveTransitionSound), pas une seconde logique parallèle.
// "gain" (littéral, pas de rôle dédié du genre beaconGain/vocalGain) : un
// playSound n'a pas de rôle fixe sur l'entité, seulement son propre champ
// `gain` optionnel (core/level.js/parseEffect) — TUNING_DEFAULTS n'en porte
// aucun défaut global sous cette clé, playPositionedOneShot retombe alors
// sur son propre défaut neutre (1), comportement de gain STRICTEMENT
// inchangé. Ce qui CHANGE : pitchVariation/reverbSend, jusque-là lus TELS
// QUELS sur l'effet brut (jamais undefined -> defaut, voir l'ancien bug —
// un playSound sans reverbSend déclaré ne rejoignait JAMAIS le bus de
// réverb du lieu), passent désormais par la MÊME cascade que tout son
// positionné d'entité (sound -> instance -> archétype -> défaut global,
// reverbSend: 0.5) — un playSound qui déclare `reverbSend` explicitement
// continue de le surcharger (resolveTuning teste `descriptor[key]` en
// premier), seul le CAS NON DÉCLARÉ change de comportement.
const PLAY_SOUND_TUNING_KEYS = { gain: "gain" };

// Volume dérivé de la distance, en DEUX couches jamais mélangées :
//   - un PLANCHER continu, décroissance linéaire de FAR_VOLUME_MAX (à
//     dist=0) vers 0 (à audibleRange) — le même pour TOUTE entité,
//     surlignée ou non, sans plateau ni saut.
//   - un PALIER à FULL_VOLUME quand `highlighted` est vrai (voir
//     entities/model.md, "Surlignage audio de proximité") : SAUT NET, pas
//     de rampe — un essai de fondu progressif (quelques dizaines à
//     quelques centaines de ms) s'est révélé quasi inaudible à l'oreille
//     en marchant/courant normalement (la fenêtre de présence dans
//     interactRange est trop courte pour laisser le fondu se terminer) ;
//     l'ancien comportement (saut instantané) est reconduit TEL QUEL, mais
//     désormais GOUVERNÉ par le flag highlight (voir buildEntitySoundEntry)
//     au lieu de s'appliquer à toute entité sans distinction.
function volumeForDistance(dist, audibleRange, highlighted) {
  if (dist >= audibleRange) return 0;
  if (highlighted) return FULL_VOLUME;

  return FAR_VOLUME_MAX * (1 - dist / audibleRange);
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
// includeBeacon (défaut true) : `false` pour une entité de l'AUTRE face
// d'une scène à deux faces (RECTO/VERSO étape 2/2, voir CLAUDE.md) — AUCUN
// beacon, ni continu ni intermittent, jamais construit dans ce cas (`beacon`
// reste undefined, exactement comme un type qui n'en déclare aucun) : on
// DEVINE la présence de l'autre face, on ne la LOCALISE pas. Vocal/movement/
// enterSound/exitSound restent inchangés (rendus en ÉTOUFFÉ par l'appelant,
// voir playPositionedOneShot/playTransitionSound, jamais coupés ici).
function buildEntitySoundEntry(entity, world, time, perceptionActive, weather, { includeBeacon = true, disableStagger = false } = {}) {
  // beacon (localisation) et vocal (expression) : descripteurs de son du
  // type, tous deux OPTIONNELS et indépendants (voir entities/model.md) —
  // ni l'un ni l'autre n'est "le" son obligatoire d'une entité. `entity.sounds`
  // (jamais `registry[entity.type].sounds` directement) : déjà le résultat
  // RÉSOLU de la cascade instance -> archétype par fusion profonde (voir
  // core/level.js/parseEntity) — un rôle retiré à l'instance (ex.
  // beacon: null) n'existe donc déjà plus ICI, rien à revérifier contre
  // l'archétype.
  const sounds = entity.sounds;
  const beacon = includeBeacon ? sounds.beacon : undefined;
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
  // Surlignage (voir volumeForDistance, entities/model.md) : flag EXPLICITE
  // de l'entité, pas d'un rôle de son — même cascade que gait/naturalWalk
  // plus bas (pas de `sound` en 3e paramètre). Boolean() : un `tuning`/
  // registre qui déclare une valeur truthy non booléenne resterait un flag
  // franc, jamais une valeur exotique propagée plus loin.
  const highlight = Boolean(resolveTuning("highlight", entity));
  // Chaîne de filtres "hauteur suggérée" (voir entities/model.md, isFlying)
  // — résolus même sans balise CONTINUE (sans effet dans ce cas, voir
  // applyEntityAudio, qui ne les utilise que si `sound` existe) : entité non
  // volante -> flyingHighpassHz reste undefined (aucun filtre tenté),
  // flyingVolumeFactor reste neutre (1), chemin STRICTEMENT inchangé.
  const flyingHighpassHz = entity.isFlying ? resolveTuning("flyingHighpassHz", entity) : undefined;
  const flyingVolumeFactor = entity.isFlying ? resolveTuning("flyingVolumeFactor", entity) : 1;

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
      // Cœur commun (resolveSoundSettings ci-dessus) — beaconGain/
      // beaconReverbSend PORTÉS par l'entrée son (voir applyEntityAudio),
      // beaconPitchVariation consommée UNE FOIS ici (balise continue, voir
      // le commentaire de header sur cette particularité).
      const beaconSettings = resolveSoundSettings(entity, beacon, "beaconGain", { useFlyingReverbSend: true });
      beaconGain = beaconSettings.gain;
      beaconReverbSend = beaconSettings.reverbSend;
      const beaconPitchVariation = beaconSettings.pitchVariation;
      // staggerBeacon (défaut true, voir config/tuning-values.js) :
      // OPT-OUT du désempilement d'attaques — appliqué INDISTINCTEMENT à
      // TOUTE balise continue nouvellement créée ici (montage de scène OU
      // apparition tardive groupée, voir syncNewEntitySounds), jamais
      // seulement si "plusieurs à la fois" sont détectées (voir
      // entities/model.md) : un délai isolé de quelques dizaines de ms est
      // imperceptible. disableStagger (voir crossfadeFaceSwap plus bas) :
      // EXCEPTION — une balise TEMPORAIRE de croisement doit jouer
      // IMMÉDIATEMENT (elle a besoin d'un volume/cutoff imposés dès sa
      // création pour démarrer le fondu au bon point) ; un démarrage
      // différé écraserait volume(0) + rejouerait APRÈS le début du fondu
      // déjà programmé dessus, cassant la rampe.
      const staggerBeacon = disableStagger ? false : resolveTuning("staggerBeacon", entity, beacon);
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
  if (sound && !isPresent(entity, { time, perceptionActive, weather })) sound.stop();

  return {
    entity,
    audibleRange,
    panSaturation,
    interactRange,
    highlight,
    cutoffMin,
    cutoffMax,
    flyingHighpassHz,
    flyingVolumeFactor,
    sound,
    beaconGain,
    beaconReverbSend,
    intermittentSources,
    enterSound,
    exitSound,
    muteOnConsumed,
    // Surnaturelle (voir isPerceptionGated plus haut) : jamais soumise au
    // filtre d'étouffement des entités mondaines (voir
    // currentMundaneMuffleAmount, applyEntityAudio, effectiveMuffleAmount).
    perceptionGated: isPerceptionGated(entity),
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
    buildEntitySoundEntry(entity, initialWorld, getSession().time, getSession().perceptionActive, getSession().weather.state)
  );

  // RECTO/VERSO étape 2/2 (voir CLAUDE.md) : entrées de son pour l'AUTRE
  // face, si la scène en a une — `null` sinon (scène simple, rien de plus à
  // construire). `includeBeacon:false` (voir buildEntitySoundEntry) : AUCUN
  // beacon pour ces entrées, jamais construit — le reste (vocal, movement,
  // enterSound/exitSound) est bâti à l'IDENTIQUE, seul le RENDU au tick
  // (voir update() plus bas) diffère (étouffé, jamais de continu à
  // entretenir puisque `sound` reste toujours null ici). PAS de compagnons
  // mélangés (getInactiveFace, contrairement à getActiveWorld) : ils
  // suivent le joueur, jamais l'autre face.
  const initialOtherFace = getInactiveFace(getSession());
  const otherEntitySounds = initialOtherFace
    ? initialOtherFace.entities.map((entity) =>
        buildEntitySoundEntry(entity, initialOtherFace, getSession().time, getSession().perceptionActive, getSession().weather.state, {
          includeBeacon: false,
        })
      )
    : null;

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
    const entry = buildEntitySoundEntry(entity, world, getSession().time, getSession().perceptionActive, getSession().weather.state);
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

  // Équivalents pour l'AUTRE face (voir otherEntitySounds plus haut) — MÊME
  // principe EXACT que addLateEntitySoundEntry/syncNewEntitySounds
  // ci-dessus, mais plus simples : `sound` reste toujours null pour une
  // entrée étouffée (includeBeacon:false), donc rien à brancher au bus de
  // réverb ni à suivre dans une table de sons de collision (le joueur ne
  // collisionne jamais avec l'autre face, voir core/reduce.js/TICK —
  // isolation stricte). No-op si la scène est simple (otherEntitySounds
  // null, jamais d'entité à synchroniser).
  function addLateOtherEntitySoundEntry(entity, otherFace) {
    const entry = buildEntitySoundEntry(entity, otherFace, getSession().time, getSession().perceptionActive, getSession().weather.state, {
      includeBeacon: false,
    });
    otherEntitySounds.push(entry);
    return entry;
  }
  function syncNewOtherEntitySounds(otherFace) {
    if (!otherEntitySounds) return;
    const knownIds = new Set(otherEntitySounds.map(({ entity }) => entity.id));
    for (const entity of otherFace.entities) {
      if (!knownIds.has(entity.id)) addLateOtherEntitySoundEntry(entity, otherFace);
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
  //
  // otherEntitySounds (RECTO/VERSO étape 2/2) N'EST PAS balayé ici — même
  // politique acceptée que pour une entité tardive (voir addLateEntitySoundEntry
  // ci-dessus) : au pire, le tout premier son étouffé de l'autre face part
  // légèrement en retard le temps d'un décodage à froid, jamais perdu ni un
  // plantage. En plus, sa chaîne de filtres est DISTINCTE de la version
  // normale du même fichier (cacheKey `muffled:...`, voir
  // playPositionedOneShot) : la précharger doublerait le nombre de requêtes
  // au montage pour un gain marginal, non retenu ici.
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
  preloadKeys.add(footstepKey("surfaces", initialWorld.defaultSurface));
  for (const segment of initialWorld.segments) preloadKeys.add(footstepKey("surfaces", segment.surface));

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
  // COUCHES DE LIEU/D'ÉTAT (voir lib/audio.js/setMusicLayer/
  // setAmbienceLayer, "Couches persistantes MUSIQUE/AMBIANCE") : chaque
  // canal ne s'interrompt QUE si son identité DÉCLARÉE change réellement —
  // jamais pour "relancer la même chose". currentPhase mémorise la phase
  // pour update() ci-dessous, seul endroit qui la refait varier (sur
  // bascule, la couche de lieu se redéclare, voir plus bas).
  let currentPhase = phaseAt(getSession().time);
  const musicLoop = Boolean(world.musicLoop);
  const ambiences = world.ambiences;
  // Perception surnaturelle (voir core/presence.js/"perceptionActive") :
  // tracké ICI (comme currentPhase ci-dessus), comparé à chaque tick contre
  // session.perceptionActive (voir update() plus bas) pour détecter la
  // BASCULE, jamais réévalué en continu — pilote la couche D'ÉTAT du
  // canal musique/ambiance (voir juste en dessous).
  let perceptionActive = getSession().perceptionActive;
  const pickPerceptionMusicPath = () => resolveAsset(PERCEPTION_MUSIC_POOL);

  // Volume AVANT toute déclaration de couche : playMusicTrack/crossfadeSlot/
  // startSlotDirect (lib/audio.js) lisent channelVolume("music"/"ambience")
  // DÈS LA CRÉATION d'un flux, quel qu'il soit (démarrage direct OU fondu de
  // crossfade) — l'ordre entre setGlobalVolume et les déclarations de
  // couches ci-dessous n'a donc plus d'importance FONCTIONNELLE, mais
  // AVANT reste le plus sûr : jamais de risque d'écraser en dur (sans
  // fondu) le volume d'un flux dont un fondu viendrait tout juste de
  // démarrer (voir setGlobalVolume, qui applique .volume() directement à
  // TOUT ce qui est dans le canal au moment de son appel).
  setGlobalVolume("music", musicVolumeFactor());
  setGlobalVolume("ambience", ambienceVolumeFactor());

  // Couche D'ÉTAT AVANT couche DE LIEU (ordre important, contrairement au
  // reste) : si l'état est DÉJÀ actif au montage (ex. sauvegarde reprise en
  // pleine perception, ou transition en cours de perception — voir
  // performTransition, view/city-screen.js, qui ne coupe plus la couche
  // d'état), la déclarer EN PREMIER lui laisse imposer directement son
  // identité — la couche de lieu, déclarée juste après, se retrouve alors
  // simplement ignorée (l'état prime, voir lib/audio.js/winningMusicLayer
  // pour la musique, desiredAmbienceSlots pour l'ambiance) sans jamais
  // avoir démarré puis interrompu quoi que ce soit pour rien.
  const musicStateParams = { pickPath: pickPerceptionMusicPath, loop: false, breatherRange: MUSIC_BREATHER_RANGE };
  setMusicLayer("state", perceptionActive ? PERCEPTION_MUSIC_POOL : null, musicStateParams, PERCEPTION_FADE_MS);
  setMusicLayer(
    "location",
    resolveMusicForPhase(world, currentPhase),
    { pickPath: pickMusicPath(world, currentPhase), loop: musicLoop, breatherRange: MUSIC_BREATHER_RANGE },
    MUSIC_FADE_MS
  );

  // Ambiance : état, lieu ET météo déclarés EN UNE SEULE FOIS au montage
  // (voir lib/audio.js/declareAmbienceLayers) — une intention complète,
  // plutôt que trois déclarations séparées. La synchronisation sous-jacente
  // (lib/audio.js/syncAmbienceLayers) fait un DIFFING PAR COUCHE : seule une
  // couche dont la source déclarée change réellement est fondue, les autres
  // gardent EXACTEMENT leurs flux en cours (ni fondu, ni retirage) — c'est
  // CE mécanisme qui garantit qu'un changement de météo seul ne touche
  // jamais l'ambiance de lieu, et inversement.
  //
  // INDOOR/OUTDOOR (modèle A, voir core/level.js/parseFace, "nature de
  // lieu") : `indoor` est la propriété de la scène ACTIVE, capturée UNE
  // FOIS ici — une scène ne change jamais de nature en cours de vie, seule
  // une TRANSITION (destroy + recreate, donc un nouveau montage de ce
  // fichier) peut faire passer de outdoor à indoor ou l'inverse. C'est CE
  // qui donne le fondu "déclenché par le changement de CONTEXTE" demandé :
  // au montage de la scène SUIVANTE, ce même mécanisme redéclare le pool
  // pour le NOUVEAU contexte, avec le MÊME weatherState si la météo n'a pas
  // changé — l'identité déclarée diffère (pool outdoor vs indoor, jamais
  // composée par concaténation de nom, LUE telle quelle dans la table), donc
  // la couche météo (et ELLE SEULE) fond vers le nouveau pool ; le lieu
  // suit sa PROPRE logique, inchangé si sa source déclarée l'est aussi.
  // weatherState tracké ICI (comme currentPhase/perceptionActive ci-dessus)
  // pour détecter la TRANSITION dans update() plus bas.
  let weatherState = getSession().weather.state;
  const indoor = Boolean(world.indoor);
  function weatherAmbiencePool(state) {
    return WEATHER_STATES[state]?.ambience?.[indoor ? "indoor" : "outdoor"];
  }
  const mountWeatherPool = weatherAmbiencePool(weatherState);
  declareAmbienceLayers(
    {
      state: {
        identity: perceptionActive ? [PERCEPTION_AMBIENCE_POOL] : null,
        resolvedPaths: perceptionActive ? [resolveAsset(PERCEPTION_AMBIENCE_POOL)] : null,
      },
      location: {
        identity: ambiences && ambiences.length > 0 ? ambiences : null,
        resolvedPaths: ambiences && ambiences.length > 0 ? ambiences.map(resolveAsset) : null,
      },
      weather: {
        identity: mountWeatherPool ? [mountWeatherPool] : null,
        resolvedPaths: mountWeatherPool ? [resolveAsset(mountWeatherPool)] : null,
      },
    },
    MUSIC_FADE_MS
  );

  // Redéclare la couche météo SEULE — voir update() plus bas, transition
  // météo EN COURS DE SCÈNE (rien d'autre ne change à cet instant, un seul
  // appel suffit : pas de cible intermédiaire à éviter, contrairement au
  // montage ci-dessus).
  function declareWeatherAmbience(state, fadeMs) {
    const pool = weatherAmbiencePool(state);
    setWeatherAmbienceLayer(pool ? [pool] : null, pool ? [resolveAsset(pool)] : null, fadeMs);
  }

  // Rampe du filtre d'étouffement des entités MONDAINES (voir
  // effectiveMuffleAmount/currentMundaneMuffleAmount plus bas) : de/vers
  // (from/to), démarrée à mundaneMuffleRampStartedAt (performance.now()) —
  // AUCUNE animation à l'entrée en scène (from === to d'emblée, comme la
  // musique/l'ambiance ci-dessus) : une scène qui s'ouvre déjà en perception
  // démarre déjà pleinement étouffée, jamais en train de "finir" un fondu
  // qui n'a jamais eu lieu ici.
  let mundaneMuffleRampFrom = perceptionActive ? 1 : 0;
  let mundaneMuffleRampTo = perceptionActive ? 1 : 0;
  let mundaneMuffleRampStartedAt = performance.now();

  // Amount courant (0..1) du filtre d'étouffement mondain, interpolé EN
  // TEMPS RÉEL entre mundaneMuffleRampFrom/To sur PERCEPTION_FADE_MS — lu à
  // CHAQUE tick par applyEntityAudio/effectiveMuffleAmount, jamais mis en
  // cache : c'est cette ré-évaluation continue qui donne le "fondu du
  // filtre" demandé (voir CLAUDE.md/prompt d'origine), pas un mécanisme
  // séparé par voix.
  function currentMundaneMuffleAmount() {
    if (mundaneMuffleRampFrom === mundaneMuffleRampTo) return mundaneMuffleRampTo;
    const progress = clamp((performance.now() - mundaneMuffleRampStartedAt) / PERCEPTION_FADE_MS, 0, 1);
    return mundaneMuffleRampFrom + (mundaneMuffleRampTo - mundaneMuffleRampFrom) * progress;
  }

  // Amount effectif (0..1) d'UNE entrée donnée : forcedMuffle (RECTO/VERSO,
  // l'AUTRE face — TOUJOURS 1, fixe, voir updateIntermittentSources/
  // updateEntityMovementSounds ci-dessous) prime sur tout le reste ; sinon
  // une entité SURNATURELLE (perceptionGated) n'est JAMAIS étouffée par ce
  // mécanisme (elle émerge pleine et claire, voir isPerceptionGated) ;
  // sinon la rampe mondaine courante s'applique. Les deux mécanismes de
  // filtre d'étouffement (RECTO/VERSO fixe, PERCEPTION progressif)
  // partagent la MÊME primitive de rendu (playPositionedOneShot/muffled,
  // sound.setCutoff côté balise continue), jamais deux implémentations
  // parallèles — seule la VALEUR appliquée diffère.
  function effectiveMuffleAmount(entry, forcedMuffle) {
    if (forcedMuffle > 0) return forcedMuffle;
    if (entry.perceptionGated) return 0;
    return currentMundaneMuffleAmount();
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
      entityLayer: true,
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
    playOneShot(resolveAsset(path), {
      reverbSend: FOOTSTEP_REVERB_SEND,
      reverbBusInput: reverbBus.input,
      volume: footstepVolumeFactor(),
      entityLayer: true,
    });
  }

  // Pas du joueur pendant une TRANSITION recto/verso (voir
  // entities/types/passage.js, view/city-screen.js/sideSwitchEffect) — MÊME
  // résolution de chemin que playFootstep (resolveFootstepPath), mais joués
  // MÉTA : AUCUN reverbSend/reverbBusInput, AUCUN entityLayer (voir
  // doc/scripting.md/"playSound", même vocabulaire "diégétique vs méta") —
  // ils représentent le joueur qui marche, pas un son de l'une ou l'autre
  // face, donc jamais routés par le bus de réverb de la scène ni par ses
  // rampes d'occlusion (mundaneMuffleRamp, crossfadeFaceSwap) : audibles
  // nets, quel que soit l'état d'étouffement des faces pendant le
  // croisement.
  function playMetaFootstepAt(world, atX, gait) {
    const path = resolveFootstepPath(world, atX, { gait, naturalWalk: player.naturalWalk, ownPath: MOVEMENT_SOUND.path });
    playOneShot(resolveAsset(path), { volume: footstepVolumeFactor() });
  }

  // Pas de TRAJET — cadencés sur TRANSITION_STEP_INTERVAL_MS pendant `durationMs`
  // (voir view/city-screen.js/sideSwitchEffect, appelé EN PARALLÈLE du
  // croisement de filtres, jeu déjà gelé) : ni stepWalker (basé sur une
  // DISTANCE parcourue — le joueur ne bouge pas physiquement pendant le
  // sas, `x` ne change qu'après switchSide) ni le tick de jeu (gelé, voir
  // crossfadeFaceSwap) ne conviennent ici — un simple `setTimeout` par pas,
  // comme le reste de la séquence du sas (rampEntityLayerGain,
  // Howler.fade()) tourne sur l'horloge murale, pas le tick. Surface : celle
  // déclarée par le passage (transitionSurface) SINON celle de la face de
  // DÉPART (`??`, pas `||` : un nom de surface ne peut jamais être "faux" au
  // sens JS, mais reste correct par prudence) — jamais "au point x", cette
  // surface est fixe pour toute la traversée. `transitionSteps` (cascade
  // instance -> archétype -> défaut true, comme `highlight`) désactivé ->
  // silence total, aucun pas de trajet.
  function playTransitionSteps(entity, durationMs) {
    if (!resolveTuning("transitionSteps", entity)) return;
    const departureFace = getActiveWorld(getSession());
    const surfaceName = resolveTuning("transitionSurface", entity) ?? departureFace.defaultSurface;
    const transitWorld = { defaultSurface: surfaceName, segments: [] };
    const gait = gaitOf(getSession().equipment);
    const stepCount = Math.max(1, Math.round(durationMs / TRANSITION_STEP_INTERVAL_MS));
    for (let i = 0; i < stepCount; i++) {
      setTimeout(() => playMetaFootstepAt(transitWorld, 0, gait), (i * durationMs) / stepCount);
    }
  }

  // Pas d'ARRIVÉE — UN SEUL, joué APRÈS switchSide (voir l'appelant : la
  // session porte déjà la NOUVELLE face active, donc getActiveWorld ici
  // EST la face de destination) sur la surface RÉELLE du point
  // d'atterrissage (surfaceAt, via resolveFootstepPath) — contraste net si
  // elle diffère de celle du trajet (ex. pavé -> herbe), le signal "je pose
  // le pied de l'autre côté". Même flag `transitionSteps` que le trajet
  // (désactivé -> aucun pas d'arrivée non plus, jamais l'un sans l'autre).
  function playArrivalStep(entity, arrivalX) {
    if (!resolveTuning("transitionSteps", entity)) return;
    const destinationFace = getActiveWorld(getSession());
    const gait = gaitOf(getSession().equipment);
    playMetaFootstepAt(destinationFace, arrivalX, gait);
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
  // touche jamais au passe-BAS de distance (voir le header du fichier).
  // gain (défaut 1) : facteur propre optionnel (ex. beaconGain/vocalGain/
  // movementGain) ; pitchVariation (défaut 0) : voir randomRate.
  // highpassHz/heightGain (défauts undefined/1, voir
  // resolveIntermittentSource) : chaîne de filtres "hauteur suggérée"
  // (isFlying) — undefined -> aucun filtre tenté, 1 -> aucun effet sur le
  // volume, chemin STRICTEMENT inchangé pour toute entité non volante.
  // muffled (défaut 0, NUMÉRIQUE — voir RECTO/VERSO étape 2/2 ET perception
  // surnaturelle, effectiveMuffleAmount plus haut) : 0..1, jamais un simple
  // booléen — DEUX appelants distincts partagent CETTE MÊME primitive avec
  // des besoins différents : l'AUTRE face (RECTO/VERSO) passe toujours 1
  // (fixe, comportement HISTORIQUE inchangé), la perception surnaturelle
  // passe la rampe COURANTE (0..1, voir currentMundaneMuffleAmount) — un
  // one-shot ne peut pas être modulé APRÈS son déclenchement (trop court
  // pour une automation continue), donc c'est la PROPORTION de gain
  // retirée à CE déclenchement précis qui porte le fondu, observable au fil
  // d'une SÉQUENCE de one-shots pendant la rampe. Position (pan/distance)
  // toujours INCHANGÉE (directionnel comme tout le reste) ; passe-bas
  // (MUFFLING_LOWPASS_HZ) engagé dès que muffled > 0 (porte binaire — seul
  // le GAIN interpole continûment, le passe-bas reste la même fréquence
  // fixe quelle que soit l'intensité, voir header du fichier) ; composable
  // avec highpassHz/heightGain (une entité isFlying étouffée cumule les
  // deux chaînes, voir lib/audio.js). cacheKey DISTINCT dès que muffled > 0 :
  // le MÊME fichier joué normalement ailleurs (face courante, hors
  // perception) ne doit jamais partager sa chaîne de filtres avec sa
  // version étouffée (voir lib/audio.js/ensureOneShot).
  function playPositionedOneShot(
    path,
    {
      relX,
      audibleRange,
      panSaturation,
      reverbSend,
      volumeFactor,
      gain = 1,
      pitchVariation = 0,
      highpassHz,
      heightGain = 1,
      muffled = 0,
      highlighted = false,
    }
  ) {
    const dist = Math.abs(relX);
    const pan = clamp(relX / panSaturation, -1, 1);
    let volume = volumeForDistance(dist, audibleRange, highlighted) * volumeFactor * gain * heightGain;
    if (muffled > 0) volume *= 1 - muffled * (1 - MUFFLING_GAIN);
    const resolved = resolveAsset(path);
    playOneShot(resolved, {
      reverbSend,
      reverbBusInput: reverbBus.input,
      volume,
      stereo: pan,
      rate: randomRate(pitchVariation),
      highpassHz,
      lowpassHz: muffled > 0 ? MUFFLING_LOWPASS_HZ : undefined,
      cacheKey: muffled > 0 ? `muffled:${resolved}` : undefined,
      entityLayer: true,
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
  function playTransitionSound(entry, relX, transitionSound, muffled = 0) {
    playPositionedOneShot(transitionSound.path, {
      relX,
      audibleRange: entry.audibleRange,
      panSaturation: entry.panSaturation,
      reverbSend: transitionSound.reverbSend,
      volumeFactor: beaconVolumeFactor(),
      gain: transitionSound.gain,
      pitchVariation: transitionSound.pitchVariation,
      muffled,
      highlighted: entry.highlight && Math.abs(relX) <= entry.interactRange,
    });
  }

  // Son PONCTUEL positionné sur une entité ARBITRAIRE, ID fourni par
  // l'appelant — voir view/interaction.js/runEffects, effet "playSound"
  // DIÉGÉTIQUE (core/scripting.md/"Effets d'action"). RÉUTILISE
  // playTransitionSound TEL QUEL : AUCUNE nouvelle logique de
  // filtrage/positionnement, seulement une RECHERCHE de l'entrée déjà
  // construite pour cette entité (entitySounds pour la face courante, PUIS
  // otherEntitySounds pour l'AUTRE face si absente de la première —
  // forcedMuffle 0 ou 1 respectivement, MÊME convention que
  // updateIntermittentSources/update() plus bas) + sa position LIVE relue
  // fraîche (comme tout le reste de ce module, jamais mise en cache).
  // `descriptor` (l'effet brut {path,gain?,pitchVariation?,reverbSend?},
  // voir core/effects.js) est d'abord RÉSOLU via resolveTransitionSound
  // (PLAY_SOUND_TUNING_KEYS, voir plus haut) — un playSound diégétique
  // reçoit ainsi EXACTEMENT la même cascade de tuning qu'un enterSound/
  // exitSound (donc qu'un son positionné d'entité en général), jamais un
  // second mécanisme de résolution parallèle : un champ non déclaré (ex.
  // reverbSend) retombe sur le défaut de l'entité/de l'archétype/global,
  // jamais sur `undefined` silencieux. Entité introuvable (id jamais
  // construit par buildEntitySoundEntry) ou actuellement dormante
  // (present:false, core/presence.js) -> silencieuse, `console.warn`,
  // jamais un plantage — même politique défensive que tout son de ce
  // projet.
  function playEntityOneShot(targetId, descriptor) {
    const session = getSession();
    const activeEntry = entitySounds.find((e) => e.entity.id === targetId);
    if (activeEntry) {
      const liveEntity = getActiveWorld(session).entities.find((e) => e.id === targetId);
      if (!liveEntity || liveEntity.present === false) {
        console.warn(`city-scene: playEntityOneShot("${targetId}") : entité dormante ou introuvable.`);
        return;
      }
      const resolved = resolveTransitionSound(activeEntry.entity, descriptor, PLAY_SOUND_TUNING_KEYS);
      playTransitionSound(activeEntry, liveEntity.x - session.player.x, resolved, effectiveMuffleAmount(activeEntry, 0));
      return;
    }
    const otherEntry = otherEntitySounds && otherEntitySounds.find((e) => e.entity.id === targetId);
    if (otherEntry) {
      const otherFace = getInactiveFace(session);
      const liveEntity = otherFace && otherFace.entities.find((e) => e.id === targetId);
      if (!liveEntity || liveEntity.present === false) {
        console.warn(`city-scene: playEntityOneShot("${targetId}") : entité dormante ou introuvable (autre face).`);
        return;
      }
      const resolved = resolveTransitionSound(otherEntry.entity, descriptor, PLAY_SOUND_TUNING_KEYS);
      playTransitionSound(otherEntry, liveEntity.x - session.player.x, resolved, effectiveMuffleAmount(otherEntry, 1));
      return;
    }
    console.warn(`city-scene: playEntityOneShot("${targetId}") : id absent de la scène.`);
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
  // entries/forcedMuffle : paramétrés depuis update() — DEUX appelants
  // partagent CE mécanisme, jamais deux implémentations parallèles : l'AUTRE
  // face (RECTO/VERSO, otherEntitySounds, forcedMuffle:1 — fixe,
  // comportement STRICTEMENT inchangé) ET la face courante (entitySounds,
  // forcedMuffle:0 par défaut — muffle PAR ENTRÉE via effectiveMuffleAmount,
  // qui exempte les entités surnaturelles et applique la rampe de
  // perception aux autres, voir plus haut).
  function updateIntermittentSources(entries, x, liveById, forcedMuffle = 0) {
    const now = performance.now();
    const volumeFactor = beaconVolumeFactor();
    for (const entry of entries) {
      // Dormante (voir core/presence.js) : aucun déclenchement, ET aucune
      // replanification — src.nextAt reste tel quel, gelé jusqu'au retour
      // en présence (voir le header du fichier, "comme si absente").
      if (liveById.get(entry.entity.id).present === false) continue;
      const muffled = effectiveMuffleAmount(entry, forcedMuffle);
      for (const src of entry.intermittentSources) {
        if (now < src.nextAt) continue;

        playPositionedOneShot(src.path, {
          relX: liveById.get(entry.entity.id).x - x,
          audibleRange: entry.audibleRange,
          panSaturation: entry.panSaturation,
          reverbSend: src.reverbSend,
          volumeFactor,
          gain: src.gain,
          pitchVariation: src.pitchVariation,
          highpassHz: src.highpassHz,
          heightGain: src.heightGain,
          muffled,
          highlighted: entry.highlight && Math.abs(liveById.get(entry.entity.id).x - x) <= entry.interactRange,
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
  // entries/forcedMuffle : voir updateIntermittentSources ci-dessus, même
  // principe de paramétrage pour éviter deux implémentations parallèles.
  function updateEntityMovementSounds(entries, x, world, liveById, forcedMuffle = 0) {
    const volumeFactor = footstepVolumeFactor();

    for (const entry of entries) {
      if (!entry.movementPath) continue;
      const live = liveById.get(entry.entity.id);
      // Dormante (voir core/presence.js) : aucun pas — cohérent avec le
      // core, qui ne tique déjà plus son comportement/mouvement (voir
      // core/reduce.js/stepEntities) : liveX resterait de toute façon
      // figé, mais on l'évite explicitement plutôt que d'en dépendre.
      if (live.present === false) continue;

      const muffled = effectiveMuffleAmount(entry, forcedMuffle);
      stepWalker(entry.walker, live.x, entry.movementStepDistance, (atX) => {
        const path = resolveFootstepPath(world, atX, {
          gait: entry.gait,
          naturalWalk: entry.naturalWalk,
          ownPath: entry.movementPath,
        });
        playPositionedOneShot(path, {
          relX: atX - x,
          audibleRange: entry.audibleRange,
          panSaturation: entry.panSaturation,
          reverbSend: entry.movementReverbSend,
          volumeFactor,
          gain: entry.movementGain,
          pitchVariation: entry.movementPitchVariation,
          muffled,
          highlighted: entry.highlight && Math.abs(atX - x) <= entry.interactRange,
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

  // Équivalent pour l'AUTRE face (voir liveEntitiesById ci-dessus, MÊME
  // principe) — `otherFace.entities` au lieu de getActiveWorld (jamais de
  // compagnons, voir getInactiveFace) ; `otherEntitySounds` au lieu
  // d'entitySounds. Appelée seulement si otherFace existe (scène à deux
  // faces, voir update()).
  function liveOtherEntitiesById(otherFace) {
    const byId = new Map(otherFace.entities.map((entity) => [entity.id, entity]));
    for (const { entity } of otherEntitySounds) {
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
      const { entity, sound, audibleRange, panSaturation, interactRange, highlight, cutoffMin, cutoffMax, beaconGain, flyingHighpassHz, flyingVolumeFactor } =
        entry;
      const live = liveById.get(entity.id);
      const relX = live.x - x;
      const dist = Math.abs(relX);
      // Perception surnaturelle (voir effectiveMuffleAmount plus haut) :
      // toujours 0 (aucun effet) pour une entité surnaturelle (perceptionGated) —
      // jamais étouffée par le mécanisme qui la révèle.
      const muffled = effectiveMuffleAmount(entry, 0);

      if (live.presenceChanged === "exited") {
        if (entry.exitSound) playTransitionSound(entry, relX, entry.exitSound, muffled);
        if (sound) sound.stop();
      } else if (live.presenceChanged === "entered") {
        if (entry.enterSound) playTransitionSound(entry, relX, entry.enterSound, muffled);
        if (sound) sound.resume();
      }

      if (!sound || live.present === false) continue;

      // Pan inchangé : toujours dérivé de panSaturation, indépendant du volume.
      const pan = clamp(relX / panSaturation, -1, 1);
      // flyingVolumeFactor : neutre (1) pour toute entité non isFlying,
      // voir buildEntitySoundEntry — aucun effet sur le volume dans ce cas.
      let volume =
        volumeForDistance(dist, audibleRange, highlight && dist <= interactRange) *
        beaconFactor *
        beaconGain *
        flyingVolumeFactor;
      // Filtre d'étouffement des entités MONDAINES (voir
      // effectiveMuffleAmount/currentMundaneMuffleAmount plus haut) :
      // volume interpolé CONTINÛMENT (0..1, le fondu demandé), passe-bas
      // interpolé linéairement vers MUFFLING_LOWPASS_HZ — se COMPOSE avec
      // le passe-bas de distance ci-dessous (cutoffForDistance), jamais à
      // sa place : une entité mondaine proche ET en pleine perception
      // s'étouffe quand même progressivement.
      if (muffled > 0) volume *= 1 - muffled * (1 - MUFFLING_GAIN);
      sound.update(pan, volume);
      // Passe-bas : se superpose au volume/pan, ne les remplace pas.
      let cutoff = cutoffForDistance(dist, interactRange, audibleRange, cutoffMin, cutoffMax);
      if (muffled > 0) cutoff = cutoff * (1 - muffled) + MUFFLING_LOWPASS_HZ * muffled;
      sound.setCutoff(cutoff);
      // Passe-haut "hauteur suggérée" (voir entities/model.md, isFlying) :
      // EN PLUS du passe-bas ci-dessus, jamais à sa place — setHighpass
      // n'est appelé QUE pour une entité isFlying (flyingHighpassHz reste
      // undefined sinon), aucune autre entité n'y touche jamais.
      if (entity.isFlying) sound.setHighpass(flyingHighpassHz);
    }
  }

  // Bascules de présence de l'AUTRE face (RECTO/VERSO étape 2/2) —
  // enterSound/exitSound UNIQUEMENT, en ÉTOUFFÉ : jamais de balise continue
  // à entretenir ici (`sound` reste toujours null pour une entrée étouffée,
  // voir buildEntitySoundEntry/includeBeacon), donc pas d'équivalent au
  // reste d'applyEntityAudio ci-dessus — seule la détection de bascule
  // (live.presenceChanged, posée par le core comme pour la face courante)
  // est reprise à l'identique.
  function applyMuffledPresenceTransitions(x, otherLiveById) {
    for (const entry of otherEntitySounds) {
      const live = otherLiveById.get(entry.entity.id);
      const relX = live.x - x;
      if (live.presenceChanged === "exited" && entry.exitSound) {
        playTransitionSound(entry, relX, entry.exitSound, 1);
      } else if (live.presenceChanged === "entered" && entry.enterSound) {
        playTransitionSound(entry, relX, entry.enterSound, 1);
      }
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
    // "on agit sur la TRANSITION, pas en continu"). Redéclare simplement la
    // couche DE LIEU avec la nouvelle identité (voir lib/audio.js/
    // setMusicLayer) — NO-OP si la couche D'ÉTAT (perception) a déjà la
    // main sur le canal, sinon fondu vers la nouvelle phase (ou silence si
    // la phase suivante n'a pas de musique déclarée).
    const phase = phaseAt(session.time);
    if (phase !== currentPhase) {
      currentPhase = phase;
      setMusicLayer(
        "location",
        resolveMusicForPhase(world, currentPhase),
        { pickPath: pickMusicPath(world, currentPhase), loop: musicLoop, breatherRange: MUSIC_BREATHER_RANGE },
        MUSIC_FADE_MS
      );
      // Annonce d'ambiance (non-assertive, comme la météo plus bas) : ne
      // coupe pas la parole en cours, s'insère entre deux pauses.
      announce(t(currentPhase === "night" ? "time.phase.nightBegins" : "time.phase.dayBegins"));
    }

    // Bascule de PERCEPTION SURNATURELLE (voir core/state.js/
    // togglePerception, view/city-screen.js) : même principe EXACT que la
    // bascule de phase ci-dessus (compare à la valeur MÉMORISÉE, agit
    // SEULEMENT sur la différence) — redéclare la couche D'ÉTAT
    // (musique+ambiance), voir lib/audio.js/setMusicLayer/setAmbienceLayer :
    // NO-OP si l'identité surnaturelle est déjà celle qui joue (continuité,
    // ex. un toggle qui retrouve exactement ce qui tournait déjà), sinon
    // fondu vers/depuis les pools surnaturels. PLUS démarrage de la rampe
    // du filtre d'étouffement mondain (mundaneMuffleRampFrom/To/StartedAt,
    // lue en continu par applyEntityAudio/updateIntermittentSources/
    // updateEntityMovementSounds via effectiveMuffleAmount, JAMAIS
    // recalculée ici après ce point — c'est currentMundaneMuffleAmount qui
    // l'anime tick après tick). from = la valeur COURANTE de la rampe
    // (jamais figée à 0/1) : un re-toggle en cours de fondu repart
    // proprement d'où il en est, sans saut.
    if (session.perceptionActive !== perceptionActive) {
      perceptionActive = session.perceptionActive;
      mundaneMuffleRampFrom = currentMundaneMuffleAmount();
      mundaneMuffleRampTo = perceptionActive ? 1 : 0;
      mundaneMuffleRampStartedAt = performance.now();

      setMusicLayer("state", perceptionActive ? PERCEPTION_MUSIC_POOL : null, musicStateParams, PERCEPTION_FADE_MS);
      setAmbienceLayer(
        "state",
        perceptionActive ? [PERCEPTION_AMBIENCE_POOL] : null,
        perceptionActive ? [resolveAsset(PERCEPTION_AMBIENCE_POOL)] : null,
        PERCEPTION_FADE_MS
      );
    }

    // Transition MÉTÉO (voir core/weather.js/advanceWeather, ou un forçage
    // debug — view/menus/debug-weather-menu.js) : même principe EXACT que
    // la bascule de phase/perception ci-dessus, compare à la valeur
    // MÉMORISÉE, agit SEULEMENT sur la différence — redéclare la couche
    // météo (voir declareWeatherAmbience plus haut), NO-OP si le nouvel
    // état météo n'apporte aucune ambience (silence -> silence) ou la MÊME
    // ambience qu'avant (continuité par identité, voir lib/audio.js/
    // syncAmbienceLayers, diffing PAR COUCHE — SEULE la couche météo est
    // évaluée ici, le lieu n'est jamais touché), sinon fondu vers/depuis le
    // pool météo, SUPERPOSÉ à la couche gagnante (jamais à sa place).
    if (session.weather.state !== weatherState) {
      const previousWeatherState = weatherState;
      weatherState = session.weather.state;
      declareWeatherAmbience(weatherState, WEATHER_AMBIENCE_FADE_MS);
      // Annonce d'ambiance (non-assertive) : message COMPOSÉ fin/début, voir
      // composeWeatherTransitionMessage plus haut — jamais coupée par cette
      // transition, s'insère entre deux pauses de parole.
      announce(composeWeatherTransitionMessage(previousWeatherState, weatherState));
    }

    applyEntityAudio(x);

    // Une seule photo des entités vivantes pour le reste du tick (occupation
    // + les deux sons ponctuels ci-dessous) : la session ne change pas entre
    // ces appels, inutile de la reconstruire trois fois.
    const liveById = liveEntitiesById();
    updateIntermittentSources(entitySounds, x, liveById);
    updateEntityMovementSounds(entitySounds, x, world, liveById);

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

    // --- RECTO/VERSO étape 2/2 : rendu ÉTOUFFÉ de l'AUTRE face, si la
    // scène en a une (voir CLAUDE.md/"RECTO/VERSO", core/state.js/
    // getInactiveFace). Le core la tique déjà (voir core/reduce.js/TICK,
    // isolée) — ICI, on ne fait QUE l'ENTENDRE : aucun beacon (jamais
    // construit, voir includeBeacon), aucune occupation/interaction (jamais
    // lue par occupiedEntities/getInteractionCandidates, qui ne connaissent
    // QUE entitySounds). otherWorld relu à CHAQUE tick (jamais figé au
    // montage), exactement comme `world` ci-dessus pour la face courante.
    if (otherEntitySounds) {
      const otherWorld = getInactiveFace(session);
      syncNewOtherEntitySounds(otherWorld);
      const otherLiveById = liveOtherEntitiesById(otherWorld);
      applyMuffledPresenceTransitions(x, otherLiveById);
      updateIntermittentSources(otherEntitySounds, x, otherLiveById, 1);
      updateEntityMovementSounds(otherEntitySounds, x, otherWorld, otherLiveById, 1);
    }
  }

  function destroy() {
    // sound absent (pas de beacon continu) : rien à arrêter, ses one-shots
    // se terminent d'eux-mêmes (mêmes Howl partagés que playOneShot ailleurs).
    for (const { sound } of entitySounds) {
      if (sound) sound.stop(); // nettoie aussi son propre envoi de réverb
    }
    reverbBus.destroy();
    // Musique/ambiance NE SONT PLUS touchées ici (voir lib/audio.js/
    // "Couches persistantes MUSIQUE/AMBIANCE") : elles vivent au niveau
    // MODULE, indépendamment du cycle de vie de CETTE scène — une
    // transition de lieu (voir view/city-screen.js/performTransition) NE
    // DOIT PAS interrompre ce qui continue légitimement (couche d'état en
    // cours, ou couche de lieu identique déclarée par la scène suivante).
    // C'est le MONTAGE de la scène SUIVANTE (createCityAudioScene) qui
    // compare et décide — jamais destroy(), qui ne sait pas ce qui vient
    // après. Pour une sortie RÉELLE de partie (retour au menu principal,
    // aucune scène suivante), voir stopPersistentAudioLayers ci-dessous —
    // SEUL appelant, view/city-screen.js/onExit.
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
  // — voir lib/audio.js/GLOBAL_CHANNELS). Utilisé par les menus qui
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

  // Croise les filtres d'occlusion des DEUX faces pendant une bascule
  // recto/verso (voir view/city-screen.js/sideSwitchEffect, appelé DANS le
  // sas de transition — jeu gelé, voir sa propre séquence) : la face
  // COURANTE ferme son filtre (nette -> étouffée), l'AUTRE ouvre le sien
  // (étouffée -> nette), EN PARALLÈLE — contrairement au sas de TRANSITION
  // DE SCÈNE (rampEntityLayerGain, fondu vers le SILENCE), les deux faces
  // restent AUDIBLES tout du long : c'est un ÉCHANGE de clarté, jamais une
  // disparition. Position (x, pan/distance) gelée sur la position ACTUELLE
  // du joueur pour toute la durée du croisement : le repositionnement sur
  // l'autre face n'a lieu qu'APRÈS (voir l'appelant) — les deux faces
  // partagent déjà le même axe x pour le rendu étouffé existant, même
  // convention ici.
  //
  // Balises TEMPORAIRES pour les entités à balise CONTINUE de l'AUTRE face
  // (normalement EXCLUES, voir buildEntitySoundEntry/includeBeacon — "on ne
  // LOCALISE jamais l'autre face") : construites ICI, SEULEMENT le temps de
  // ce croisement, pour avoir quelque chose à ouvrir en filtre — arrêtées
  // À LA FIN (voir le .then() ci-dessous), avant même que l'appelant ne
  // détruise/reconstruise la scène (qui, elle, ignore tout de ces voix
  // temporaires, jamais ajoutées à otherEntitySounds). Scène simple
  // (otherEntitySounds null) -> rien à croiser, résolution immédiate.
  //
  // Rampes via Howler.fade()/AudioParam natif (lib/audio.js/
  // fadeVolume/rampCutoff), PAS le mécanisme JS par relecture périodique du
  // toggle surnaturel (mundaneMuffleRampFrom/To, plus haut) : ce croisement
  // tourne PENDANT le sas, jeu gelé — aucun tick pour relire une rampe JS,
  // même raisonnement que rampEntityLayerGain (lib/audio.js).
  function crossfadeFaceSwap(durationMs) {
    if (!otherEntitySounds) return Promise.resolve();

    const session = getSession();
    const x = session.player.x;
    const beaconFactor = beaconVolumeFactor();
    const liveById = liveEntitiesById();
    const otherWorld = getInactiveFace(session);
    const otherLiveById = liveOtherEntitiesById(otherWorld);

    // Face COURANTE : ferme le filtre de chaque balise continue, depuis SA
    // position réelle (recalculée ici pour repartir exactement d'où le
    // dernier tick l'avait laissée) vers l'état étouffé — MÊME formule que
    // applyEntityAudio, juste évaluée une fois plutôt qu'à chaque tick.
    for (const entry of entitySounds) {
      if (!entry.sound) continue;
      const live = liveById.get(entry.entity.id);
      if (!live || live.present === false) continue;
      const relX = live.x - x;
      const pan = clamp(relX / entry.panSaturation, -1, 1);
      const dist = Math.abs(relX);
      const openVolume =
        volumeForDistance(dist, entry.audibleRange, entry.highlight && dist <= entry.interactRange) *
        beaconFactor *
        entry.beaconGain *
        entry.flyingVolumeFactor;
      const openCutoff = cutoffForDistance(dist, entry.interactRange, entry.audibleRange, entry.cutoffMin, entry.cutoffMax);
      entry.sound.update(pan, openVolume);
      entry.sound.setCutoff(openCutoff);
      entry.sound.fadeVolume(openVolume * MUFFLING_GAIN, durationMs);
      entry.sound.rampCutoff(MUFFLING_LOWPASS_HZ, durationMs);
    }

    // Face AUTRE : balises TEMPORAIRES (voir header), démarrées DÉJÀ
    // étouffées (cohérent avec la coexistence déjà en place pour cette
    // face), ouvertes vers l'état net.
    const temporarySounds = [];
    for (const entry of otherEntitySounds) {
      const live = otherLiveById.get(entry.entity.id);
      if (!live || live.present === false) continue; // dormante : rien à faire entendre

      const rebuilt = buildEntitySoundEntry(entry.entity, otherWorld, session.time, session.perceptionActive, session.weather.state, {
        includeBeacon: true,
        disableStagger: true,
      });
      if (!rebuilt.sound) continue; // pas de balise continue pour ce type/mode (intermittente ou absente)

      const relX = live.x - x;
      const pan = clamp(relX / entry.panSaturation, -1, 1);
      const dist = Math.abs(relX);
      const openVolume =
        volumeForDistance(dist, entry.audibleRange, entry.highlight && dist <= entry.interactRange) *
        beaconFactor *
        rebuilt.beaconGain *
        entry.flyingVolumeFactor;
      const openCutoff = cutoffForDistance(dist, entry.interactRange, entry.audibleRange, entry.cutoffMin, entry.cutoffMax);
      rebuilt.sound.update(pan, openVolume * MUFFLING_GAIN);
      rebuilt.sound.setCutoff(MUFFLING_LOWPASS_HZ);
      rebuilt.sound.fadeVolume(openVolume, durationMs);
      rebuilt.sound.rampCutoff(openCutoff, durationMs);
      temporarySounds.push(rebuilt.sound);
    }

    return new Promise((resolve) => setTimeout(resolve, durationMs)).then(() => {
      for (const sound of temporarySounds) sound.stop();
    });
  }

  const api = {
    update,
    destroy,
    getInteractionCandidates,
    pauseBeacons,
    resumeBeacons,
    refreshBeaconVolumes,
    crossfadeFaceSwap,
    playEntityOneShot,
    playTransitionSteps,
    playArrivalStep,
  };
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

// Arrête POUR DE BON les couches persistantes musique/ambiance (voir
// lib/audio.js/clearMusicLayers/clearAmbienceLayers) — pour une sortie
// RÉELLE de partie (retour au menu principal, voir
// view/city-screen.js/onExit), où il n'y a JAMAIS de scène suivante pour
// reprendre ce qui continuait. Distinct de destroy() (méthode de la
// scène) : celui-ci ne touche plus jamais music/ambiance (voir son
// commentaire), c'est ICI, explicitement, que la partie se termine
// vraiment pour elles aussi.
export function stopPersistentAudioLayers() {
  clearMusicLayers(MUSIC_FADE_MS);
  clearAmbienceLayers(MUSIC_FADE_MS);
}
