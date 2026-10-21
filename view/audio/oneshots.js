// SONS PONCTUELS positionnés sur une entité, en deux variantes :
//   - ANCRÉ : pan et volume calculés une fois au départ, figés ensuite (un
//     pas, un son de transition, un événement qui "s'est produit là") ;
//   - SUIVI : re-spatialisé à chaque tick jusqu'à la fin du son, comme une
//     balise continue (une cloche reste sur son clocher quand le joueur
//     passe devant).

import { playOneShot, playTrackedOneShot, randomRate } from "../../lib/audio.js";
import { resolveAsset } from "../../lib/assets.js";
import { TUNING_DEFAULTS } from "../../config/tuning.js";
import { NO_MUFFLE, clamp, applyMuffleToVolume, volumeForDistance, spatialRendering } from "./spatial.js";
import { beaconVolumeFactor } from "./volume-factors.js";
import { PLAY_SOUND_TUNING_KEYS, resolveTransitionSound } from "./entity-sound-entry.js";

const SCENE_EXIT_SOUND_FADE_MS = TUNING_DEFAULTS.sceneExitSoundFadeMs;

// Sons SUIVIS en cours : { entityId, worldId, gain, handle }. Au niveau du
// MODULE, pas de la scène : une bascule de face reconstruit la scène pendant
// que le son continue, la nouvelle scène le reprend. `worldId` : le monde
// d'émission — deux mondes peuvent avoir une entité au même id, un son
// appartient à son monde. Retirés à la fin du son.
const trackedOneShots = [];

// Arrête (fondu bref) tout son suivi émis dans un AUTRE monde que le monde
// actif : au montage de chaque scène et, par sécurité, à chaque mise à jour.
// Une bascule de face reste dans le même monde : ses sons continuent.
export function stopForeignTrackedOneShots(activeWorldId) {
  for (const source of [...trackedOneShots]) {
    if (source.worldId === activeWorldId) continue;
    trackedOneShots.splice(trackedOneShots.indexOf(source), 1);
    source.handle.stop(SCENE_EXIT_SOUND_FADE_MS);
  }
}

