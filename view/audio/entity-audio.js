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

// Enveloppe de fondu d'une balise conditionnelle (voir doc/entity-model.md/
// "Sons conditionnels") : un facteur de volume 0..1 qui rejoint sa cible
// (1 si la condition permet la balise, 0 sinon) à raison de `elapsedMs /
// fadeMs` par appel. Avancée par le temps des TICKS, jamais par l'horloge
// murale : un menu ouvert la fige avec le jeu. Pas de Howler.fade ici : le
// volume est recalculé à chaque tick (distance, pan), il écraserait la
// rampe. `current` null (premier tick, bascule de présence) ou fadeMs 0 :
// la cible s'impose aussitôt. Une bascule en plein fondu repart
// simplement dans l'autre sens, depuis le niveau atteint.
function stepBeaconEnvelope(current, target, elapsedMs, fadeMs) {
  if (current === null || fadeMs <= 0) return target;
  const step = elapsedMs / fadeMs;
  return target > current ? Math.min(target, current + step) : Math.max(target, current - step);
}

// Vitesse de lecture d'une balise selon son enveloppe : de `fadeRate`
// (enveloppe à 0) à 1 (enveloppe à 1), linéaire — la montée en régime
// d'une machine suit son volume. fadeRate 1 : toujours 1.
function beaconRateFactor(envelope, fadeRate) {
  return fadeRate + (1 - fadeRate) * envelope;
}

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
  // présence (arrêt / reprise), beacon conditionnel et son fondu, filet
  // anti-blocage, puis rendu spatial. Les sons de transition restent à
  // l'appelant. `elapsedMs` : temps de jeu écoulé depuis l'appel précédent
  // (TICK_MS au tick, 0 hors tick : un rafraîchissement depuis un menu
  // n'avance pas le fondu).
  function updateBeaconSound(entry, live, relX, muffle, beaconFactor, elapsedMs) {
    const { entity, sound, beaconGain, flyingHighpassHz, flyingVolumeFactor } = entry;
    if (!sound) return;

    const allowed = beaconConditionAllows(entry.beaconCondition, live);
    if (live.presenceChanged === "exited") {
      sound.stop();
    } else if (live.presenceChanged === "entered" && allowed) {
      sound.resume();
      entry.beaconSilenced = false;
    }
    // Une bascule de présence est SÈCHE (voir doc/entity-model.md) : le
    // fondu de la condition repart de l'état atteint, sans rampe.
    if (live.presenceChanged) entry.beaconEnvelope = null;
    if (live.present === false) return;

    // Condition fausse : la balise s'éteint (en fondu si beaconFadeMs),
    // puis s'arrête une fois à zéro ; redevenue vraie : reprise, et remontée
    // en fondu. Une balise coupée pour consommation ne revient jamais.
    entry.beaconEnvelope = stepBeaconEnvelope(entry.beaconEnvelope, allowed ? 1 : 0, elapsedMs, entry.beaconFadeMs);
    // Vitesse posée AVANT une éventuelle reprise : la voix repart à la
    // vitesse du bas de la rampe, jamais un instant à plein régime.
    sound.setRateFactor(beaconRateFactor(entry.beaconEnvelope, entry.beaconFadeRate));
    if (entry.beaconEnvelope === 0) {
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
    sound.update(pan, volume * beaconFactor * beaconGain * flyingVolumeFactor * entry.beaconEnvelope);
    sound.setCutoff(cutoff);
    if (entity.isFlying) sound.setHighpass(flyingHighpassHz);
  }

  // Face courante : sons de transition (exitSound joue AVANT l'arrêt de la
  // balise — deux Howl distincts), puis la balise continue.
  function applyEntityAudio(x, elapsedMs) {
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
      updateBeaconSound(entry, live, relX, muffle, beaconFactor, elapsedMs);
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
  function applyOtherFaceBeacons(x, otherLiveById, elapsedMs) {
    const beaconFactor = beaconVolumeFactor();
    for (const entry of otherEntitySounds) {
      if (!entry.sound) continue;
      const live = otherLiveById.get(entry.entity.id);
      updateBeaconSound(entry, live, live.x - x, fullFaceMuffle, beaconFactor, elapsedMs);
    }
  }

  // Réapplique le volume des balises hors tick : une préférence modifiée
  // depuis un menu (jeu arrêté) prend effet aussitôt.
  function refreshBeaconVolumes() {
    const session = getSession();
    applyEntityAudio(session.player.x, 0);
    if (otherEntitySounds) applyOtherFaceBeacons(session.player.x, entities.liveOtherEntitiesById(getInactiveFace(session)), 0);
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
