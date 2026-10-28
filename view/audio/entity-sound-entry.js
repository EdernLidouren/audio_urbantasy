// ENTRÉE SONORE d'une entité : tout ce que la scène audio doit savoir d'elle,
// résolu UNE fois (rôles de son, portées, réglages en cascade, balise
// continue créée le cas échéant). Une seule construction pour le montage de
// la scène, les entités apparues en cours de jeu et les balises temporaires
// d'une bascule de face.
//
// Rôles positionnés (voir doc/entity-model.md, "Beacon vs vocal") :
//   - beacon (LOCALISATION) : continu (une voix persistante qui suit le
//     joueur) ou intermittent (sons ponctuels réguliers) ;
//   - vocal (EXPRESSION) : toujours intermittent, à intervalle long et
//     variable, pour peupler l'ambiance ;
//   - enterSound/exitSound : ponctuels, à une bascule de présence ;
//   - approachSound/leaveSound : ponctuels, quand le joueur entre dans la
//     zone d'interaction ou en sort ; proximityLoop : boucle tant qu'il y
//     reste (voir ./proximity-sounds.js) ;
//   - movement : les pas d'une entité mobile.
// Tous optionnels et indépendants.
//
// Aléa de RENDU (Math.random, jamais le PRNG seedé du core) : intervalles,
// variation de hauteur, délai de démarrage — de la présentation pure, sans
// effet sur l'état de partie (voir doc/entity-model.md, "Déterminisme et
// rendu audio").

import { createPositionedSound, randomRate } from "../../lib/audio.js";
import { resolveAsset } from "../../lib/assets.js";
import registry from "../../entities/types/index.js";
import { TUNING_DEFAULTS, resolveTuning } from "../../config/tuning.js";
import { isPresent, presenceContextOf } from "../../core/presence.js";
import { STEP_DISTANCE, createWalkerState } from "./footsteps.js";

// Délai de démarrage aléatoire des balises continues : désempile les
// attaques de balises créées dans la même fenêtre (montage, apparitions
// groupées). Fourchette partagée, jamais résolue par entité.
const BEACON_STAGGER_MIN_MS = TUNING_DEFAULTS.beaconStaggerMinMs;
const BEACON_STAGGER_MAX_MS = TUNING_DEFAULTS.beaconStaggerMaxMs;

function drawBeaconStaggerDelayMs() {
  return BEACON_STAGGER_MIN_MS + Math.random() * (BEACON_STAGGER_MAX_MS - BEACON_STAGGER_MIN_MS);
}

// Clés de cascade propres à chaque rôle : seule différence entre un beacon
// intermittent et un vocal, qui partagent le même mécanisme de
// déclenchement (voir ./entity-audio.js/updateIntermittentSources).
const BEACON_TUNING_KEYS = { interval: "beaconInterval", intervalVariation: "beaconIntervalVariation", gain: "beaconGain" };
const VOCAL_TUNING_KEYS = { interval: "vocalInterval", intervalVariation: "vocalIntervalVariation", gain: "vocalGain" };
const ENTER_SOUND_TUNING_KEYS = { gain: "enterSoundGain" };
const EXIT_SOUND_TUNING_KEYS = { gain: "exitSoundGain" };
const APPROACH_SOUND_TUNING_KEYS = { gain: "approachSoundGain" };
const LEAVE_SOUND_TUNING_KEYS = { gain: "leaveSoundGain" };
const PROXIMITY_LOOP_TUNING_KEYS = { gain: "proximityLoopGain" };

// Effet "playSound" diégétique (voir ./oneshots.js/playEntityOneShot) :
// résolu comme un enterSound/exitSound, avec la clé de gain littérale "gain"
// (aucun défaut global : le gain neutre 1 s'applique alors). Un champ non
// déclaré (reverbSend...) suit la cascade de l'entité, comme tout son
// positionné.
export const PLAY_SOUND_TUNING_KEYS = { gain: "gain" };

// Clés de gain des rôles qu'un effet "playSound" peut jouer par `role`
// (voir core/script-parse.js/PLAY_SOUND_ROLES).
const ROLE_TUNING_KEYS = {
  vocal: VOCAL_TUNING_KEYS,
  enterSound: ENTER_SOUND_TUNING_KEYS,
  exitSound: EXIT_SOUND_TUNING_KEYS,
  approachSound: APPROACH_SOUND_TUNING_KEYS,
  leaveSound: LEAVE_SOUND_TUNING_KEYS,
};

