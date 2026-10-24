// SCÈNE AUDIO de la ville : chef d'orchestre. Monte, met à jour à chaque tick
// et détruit le rendu sonore du monde actif, en composant des sous-systèmes
// qui ne se connaissent pas entre eux :
//   - ./entity-sounds.js   : registre des entrées sonores (les deux faces) ;
//   - ./entity-sound-entry.js : construction d'une entrée sonore d'entité ;
//   - ./entity-audio.js    : balises, vocaux, pas des entités ;
//   - ./oneshots.js        : sons ponctuels ancrés ou suivis ;
//   - ./proximity-sounds.js : sons d'approche et d'éloignement du joueur ;
//   - ./footsteps.js       : pas et collisions du joueur ;
//   - ./layers.js          : musique, ambiances, météo, perception ;
//   - ./muffle.js          : étouffement (autre face, perception) ;
//   - ./face-crossfade.js  : bascule animée recto <-> verso ;
//   - ./preload.js         : préchargement ;
//   - ./spatial.js         : calcul pan / volume / coupure (pur) ;
//   - ./volume-factors.js  : facteurs de volume des préférences.
// Spatialisation en stéréo + volume selon la distance au joueur, jamais en
// HRTF (voir ./spatial.js) ; la plomberie Web Audio reste dans lib/audio.js.
//
// SCÈNE À DEUX FACES (voir doc/entity-model.md/"Recto/verso") : le core tique les deux
// faces ; ce module rend la face COURANTE normalement et l'AUTRE étouffée,
// chaque rôle dosé par son gain "autre face" (par défaut, la balise n'y est
// pas entendue : on devine l'autre face, on ne la localise pas).
// Ce module ne parle jamais : l'occupation, les candidats d'interaction et
// les annonces d'ambiance vivent à côté (voir view/world-view.js).
//
// Filet de sécurité de tout remaniement : tools/audio-trace.js.

import { keepAudioContextAwake, createReverbBus, setMasterVolume, setGlobalVolume } from "../../lib/audio.js";
import { TUNING_DEFAULTS } from "../../config/tuning.js";
import { getActiveWorld, getInactiveFace } from "../../core/state.js";
import { createEntitySounds } from "./entity-sounds.js";
import { createEntityAudio } from "./entity-audio.js";
import { createOneShots, stopForeignTrackedOneShots } from "./oneshots.js";
import { createProximitySounds } from "./proximity-sounds.js";
import { createPlayerFootsteps } from "./footsteps.js";
import { createSceneLayers } from "./layers.js";
import { createMuffle } from "./muffle.js";
import { createFaceCrossfade } from "./face-crossfade.js";
import { preloadSceneAudio } from "./preload.js";
import { masterVolumeFactor, musicVolumeFactor, ambienceVolumeFactor } from "./volume-factors.js";

export { stopPersistentAudioLayers } from "./layers.js";

// Bus de réverb : un seul par scène. Durée, decay et niveau de retour
// surchargeables par la face (reverbDurationSec/reverbDecay/reverbWet, voir
// doc/scene-format.md).
const REVERB_DURATION_SEC_DEFAULT = TUNING_DEFAULTS.reverbDurationSec;
const REVERB_DECAY_DEFAULT = TUNING_DEFAULTS.reverbDecay;
const REVERB_WET_DEFAULT = TUNING_DEFAULTS.reverbWet;

// Au plus une scène ville vivante à la fois : un menu ouvert par-dessus
// (Options > Audio) peut la rafraîchir sans référence explicite (voir
// refreshActiveBeaconVolumes).
let activeScene = null;

