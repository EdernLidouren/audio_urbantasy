// SONS PONCTUELS positionnés sur une entité, en deux variantes :
//   - ANCRÉ : pan et volume calculés une fois au départ, figés ensuite (un
//     pas, un son de transition, un événement qui "s'est produit là") ;
//   - SUIVI : re-spatialisé à chaque tick jusqu'à la fin du son, comme une
//     balise continue (une cloche reste sur son clocher quand le joueur
//     passe devant).

import { playOneShot, playTrackedOneShot, randomRate } from "../../lib/audio.js";
import { resolveAsset } from "../../lib/assets.js";
import { TUNING_DEFAULTS } from "../../config/tuning.js";
import { NO_MUFFLE, applyMuffleToVolume, volumeForDistance, spatialRendering } from "./spatial.js";
import { clamp } from "../../lib/math.js";
import { beaconVolumeFactor } from "./volume-factors.js";
import { PLAY_SOUND_TUNING_KEYS, resolveTransitionSound, resolveRoleSound } from "./entity-sound-entry.js";

const SCENE_EXIT_SOUND_FADE_MS = TUNING_DEFAULTS.sceneExitSoundFadeMs;
const STOP_SOUNDS_FADE_MS = TUNING_DEFAULTS.stopSoundsFadeMs;

// Un vocal joué par un EFFET (playSound role "vocal", le jappement du chien
// sifflé) repousse l'échéance du vocal régulier de l'entité d'un intervalle
// plein : il ne réaboie pas juste après. Horloge murale, comme l'échéance
// elle-même (voir ./entity-audio.js/updateIntermittentSources).
function postponeVocal(entry) {
  const vocal = entry.intermittentSources && entry.intermittentSources.find((src) => src.role === "vocal");
  if (vocal) vocal.nextAt = Math.max(vocal.nextAt, performance.now() + vocal.interval);
}