// Sons ponctuels d'une scène. `findEntitySource(id)` et `effectiveMuffle`
// viennent de ./entity-sounds.js et ./muffle.js.
export function createOneShots({ getSession, reverbBus, findEntitySource, effectiveMuffle, fullFaceMuffle }) {
  // Son ponctuel ANCRÉ : source intermittente non suivie, pas d'une entité,
  // son de transition. Pas de passe-bas de distance (trop court pour un
  // filtre continu). Options :
  //   - gain, pitchVariation : réglages du rôle ;
  //   - highpassHz, heightGain : chaîne "hauteur suggérée" (isFlying) ;
  //   - muffle : étouffement à CE déclenchement (un son ponctuel ne peut pas
  //     être modulé après coup : pendant une rampe de perception, c'est la
  //     suite des déclenchements qui porte le fondu). cacheKey distincte
  //     ("muffled:") : la version étouffée d'un fichier ne partage jamais sa
  //     chaîne de filtres avec la version nette ;
  //   - entityLayer false : hors de la couche entités, jamais éteint par le
  //     fondu du sas (son de départ, voir playEntityOneShot), cacheKey dédiée
  //     ("departure:").
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
      muffle = NO_MUFFLE,
      highlighted = false,
      entityLayer = true,
    }
  ) {
    const dist = Math.abs(relX);
    const pan = clamp(relX / panSaturation, -1, 1);
    const volume = applyMuffleToVolume(volumeForDistance(dist, audibleRange, highlighted) * volumeFactor * gain * heightGain, muffle);
    const resolved = resolveAsset(path);
    const cachePrefix = `${entityLayer ? "" : "departure:"}${muffle.amount > 0 ? "muffled:" : ""}`;
    playOneShot(resolved, {
      reverbSend,
      reverbBusInput: reverbBus.input,
      volume,
      stereo: pan,
      rate: randomRate(pitchVariation),
      highpassHz,
      lowpassHz: muffle.amount > 0 ? muffle.lowpassHz : undefined,
      cacheKey: cachePrefix ? `${cachePrefix}${resolved}` : undefined,
      entityLayer,
    });
  }

  // Son de TRANSITION (enterSound/exitSound, playSound ancré) d'une entrée :
  // volume dans la catégorie "balises" (il accompagne la présence de
  // l'entité). Jamais concerné par la pause des balises.
  function playTransitionSound(entry, relX, transitionSound, muffle = NO_MUFFLE, { entityLayer = true } = {}) {
    playPositionedOneShot(transitionSound.path, {
      entityLayer,
      relX,
      audibleRange: entry.audibleRange,
      panSaturation: entry.panSaturation,
      reverbSend: transitionSound.reverbSend,
      volumeFactor: beaconVolumeFactor(),
      gain: transitionSound.gain,
      pitchVariation: transitionSound.pitchVariation,
      muffle,
      highlighted: entry.highlight && Math.abs(relX) <= entry.interactRange,
    });
  }

  // Effet "playSound" diégétique sur une entité quelconque (voir
  // view/interaction.js/runEffects) : même résolution qu'un enterSound/
  // exitSound (cascade de l'entité). Entité inconnue ou dormante : averti,
  // silencieux.
  //   - suivi par défaut (descriptor.tracked) ; tracked:false -> ancré ;
  //   - `departing` : le son accompagne un DÉPART (même liste d'effets qu'un
  //     teleport) — ancré et hors couche entités, il survit au fondu du sas
  //     et finit de résonner.
  function playEntityOneShot(targetId, descriptor, { departing = false } = {}) {
    const found = findEntitySource(targetId);
    if (!found) {
      console.warn(`city-scene: playEntityOneShot("${targetId}") : id absent de la scène.`);
      return;
    }
    if (!found.live || found.live.present === false) {
      console.warn(`city-scene: playEntityOneShot("${targetId}") : entité dormante ou introuvable.`);
      return;
    }
    const resolved = resolveTransitionSound(found.entry.entity, descriptor, PLAY_SOUND_TUNING_KEYS);
    if (departing) {
      playTransitionSound(found.entry, found.live.x - getSession().player.x, resolved, effectiveMuffle(found.entry, found.forcedMuffle), {
        entityLayer: false,
      });
      return;
    }
    if (descriptor.tracked === false) {
      playTransitionSound(found.entry, found.live.x - getSession().player.x, resolved, effectiveMuffle(found.entry, found.forcedMuffle));
      return;
    }
    startTrackedOneShot(targetId, found, resolved);
  }

  // Démarre un son SUIVI (rendu initial = celui d'une balise continue au même
  // endroit). `found` : voir findEntitySource.
  function startTrackedOneShot(entityId, found, resolved) {
    let file;
    try {
      file = resolveAsset(resolved.path);
    } catch (error) {
      console.warn(`city-scene: son suivi indisponible ("${resolved.path}") : ${error.message}`);
      return;
    }
    const rendering = spatialRendering(found.entry, found.live.x - getSession().player.x, effectiveMuffle(found.entry, found.forcedMuffle));
    // Gain de rôle × hauteur : constants pendant toute la lecture.
    const gain = (resolved.gain ?? 1) * (resolved.heightGain ?? 1);
    const handle = playTrackedOneShot(file, {
      // Clé PAR ENTITÉ : deux entités qui jouent le même fichier gardent
      // chacune leur passe-bas.
      cacheKey: `tracked:${entityId}:${file}`,
      reverbSend: resolved.reverbSend,
      reverbBusInput: reverbBus.input,
      volume: rendering.volume * beaconVolumeFactor() * gain,
      stereo: rendering.pan,
      rate: randomRate(resolved.pitchVariation),
      lowpassHz: rendering.cutoff,
      highpassHz: resolved.highpassHz,
      entityLayer: true,
    });
    if (!handle) return;
    const source = { entityId, worldId: getSession().activeWorldId, gain, handle };
    trackedOneShots.push(source);
    handle.onEnd(() => {
      const index = trackedOneShots.indexOf(source);
      if (index >= 0) trackedOneShots.splice(index, 1);
    });
  }

  // À chaque tick : re-spatialise chaque son suivi (face, étouffement et
  // distance relus). Entité disparue du monde : on cesse de suivre, le son
  // finit sur son dernier rendu.
  function updateTrackedOneShots(x) {
    if (trackedOneShots.length === 0) return;
    stopForeignTrackedOneShots(getSession().activeWorldId);
    const volumeFactor = beaconVolumeFactor();
    for (const source of [...trackedOneShots]) {
      const found = findEntitySource(source.entityId);
      if (!found || !found.live) {
        trackedOneShots.splice(trackedOneShots.indexOf(source), 1);
        continue;
      }
      const rendering = spatialRendering(found.entry, found.live.x - x, effectiveMuffle(found.entry, found.forcedMuffle));
      source.handle.update(rendering.pan, rendering.volume * volumeFactor * source.gain, rendering.cutoff);
    }
  }

  // Bascule de face (voir ./face-crossfade.js) : chaque son suivi fond vers
  // le rendu qu'il aura sur la face d'arrivée — net s'il est sur l'autre
  // face, entièrement étouffé sinon. Le premier tick après la bascule repart
  // de ces cibles.
  function crossfadeTrackedOneShots(x, durationMs, beaconFactor) {
    for (const source of [...trackedOneShots]) {
      const found = findEntitySource(source.entityId);
      if (!found || !found.live) continue;
      const relX = found.live.x - x;
      const current = spatialRendering(found.entry, relX, effectiveMuffle(found.entry, found.forcedMuffle));
      const arrivalMuffle = found.forcedMuffle > 0 ? effectiveMuffle(found.entry, 0) : fullFaceMuffle;
      const target = spatialRendering(found.entry, relX, arrivalMuffle);
      source.handle.update(current.pan, current.volume * beaconFactor * source.gain, current.cutoff);
      source.handle.fadeVolume(target.volume * beaconFactor * source.gain, durationMs);
      source.handle.rampCutoff(target.cutoff, durationMs);
    }
  }

  return {
    playPositionedOneShot,
    playTransitionSound,
    playEntityOneShot,
    startTrackedOneShot,
    updateTrackedOneShots,
    crossfadeTrackedOneShots,
  };
}