// `getSession` : un ACCESSEUR — le core remplace la session à chaque tick,
// update() relit toujours l'état courant. `handover` : balises continues
// transmises par la scène précédente (bascule de face) ; celles que cette
// scène ne reprend pas restent dans la Map, à l'appelant de les arrêter.
export function createCityAudioScene(getSession, { handover = null } = {}) {
  // Contexte audio maintenu éveillé pour toute la scène, avant toute voix.
  keepAudioContextAwake();

  // Les sons suivis du monde QUITTÉ s'arrêtent (le monde actif est déjà le
  // nouveau).
  stopForeignTrackedOneShots(getSession().activeWorldId);

  // ORDRE de montage : les entrées sonores (qui créent les premiers Howl,
  // donc Howler.ctx) AVANT le bus de réverb, qui a besoin du contexte tout de
  // suite. Limite connue, non atteignable avec le contenu actuel : une scène
  // sans aucune balise continue n'aurait pas de bus.
  const entities = createEntitySounds({ getSession, handover });
  const world = getActiveWorld(getSession());
  const reverbBus = createReverbBus({
    durationSec: world.reverbDurationSec ?? REVERB_DURATION_SEC_DEFAULT,
    decay: world.reverbDecay ?? REVERB_DECAY_DEFAULT,
    wet: world.reverbWet ?? REVERB_WET_DEFAULT,
  });
  entities.connectReverb(reverbBus);

  preloadSceneAudio(getSession(), entities.initialWorld, entities.entitySounds, entities.collisionSoundFor);

  const layers = createSceneLayers(getSession, world);
  const muffle = createMuffle(getSession, world);
  const oneShots = createOneShots({
    getSession,
    reverbBus,
    findEntitySource: entities.findEntitySource,
    effectiveMuffle: muffle.effectiveMuffle,
    fullFaceMuffle: muffle.fullFaceMuffle,
  });
  const entityAudio = createEntityAudio({
    getSession,
    entities,
    effectiveMuffle: muffle.effectiveMuffle,
    fullFaceMuffle: muffle.fullFaceMuffle,
    oneShots,
  });
  const proximitySounds = createProximitySounds({
    entities,
    oneShots,
    effectiveMuffle: muffle.effectiveMuffle,
    reverbBusInput: reverbBus.input,
    conditionAllows: entityAudio.beaconConditionAllows,
  });
  const footsteps = createPlayerFootsteps({
    getSession,
    reverbBusInput: reverbBus.input,
    collisionSoundFor: entities.collisionSoundFor,
  });
  const faceCrossfade = createFaceCrossfade({
    getSession,
    entities,
    faceMuffle: muffle.faceMuffle,
    beaconConditionAllows: entityAudio.beaconConditionAllows,
    oneShots,
  });

  function update() {
    const session = getSession();
    const x = session.player.x;
    const blockedBy = session.player.blockedBy;
    const world = getActiveWorld(session);

    // D'abord, suivre la vie des entités : apparitions, disparitions,
    // consommation.
    entities.syncNewEntitySounds(world);
    entities.cleanupRemovedEntities(world);
    entities.muteConsumedBeacons(world);

    layers.update(session, world);
    muffle.update(session);

    entityAudio.applyEntityAudio(x);
    oneShots.updateTrackedOneShots(x);

    // Une seule photo des entités vivantes pour le reste du tick.
    const liveById = entities.liveEntitiesById();
    entityAudio.updateIntermittentSources(entities.entitySounds, x, liveById);
    entityAudio.updateEntityMovementSounds(entities.entitySounds, x, world, liveById);
    proximitySounds.update(x, liveById);

    footsteps.update(world, x, blockedBy);

    // AUTRE face : étouffée. Relue à chaque tick, comme la face courante.
    if (entities.otherEntitySounds) {
      const otherWorld = getInactiveFace(session);
      entities.syncNewOtherEntitySounds(otherWorld);
      const otherLiveById = entities.liveOtherEntitiesById(otherWorld);
      entityAudio.applyMuffledPresenceTransitions(x, otherLiveById);
      entityAudio.applyOtherFaceBeacons(x, otherLiveById);
      entityAudio.updateIntermittentSources(entities.otherEntitySounds, x, otherLiveById, 1);
      entityAudio.updateEntityMovementSounds(entities.otherEntitySounds, x, otherWorld, otherLiveById, 1);
    }
  }

  // Détruit la scène. Avec `handover` (bascule de face), les balises
  // continues ne sont PAS arrêtées mais RENDUES (Map id -> balise) pour que
  // la scène reconstruite sur l'autre face les reprenne sans coupure ; sans
  // lui, tout s'arrête. Ne touche jamais musique ni ambiances (couches
  // persistantes : c'est le montage de la scène SUIVANTE qui décide, voir
  // ./layers.js) ni les sons suivis (la scène suivante les reprend ou les
  // arrête, voir ./oneshots.js).
  function destroy({ handover = false } = {}) {
    const beacons = new Map(faceCrossfade.temporaries);
    for (const { entity, sound } of [...entities.entitySounds, ...(entities.otherEntitySounds ?? [])]) {
      if (sound) beacons.set(entity.id, sound);
    }
    faceCrossfade.temporaries.clear();
    proximitySounds.destroy();
    if (!handover) {
      for (const sound of beacons.values()) sound.stop();
    }
    reverbBus.destroy();
    if (activeScene === api) activeScene = null;
    return handover ? beacons : null;
  }

  const api = {
    update,
    destroy,
    // Les boucles de proximité se taisent avec les balises (même raison :
    // un menu par-dessus le jeu).
    pauseBeacons: () => {
      entityAudio.pauseBeacons();
      proximitySounds.pauseLoops();
    },
    resumeBeacons: () => {
      entityAudio.resumeBeacons();
      proximitySounds.resumeLoops();
    },
    refreshBeaconVolumes: entityAudio.refreshBeaconVolumes,
    crossfadeFaceSwap: faceCrossfade.crossfadeFaceSwap,
    playEntityOneShot: oneShots.playEntityOneShot,
    playTransitionSteps: footsteps.playTransitionSteps,
    playArrivalStep: footsteps.playArrivalStep,
  };
  activeScene = api;
  return api;
}

// Rafraîchit le volume des balises de la scène active, s'il y en a une
// (appelé par les sliders de volume, voir view/menus/audio-menu.js).
export function refreshActiveBeaconVolumes() {
  if (activeScene) activeScene.refreshBeaconVolumes();
}

// Réapplique TOUS les volumes des préférences en direct (principal,
// musique, ambiances, balises de la scène active) : au démarrage, et après
// toute écriture groupée de préférences (réinitialisation, import). Les
// autres catégories (pas, sons ponctuels, interface) relisent déjà leur
// préférence à chaque lecture.
export function applyVolumePreferences() {
  setMasterVolume(masterVolumeFactor());
  setGlobalVolume("music", musicVolumeFactor());
  setGlobalVolume("ambience", ambienceVolumeFactor());
  refreshActiveBeaconVolumes();
}
