// BASCULE DE FACE animée (recto <-> verso, voir view/world-travel.js/
// sideSwitch, dans le sas : jeu gelé). Les deux faces CROISENT leurs
// filtres d'occlusion en parallèle — la face quittée s'étouffe pendant que
// l'autre s'éclaircit, toutes deux restant audibles : un échange de clarté,
// jamais un passage par le silence (contrairement au sas d'un changement de
// scène). La position est gelée sur celle du joueur au départ ; le
// repositionnement a lieu après, chez l'appelant.
//
// Chaque balise fond vers le niveau que la face d'arrivée lui donnera :
//   - face quittée : vers son rendu "autre face" (étouffé, × son
//     beaconCrossFaceGain — à 0, jusqu'au silence) ;
//   - autre face : vers son rendu net. Une balise déjà entendue à travers
//     est simplement OUVERTE ; les autres reçoivent une balise TEMPORAIRE,
//     créée ici, partie de leur niveau "autre face", avec son envoi de
//     réverb dès le départ (sinon elle croiserait sèche, et la réverb
//     n'arriverait qu'avec la scène suivante). Ces temporaires sont
//     transmises à la scène suivante (destroy({ handover: true })), qui les
//     reprend sans coupure, ou arrêtées par un destroy() ordinaire.
// Les deux faces suivent les mêmes règles que le rendu au tick : le niveau
// part de l'enveloppe d'une balise conditionnelle en plein fondu, et une
// balise éteinte pour de bon (collectible consommé, présentoir vidé) ne
// s'ouvre jamais.
// Rampes natives (Howler.fade, AudioParam) : aucun tick ne tourne pendant le
// sas pour relire une rampe JS.

import { getInactiveFace } from "../../core/state.js";
import { NO_MUFFLE, spatialRendering } from "./spatial.js";
import { beaconVolumeFactor } from "./volume-factors.js";
import { buildEntitySoundEntry } from "./entity-sound-entry.js";

// `entities` : ./entity-sounds.js ; `reverbBusInput` : le bus de la
// scène ; `faceMuffle` : ./muffle.js ; `beaconConditionAllows` :
// ./entity-audio.js ; `oneShots` : ./oneshots.js.
export function createFaceCrossfade({ getSession, entities, reverbBusInput, faceMuffle, beaconConditionAllows, oneShots }) {
  const { entitySounds, otherEntitySounds } = entities;
  // Balises temporaires de la bascule en cours, par id d'entité.
  const temporaries = new Map();

  // Rend une promesse résolue à la fin du croisement. Scène simple : rien à
  // croiser, résolution immédiate.
  function crossfadeFaceSwap(durationMs) {
    if (!otherEntitySounds) return Promise.resolve();

    const session = getSession();
    const x = session.player.x;
    const beaconFactor = beaconVolumeFactor();
    const liveById = entities.liveEntitiesById();
    const otherWorld = getInactiveFace(session);
    const otherLiveById = entities.liveOtherEntitiesById(otherWorld);

    // Face quittée : du rendu net vers le rendu "autre face".
    for (const entry of entitySounds) {
      if (!entry.sound || entry.beaconSilenced) continue;
      const live = liveById.get(entry.entity.id);
      if (!live || live.present === false) continue;
      const open = spatialRendering(entry, live.x - x, NO_MUFFLE);
      const pan = open.pan;
      // × l'enveloppe de fondu d'une balise conditionnelle (voir
      // ./entity-audio.js) : on part du niveau réellement entendu.
      const openVolume = open.volume * beaconFactor * entry.beaconGain * entry.flyingVolumeFactor * (entry.beaconEnvelope ?? 1);
      const openCutoff = open.cutoff;
      entry.sound.update(pan, openVolume);
      entry.sound.setCutoff(openCutoff);
      entry.sound.fadeVolume(openVolume * faceMuffle.gain * entry.beaconCrossFaceGain, durationMs);
      entry.sound.rampCutoff(faceMuffle.lowpassHz, durationMs);
    }

    // Autre face : du rendu étouffé vers le rendu net.
    for (const entry of otherEntitySounds) {
      const live = otherLiveById.get(entry.entity.id);
      if (!live || live.present === false) continue; // dormante : rien à faire entendre
      if (!beaconConditionAllows(entry.beaconCondition, live)) continue;
      if (entities.isSpent(entry, live)) continue; // éteinte pour de bon

      let sound = entry.sound;
      let roleGain = entry.beaconRoleGain;
      let envelope = entry.beaconEnvelope ?? 1;
      if (!sound) {
        const rebuilt = buildEntitySoundEntry(entry.entity, session, { disableStagger: true });
        if (!rebuilt.sound) continue; // pas de balise continue (intermittente ou absente)
        sound = rebuilt.sound;
        roleGain = rebuilt.beaconRoleGain;
        envelope = 1; // jamais entendue à travers : aucun fondu en cours
        if (reverbBusInput) sound.sendToReverb(reverbBusInput, rebuilt.beaconReverbSend);
        temporaries.set(entry.entity.id, sound);
      }

      const open = spatialRendering(entry, live.x - x, NO_MUFFLE);
      const openVolume = open.volume * beaconFactor * roleGain * entry.flyingVolumeFactor * envelope;
      sound.update(open.pan, openVolume * faceMuffle.gain * entry.beaconCrossFaceGain);
      sound.setCutoff(faceMuffle.lowpassHz);
      sound.fadeVolume(openVolume, durationMs);
      sound.rampCutoff(open.cutoff, durationMs);
    }

    oneShots.crossfadeTrackedOneShots(x, durationMs, beaconFactor);

    return new Promise((resolve) => setTimeout(resolve, durationMs));
  }

  return { crossfadeFaceSwap, temporaries };
}