// Sons SUIVIS en cours : { entityId, worldId, gain, handle, role }. Au niveau du
// MODULE, pas de la scène : une bascule de face reconstruit la scène pendant
// que le son continue, la nouvelle scène le reprend. `worldId` : le monde
// d'émission — deux mondes peuvent avoir une entité au même id, un son
// appartient à son monde. Retirés à la fin du son. `role` : le rôle joué
// ("vocal"...), absent pour un son par chemin — lu par stopEntityOneShots.
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
  //     suite des déclenchements qui porte le fondu) ;
  //   - entityLayer false : hors de la couche entités, jamais éteint par le
  //     fondu du sas (son de départ, voir playEntityOneShot) ;
  //   - onEnd : appelé quand CETTE lecture se termine (fin ou arrêt), pour
  //     enchaîner un son sur un autre sans jamais le couper (voir
  //     ./proximity-sounds.js). Appelé aussitôt si la lecture n'a pas pu
  //     démarrer : l'appelant n'attend jamais une fin qui ne viendra pas.
  // Chaque lecture a sa propre chaîne (voir lib/audio/oneshots.js) : une
  // version étouffée et une version nette du même fichier ne se gênent
  // jamais.
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
      onEnd,
    }
  ) {
    // Son introuvable (manifeste incomplet, voir tools/content-audit.js) :
    // averti et sauté, jamais une exception qui casserait le tick de la
    // scène — même politique que startTrackedOneShot plus bas.
    let file;
    try {
      file = resolveAsset(path);
    } catch (error) {
      console.warn(`oneshots: son ponctuel indisponible ("${path}") : ${error.message}`);
      if (onEnd) onEnd();
      return;
    }
    const dist = Math.abs(relX);
    const pan = clamp(relX / panSaturation, -1, 1);
    const volume = applyMuffleToVolume(volumeForDistance(dist, audibleRange, highlighted) * volumeFactor * gain * heightGain, muffle);
    const options = {
      reverbSend,
      reverbBusInput: reverbBus.input,
      volume,
      stereo: pan,
      rate: randomRate(pitchVariation),
      highpassHz,
      lowpassHz: muffle.amount > 0 ? muffle.lowpassHz : undefined,
      entityLayer,
    };
    if (!onEnd) {
      playOneShot(file, options);
      return;
    }
    // Poignée de lecture pour connaître sa fin ; jamais re-spatialisée :
    // le son reste ANCRÉ comme un autre.
    const handle = playTrackedOneShot(file, options);
    if (handle) handle.onEnd(onEnd);
    else onEnd();
  }

  // Son de TRANSITION (enterSound/exitSound, playSound ancré) d'une entrée :
  // volume dans la catégorie "balises" (il accompagne la présence de
  // l'entité). Jamais concerné par la pause des balises.
  function playTransitionSound(entry, relX, transitionSound, muffle = NO_MUFFLE, { entityLayer = true, onEnd } = {}) {
    playPositionedOneShot(transitionSound.path, {
      entityLayer,
      onEnd,
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
  // view/effect-runner.js/runEffects) : même résolution qu'un enterSound/
  // exitSound (cascade de l'entité). Entité inconnue ou dormante : averti,
  // silencieux.
  //   - suivi par défaut (descriptor.tracked) ; tracked:false -> ancré ;
  //   - `departing` : le son accompagne un DÉPART (même liste d'effets qu'un
  //     teleport) — ancré et hors couche entités, il survit au fondu du sas
  //     et finit de résonner.
  function playEntityOneShot(targetId, descriptor, { departing = false } = {}) {
    const found = findEntitySource(targetId);
    if (!found) {
      console.warn(`oneshots: playEntityOneShot("${targetId}") : id absent de la scène.`);
      return;
    }
    if (!found.live || found.live.present === false) {
      console.warn(`oneshots: playEntityOneShot("${targetId}") : entité dormante ou introuvable.`);
      return;
    }
    const resolved =
      descriptor.role !== undefined
        ? resolveRoleSound(found.entry.entity, descriptor)
        : resolveTransitionSound(found.entry.entity, descriptor, PLAY_SOUND_TUNING_KEYS);
    if (!resolved) {
      console.warn(`oneshots: playEntityOneShot("${targetId}") : aucun son de rôle "${descriptor.role}".`);
      return;
    }
    if (descriptor.role === "vocal") postponeVocal(found.entry);
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
    startTrackedOneShot(targetId, found, resolved, descriptor.role);
  }

  // Démarre un son SUIVI (rendu initial = celui d'une balise continue au même
  // endroit). `found` : voir findEntitySource. `role` : celui de la source
  // (le vocal régulier porte le sien, voir ./entity-sound-entry.js), ou du
  // playSound qui l'a demandé.
  function startTrackedOneShot(entityId, found, resolved, role = resolved.role) {
    let file;
    try {
      file = resolveAsset(resolved.path);
    } catch (error) {
      console.warn(`oneshots: son suivi indisponible ("${resolved.path}") : ${error.message}`);
      return;
    }
    const rendering = spatialRendering(found.entry, found.live.x - getSession().player.x, effectiveMuffle(found.entry, found.forcedMuffle));
    // Gain de rôle × hauteur : constants pendant toute la lecture.
    const gain = (resolved.gain ?? 1) * (resolved.heightGain ?? 1);
    const handle = playTrackedOneShot(file, {
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
    const source = { entityId, worldId: getSession().activeWorldId, gain, handle, role };
    trackedOneShots.push(source);
    handle.onEnd(() => {
      const index = trackedOneShots.indexOf(source);
      if (index >= 0) trackedOneShots.splice(index, 1);
    });
  }

  // À chaque tick : re-spatialise chaque son suivi (face, étouffement et
  // distance relus). Entité disparue du monde : on cesse de suivre, le son
  // finit sur son dernier rendu — ses voix, elles, viennent d'être coupées
  // (voir stopEntityVoices) : il ne reste que les sons d'effet, comme celui
  // du ramassage.
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

  // Effet "stopSounds" (voir view/effect-runner.js) : coupe, en fondu bref,
  // les sons SUIVIS en cours de l'entité `entityId` — tous, ou ceux du rôle
  // `role`. Les sons ANCRÉS (tracked:false) ne gardent aucune poignée et
  // finissent leur lecture ; le vocal régulier, lui, est suivi par défaut.
  // La balise continue n'est pas concernée : elle suit la présence.
  function stopEntityOneShots(entityId, role) {
    const worldId = getSession().activeWorldId;
    for (const source of [...trackedOneShots]) {
      if (source.entityId !== entityId || source.worldId !== worldId) continue;
      if (role !== undefined && source.role !== role) continue;
      trackedOneShots.splice(trackedOneShots.indexOf(source), 1);
      source.handle.stop(STOP_SOUNDS_FADE_MS);
    }
  }

  // Entité RETIRÉE du monde — ramassée, le plus souvent (voir
  // ./entity-sounds.js/cleanupRemovedEntities) : ses PROPRES voix en cours,
  // vocal et balise intermittente, se coupent en fondu bref, pour ne pas
  // chevaucher le son de ramassage. Celui-ci, joué par chemin (sans rôle,
  // voir view/effect-runner.js/playEntityPickupSound), continue, comme tout
  // son d'effet. Appelée AVANT updateTrackedOneShots, qui cesserait sinon de
  // suivre ces sons et les laisserait finir.
  const VOICE_ROLES = ["beacon", "vocal"];
  function stopEntityVoices(entityId) {
    for (const role of VOICE_ROLES) stopEntityOneShots(entityId, role);
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
    stopEntityOneShots,
    stopEntityVoices,
    updateTrackedOneShots,
    crossfadeTrackedOneShots,
  };
}
