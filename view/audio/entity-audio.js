// SONS DES ENTITÉS, tick après tick : balises continues (pan, volume,
// passe-bas suivis en continu), sources intermittentes (beacon intermittent,
// vocal), pas des entités mobiles, sons de transition de présence. Les deux
// faces d'une scène à deux faces passent par les MÊMES fonctions, l'autre
// face avec un étouffement complet (`forcedMuffle` 1).
//
// Présence conditionnelle (voir core/presence.js) : une entité dormante est
// "comme si absente" — ni balise, ni déclenchement, ni pas. Ses bascules
// (live.presenceChanged, posé par le core) jouent enterSound/exitSound.

import { getInactiveFace } from "../../core/state.js";
import { evaluateCondition, actionContextOf } from "../../core/presence.js";
import { spatialRendering } from "./spatial.js";
import { beaconVolumeFactor, footstepVolumeFactor } from "./volume-factors.js";
import { resolveFootstepPath, stepWalker } from "./footsteps.js";

// Prochain délai (ms) d'une source intermittente, jamais négatif.
function jitteredIntervalMs(interval, variation) {
  return Math.max(0, interval + (Math.random() * 2 - 1) * variation);
}

// `entities` : ./entity-sounds.js ; `effectiveMuffle`, `fullFaceMuffle` :
// ./muffle.js ; `oneShots` : ./oneshots.js.
export function createEntityAudio({ getSession, entities, effectiveMuffle, fullFaceMuffle, oneShots }) {
  const { entitySounds, otherEntitySounds } = entities;

  // Beacon conditionnel (voir doc/entity-model.md/"Sons conditionnels") :
  // même contexte que les conditions d'action, relu à chaque appel contre
  // l'entité VIVANTE (ses variables courantes). Sans condition : autorisé.
  function beaconConditionAllows(condition, live) {
    if (!condition) return true;
    return evaluateCondition(condition, actionContextOf(getSession(), live));
  }

  // Sources INTERMITTENTES (beacon intermittent, vocal) : à l'échéance, un
  // son ponctuel puis une nouvelle échéance. SUIVI par défaut (une entité
  // rapide n'abandonne pas son vocal derrière elle), ancré sinon. Échéances
  // sur l'horloge MURALE, au plus UN déclenchement par source et par tick :
  // jamais de rafale de rattrapage au retour d'un menu. Une entité dormante
  // ou un beacon conditionnel éteint gèle son échéance.
  function updateIntermittentSources(entries, x, liveById, forcedMuffle = 0) {
    const now = performance.now();
    const volumeFactor = beaconVolumeFactor();
    for (const entry of entries) {
      if (liveById.get(entry.entity.id).present === false) continue;
      const muffle = effectiveMuffle(entry, forcedMuffle);
      for (const src of entry.intermittentSources) {
        if (now < src.nextAt) continue;
        if (src.condition && !beaconConditionAllows(src.condition, liveById.get(entry.entity.id))) continue;

        if (src.tracked) {
          oneShots.startTrackedOneShot(entry.entity.id, { entry, live: liveById.get(entry.entity.id), forcedMuffle }, src);
          src.nextAt = now + jitteredIntervalMs(src.interval, src.intervalVariation);
          continue;
        }
        oneShots.playPositionedOneShot(src.path, {
          relX: liveById.get(entry.entity.id).x - x,
          audibleRange: entry.audibleRange,
          panSaturation: entry.panSaturation,
          reverbSend: src.reverbSend,
          volumeFactor,
          gain: src.gain,
          pitchVariation: src.pitchVariation,
          highpassHz: src.highpassHz,
          heightGain: src.heightGain,
          muffle,
          highlighted: entry.highlight && Math.abs(liveById.get(entry.entity.id).x - x) <= entry.interactRange,
        });
        src.nextAt = now + jitteredIntervalMs(src.interval, src.intervalVariation);
      }
    }
  }

  // Pas des entités mobiles : même mécanisme que le joueur (stepWalker),
  // chaque pas positionné et sur le sol de l'ENTITÉ.
  function updateEntityMovementSounds(entries, x, world, liveById, forcedMuffle = 0) {
    const volumeFactor = footstepVolumeFactor();

    for (const entry of entries) {
      if (!entry.movementPath) continue;
      const live = liveById.get(entry.entity.id);
      if (live.present === false) continue;

      const muffle = effectiveMuffle(entry, forcedMuffle);
      stepWalker(entry.walker, live.x, entry.movementStepDistance, (atX) => {
        const path = resolveFootstepPath(world, atX, {
          gait: entry.gait,
          naturalWalk: entry.naturalWalk,
          ownPath: entry.movementPath,
          airborne: Boolean(entry.entity.isFlying),
        });
        oneShots.playPositionedOneShot(path, {
          relX: atX - x,
          audibleRange: entry.audibleRange,
          panSaturation: entry.panSaturation,
          reverbSend: entry.movementReverbSend,
          volumeFactor,
          gain: entry.movementGain,
          pitchVariation: entry.movementPitchVariation,
          muffle,
          highlighted: entry.highlight && Math.abs(atX - x) <= entry.interactRange,
        });
      });
    }
  }

  // Balise CONTINUE d'une entrée pour ce tick (les deux faces) : bascule de
  // présence (arrêt / reprise), beacon conditionnel, filet anti-blocage,
  // puis rendu spatial. Les sons de transition restent à l'appelant.
  function updateBeaconSound(entry, live, relX, muffle, beaconFactor) {
    const { entity, sound, beaconGain, flyingHighpassHz, flyingVolumeFactor } = entry;
    if (!sound) return;

    if (live.presenceChanged === "exited") {
      sound.stop();
    } else if (live.presenceChanged === "entered" && beaconConditionAllows(entry.beaconCondition, live)) {
      sound.resume();
      entry.beaconSilenced = false;
    }
    if (live.present === false) return;

    // Condition fausse : balise arrêtée une fois ; redevenue vraie :
    // reprise. Une balise coupée pour consommation ne revient jamais.
    if (!beaconConditionAllows(entry.beaconCondition, live)) {
      if (!entry.beaconSilenced) {
        sound.stop();
        entry.beaconSilenced = true;
      }
      return;
    }
    if (entry.beaconSilenced) {
      entry.beaconSilenced = false;
      if (!entities.isMutedOnConsumed(entity.id)) sound.resume();
    }

    // Filet anti-blocage : une boucle peut, rarement et selon le navigateur,
    // s'arrêter seule (cause non isolée). isStuck() ignore tout arrêt voulu.
    if (sound.isStuck()) sound.resume();

    // beaconGain inclut déjà le gain "autre face" d'une entrée de l'autre
    // face ; flyingVolumeFactor et le passe-haut ne concernent que isFlying.
    const { pan, volume, cutoff } = spatialRendering(entry, relX, muffle);
    sound.update(pan, volume * beaconFactor * beaconGain * flyingVolumeFactor);
    sound.setCutoff(cutoff);
    if (entity.isFlying) sound.setHighpass(flyingHighpassHz);
  }

  // Face courante : sons de transition (exitSound joue AVANT l'arrêt de la
  // balise — deux Howl distincts), puis la balise continue.
  function applyEntityAudio(x) {
    const beaconFactor = beaconVolumeFactor();
    const liveById = entities.liveEntitiesById();
    for (const entry of entitySounds) {
      const live = liveById.get(entry.entity.id);
      const relX = live.x - x;
      const muffle = effectiveMuffle(entry, 0);

      if (live.presenceChanged === "exited" && entry.exitSound) {
        oneShots.playTransitionSound(entry, relX, entry.exitSound, muffle);
      } else if (live.presenceChanged === "entered" && entry.enterSound) {
        oneShots.playTransitionSound(entry, relX, entry.enterSound, muffle);
      }
      updateBeaconSound(entry, live, relX, muffle, beaconFactor);
    }
  }

  // Autre face : sons de transition, étouffés.
  function applyMuffledPresenceTransitions(x, otherLiveById) {
    for (const entry of otherEntitySounds) {
      const live = otherLiveById.get(entry.entity.id);
      const relX = live.x - x;
      if (live.presenceChanged === "exited" && entry.exitSound) {
        oneShots.playTransitionSound(entry, relX, entry.exitSound, fullFaceMuffle);
      } else if (live.presenceChanged === "entered" && entry.enterSound) {
        oneShots.playTransitionSound(entry, relX, entry.enterSound, fullFaceMuffle);
      }
    }
  }

  // Autre face : balises continues entendues à travers (gain "autre face" >
  // 0, sinon jamais construites), entièrement étouffées.
  function applyOtherFaceBeacons(x, otherLiveById) {
    const beaconFactor = beaconVolumeFactor();
    for (const entry of otherEntitySounds) {
      if (!entry.sound) continue;
      const live = otherLiveById.get(entry.entity.id);
      updateBeaconSound(entry, live, live.x - x, fullFaceMuffle, beaconFactor);
    }
  }

  // Réapplique le volume des balises hors tick : une préférence modifiée
  // depuis un menu (jeu arrêté) prend effet aussitôt.
  function refreshBeaconVolumes() {
    const session = getSession();
    applyEntityAudio(session.player.x);
    if (otherEntitySounds) applyOtherFaceBeacons(session.player.x, entities.liveOtherEntitiesById(getInactiveFace(session)));
  }

  // Pause / reprise des balises continues des deux faces, derrière un menu
  // (désambiguïsation, pause) : ni la réverb, ni la musique, ni les
  // ambiances. Une entité dormante ou retirée (present === false) est
  // exclue : sa balise est déjà arrêtée, resume() la relancerait depuis le
  // début — un fantôme. `present` undefined (sans règle de présence) reste
  // inclus.
  function eachLiveBeacon(visit) {
    const liveById = entities.liveEntitiesById();
    for (const entry of entitySounds) visit(entry, liveById.get(entry.entity.id));
    if (!otherEntitySounds) return;
    const otherLiveById = entities.liveOtherEntitiesById(getInactiveFace(getSession()));
    for (const entry of otherEntitySounds) visit(entry, otherLiveById.get(entry.entity.id));
  }
  function pauseBeacons() {
    eachLiveBeacon(({ sound }, live) => {
      if (sound && live.present !== false) sound.pause();
    });
  }
  function resumeBeacons() {
    eachLiveBeacon(({ sound, beaconSilenced }, live) => {
      if (sound && !beaconSilenced && live.present !== false) sound.resume();
    });
  }

  return {
    beaconConditionAllows,
    updateIntermittentSources,
    updateEntityMovementSounds,
    applyEntityAudio,
    applyMuffledPresenceTransitions,
    applyOtherFaceBeacons,
    refreshBeaconVolumes,
    pauseBeacons,
    resumeBeacons,
  };
}