// Effet "playSound" par `role` : le son de CE rôle de l'entité, résolu avec
// ses propres réglages (cascade son -> instance -> archétype -> défaut,
// clé de gain du rôle). Les champs de l'effet s'y ajoutent : `gain` en
// FACTEUR du gain du rôle, `pitchVariation`/`reverbSend` en remplacement.
// Rôle absent de l'entité -> null (l'appelant avertit).
export function resolveRoleSound(entity, effect) {
  const descriptor = entity.sounds && entity.sounds[effect.role];
  if (!descriptor) return null;
  const resolved = resolveTransitionSound(entity, descriptor, ROLE_TUNING_KEYS[effect.role]);
  return {
    ...resolved,
    gain: resolved.gain * (effect.gain ?? 1),
    pitchVariation: effect.pitchVariation ?? resolved.pitchVariation,
    reverbSend: effect.reverbSend ?? resolved.reverbSend,
  };
}

// Cœur commun d'un descripteur de son : gain, pitchVariation et reverbSend,
// résolus en cascade (son -> instance -> archétype -> défaut global, voir
// config/tuning.js/resolveTuning). `gainKey` est la seule clé qui varie par
// rôle. `useFlyingReverbSend` : seuls les rôles beacon/vocal remplacent
// reverbSend par flyingReverbSend pour une entité isFlying.
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

// Source INTERMITTENTE (beacon intermittent ou vocal) : chemin, cadence et
// cœur commun. isFlying ajoute la chaîne "hauteur suggérée" (passe-haut et
// facteur de volume), neutre sinon. `nextAt` (relu et réécrit à chaque tick)
// part de 0 : premier déclenchement dès le premier tick.
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
    // SUIVI (défaut) ou ANCRÉ, même sémantique que l'effet playSound (voir
    // doc/scripting.md/"playSound"/`tracked`).
    tracked: descriptor.tracked !== false,
    nextAt: 0,
  };
}

// Son PONCTUEL positionné (enterSound/exitSound, playSound) : chemin + cœur
// commun. Descripteur absent -> null.
export function resolveTransitionSound(entity, descriptor, keys) {
  if (!descriptor) return null;
  return { path: descriptor.path, ...resolveSoundSettings(entity, descriptor, keys.gain) };
}

// Une condition EXIGE-t-elle la perception, seule ou dans un "allOf" à
// n'importe quelle profondeur ? "not" n'est jamais parcouru : { not:
// perceptionActive } décrit une entité MONDAINE. "anyOf" non plus : une
// perception parmi d'autres alternatives ne l'EXIGE pas.
function conditionRequiresPerception(cond) {
  if (!cond) return false;
  if (cond.type === "perceptionActive") return true;
  if (cond.type === "allOf" && Array.isArray(cond.conditions)) {
    return cond.conditions.some(conditionRequiresPerception);
  }
  return false;
}

// Entité SURNATURELLE : sa présence dépend de la perception (aucun champ
// dédié, détecté dans entity.presence). Elle n'est jamais étouffée par la
// perception qui la révèle (voir ./muffle.js).
function isPerceptionGated(entity) {
  return Boolean(entity.presence && entity.presence.some((rule) => conditionRequiresPerception(rule.when)));
}

// Construit l'entrée sonore d'UNE entité.
//   - `session` : la partie courante, pour la présence de départ.
//   - `otherFace` : entité de l'AUTRE face d'une scène à deux faces, rendue
//     étouffée par l'appelant. Chaque rôle y est multiplié par son gain
//     "autre face" (beaconCrossFaceGain ; vocalCrossFaceGain, qui vaut aussi
//     pour enterSound/exitSound ; movementCrossFaceGain) ; à 0, le rôle n'est
//     pas construit du tout. Par défaut seul le beacon est à 0 : on DEVINE
//     l'autre face, on ne la localise pas.
//   - `disableStagger` : balise temporaire d'une bascule de face, qui doit
//     démarrer AUSSITÔT (son fondu commence à sa création).
//   - `handover` : Map id -> balise continue déjà en cours, transmise par la
//     scène précédente (bascule de face). L'entrée y reprend la sienne (et
//     la retire de la Map) : la boucle continue sans coupure.
export function buildEntitySoundEntry(entity, session, { otherFace = false, disableStagger = false, handover = null } = {}) {
  // Déjà RÉSOLU par la cascade instance -> archétype (core/entity-parse.js/
  // parseEntity) : un rôle retiré à l'instance n'existe plus ici.
  const sounds = entity.sounds;
  // Gains "autre face", résolus pour toute entrée (la bascule de face s'en
  // sert aussi pour les balises de la face courante). faceGain : le
  // multiplicateur réellement appliqué, neutre sur la face courante.
  const beaconCrossFaceGain = resolveTuning("beaconCrossFaceGain", entity, sounds.beacon);
  const vocalCrossFaceGain = resolveTuning("vocalCrossFaceGain", entity, sounds.vocal);
  const movementCrossFaceGain = resolveTuning("movementCrossFaceGain", entity, sounds.movement);
  const faceGain = (crossFaceGain) => (otherFace ? crossFaceGain : 1);
  const heardHere = (crossFaceGain) => !otherFace || crossFaceGain > 0;
  const beacon = heardHere(beaconCrossFaceGain) ? sounds.beacon : undefined;
  const vocal = heardHere(vocalCrossFaceGain) ? sounds.vocal : undefined;
  const withFaceGain = (resolved) => (resolved ? { ...resolved, gain: resolved.gain * faceGain(vocalCrossFaceGain) } : null);
  const enterSound = heardHere(vocalCrossFaceGain)
    ? withFaceGain(resolveTransitionSound(entity, sounds.enterSound, ENTER_SOUND_TUNING_KEYS))
    : null;
  const exitSound = heardHere(vocalCrossFaceGain)
    ? withFaceGain(resolveTransitionSound(entity, sounds.exitSound, EXIT_SOUND_TUNING_KEYS))
    : null;
  // Sons de PROXIMITÉ (voir ./proximity-sounds.js) : ils répondent au
  // joueur, qui n'est jamais sur l'autre face — jamais construits pour elle.
  // Leur `condition` éventuelle (sons conditionnels) voyage avec eux.
  const proximitySound = (descriptor, keys) => {
    if (otherFace) return null;
    const resolved = resolveTransitionSound(entity, descriptor, keys);
    return resolved && descriptor.condition !== undefined ? { ...resolved, condition: descriptor.condition } : resolved;
  };
  const approachSound = proximitySound(sounds.approachSound, APPROACH_SOUND_TUNING_KEYS);
  const leaveSound = proximitySound(sounds.leaveSound, LEAVE_SOUND_TUNING_KEYS);
  const proximityLoop = proximitySound(sounds.proximityLoop, PROXIMITY_LOOP_TUNING_KEYS);

  // Propriétés de l'ENTITÉ, partagées par tous ses rôles.
  const audibleRange = resolveTuning("audibleRange", entity);
  const panSaturation = resolveTuning("panSaturation", entity);
  const interactRange = resolveTuning("interactRange", entity);
  const cutoffMin = resolveTuning("cutoffMin", entity);
  const cutoffMax = resolveTuning("cutoffMax", entity);
  // Surlignage de proximité (voir ./spatial.js/volumeForDistance).
  const highlight = Boolean(resolveTuning("highlight", entity));
  // Chaîne "hauteur suggérée" (isFlying) : neutre pour une entité au sol.
  const flyingHighpassHz = entity.isFlying ? resolveTuning("flyingHighpassHz", entity) : undefined;
  const flyingVolumeFactor = entity.isFlying ? resolveTuning("flyingVolumeFactor", entity) : 1;

  // Pas (rôle "movement") : cadencés par la distance parcourue, chaque
  // entité avec son propre marcheur (voir ./footsteps.js/stepWalker).
  // gait/naturalWalk : propriétés de l'entité, point de départ du choix du
  // fichier à chaque pas (voir resolveFootstepPath).
  const movement = heardHere(movementCrossFaceGain) ? sounds.movement : undefined;
  const movementFields = movement
    ? {
        movementPath: movement.path,
        movementReverbSend: resolveTuning("reverbSend", entity, movement),
        movementPitchVariation: resolveTuning("pitchVariation", entity, movement),
        movementGain: resolveTuning("movementGain", entity, movement) * faceGain(movementCrossFaceGain),
        // Même pas que le joueur, modulé par movementStepMultiplier.
        movementStepDistance: STEP_DISTANCE / resolveTuning("movementStepMultiplier", entity, movement),
        walker: createWalkerState(entity.x),
        gait: resolveTuning("gait", entity),
        naturalWalk: resolveTuning("naturalWalk", entity),
      }
    : {};

  // Balise coupée pour de bon une fois l'entité consommée (voir
  // doc/entity-model.md/"Collectible persistant") : registre seulement.
  const muteOnConsumed = Boolean(registry[entity.type].muteOnConsumed);

  // Voix CONTINUE (un Howl persistant) seulement pour un beacon en mode
  // "continu" ; un beacon intermittent et le vocal deviennent des sources
  // intermittentes, jouées à leur propre cadence.
  let sound = null;
  let beaconGain;
  let beaconRoleGain;
  let beaconReverbSend;
  const intermittentSources = [];

  if (beacon) {
    const beaconMode = resolveTuning("beaconMode", entity, beacon);
    if (beaconMode === "continu") {
      const beaconSettings = resolveSoundSettings(entity, beacon, "beaconGain", { useFlyingReverbSend: true });
      // beaconRoleGain : le gain du rôle tel qu'entendu sur la face du
      // joueur ; beaconGain : celui appliqué ici (× gain "autre face" sur
      // l'autre face). La bascule de face fond de l'un à l'autre.
      beaconRoleGain = beaconSettings.gain;
      beaconGain = beaconSettings.gain * faceGain(beaconCrossFaceGain);
      beaconReverbSend = beaconSettings.reverbSend;
      const beaconPitchVariation = beaconSettings.pitchVariation;
      const staggerBeacon = disableStagger ? false : resolveTuning("staggerBeacon", entity, beacon);
      // Variation de hauteur tirée UNE fois pour toute la boucle.
      // cacheKey: entity.id — une balise déjà entendue ne se redécode pas à
      // chaque visite.
      if (handover && handover.has(entity.id)) {
        sound = handover.get(entity.id);
        handover.delete(entity.id);
      } else {
        sound = createPositionedSound(resolveAsset(beacon.path), {
          rate: randomRate(beaconPitchVariation),
          cacheKey: entity.id,
          startDelayMs: staggerBeacon ? drawBeaconStaggerDelayMs() : 0,
        });
      }
    } else {
      // La condition de beacon (voir doc/entity-model.md/"Beacon
      // conditionnel") appartient au rôle beacon, jamais au vocal.
      const source = resolveIntermittentSource(entity, beacon, BEACON_TUNING_KEYS);
      intermittentSources.push({ ...source, gain: source.gain * faceGain(beaconCrossFaceGain), condition: beacon.condition });
    }
  }

  if (vocal) {
    const source = resolveIntermittentSource(entity, vocal, VOCAL_TUNING_KEYS);
    // `role` : retrouvé par ./oneshots.js/postponeVocal.
    intermittentSources.push({ ...source, gain: source.gain * faceGain(vocalCrossFaceGain), role: "vocal" });
  }

  // Présence de départ, avec le MÊME contexte que le tick (presenceContextOf)
  // : sans le monde ni la partie, une condition sur une variable de scène
  // couperait à tort la balise. Une balise continue créée dormante est
  // arrêtée aussitôt (son Howl reste prêt). Aucun son de transition : l'état
  // de départ n'est pas une bascule.
  if (sound && !isPresent(entity, presenceContextOf(session))) sound.stop();

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
    beaconRoleGain,
    beaconCrossFaceGain,
    beaconReverbSend,
    intermittentSources,
    enterSound,
    exitSound,
    approachSound,
    leaveSound,
    proximityLoop,
    proximityHoldMs: resolveTuning("proximityHoldMs", entity),
    proximityLoopFadeMs: resolveTuning("proximityLoopFadeMs", entity),
    muteOnConsumed,
    // Condition de la balise CONTINUE, réévaluée à chaque tick contre
    // l'entité vivante. beaconSilenced : balise arrêtée parce que la
    // condition est fausse (posé par le premier tick, avant toute mise en
    // volume : la voix démarre à 0, sans blip).
    beaconCondition: beacon ? beacon.condition : undefined,
    beaconSilenced: false,
    // Fondu de la condition (voir ./entity-audio.js/stepBeaconEnvelope) :
    // beaconEnvelope, facteur de volume 0..1, null tant que le premier tick
    // ne l'a pas posé — l'état de départ s'impose sans fondu, comme pour la
    // présence.
    beaconFadeMs: beacon ? resolveTuning("beaconFadeMs", entity, beacon) : 0,
    beaconFadeRate: beacon ? resolveTuning("beaconFadeRate", entity, beacon) : 1,
    beaconEnvelope: null,
    perceptionGated: isPerceptionGated(entity),
    ...movementFields,
  };
}
