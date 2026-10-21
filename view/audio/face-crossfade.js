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
//     créée ici, partie de leur niveau "autre face". Ces temporaires sont
//     transmises à la scène suivante (destroy({ handover: true })), qui les
//     reprend sans coupure, ou arrêtées par un destroy() ordinaire.
// Rampes natives (Howler.fade, AudioParam) : aucun tick ne tourne pendant le
// sas pour relire une rampe JS.

import { getInactiveFace } from "../../core/state.js";
import { NO_MUFFLE, spatialRendering } from "./spatial.js";
import { beaconVolumeFactor } from "./volume-factors.js";
import { buildEntitySoundEntry } from "./entity-sound-entry.js";

// `entities` : ./entity-sounds.js ; `faceMuffle` : ./muffle.js ;
// `beaconConditionAllows` : ./entity-audio.js ; `oneShots` : ./oneshots.js.
export function createFaceCrossfade({ getSession, entities, faceMuffle, beaconConditionAllows, oneShots }) {
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
      const openVolume = open.volume * beaconFactor * entry.beaconGain * entry.flyingVolumeFactor;
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
      if (!beaconConditionAllows(entry.entity.sounds.beacon?.condition, live)) continue;

      let sound = entry.sound;
      let roleGain = entry.beaconRoleGain;
      if (!sound) {
        const rebuilt = buildEntitySoundEntry(entry.entity, session, { disableStagger: true });
        if (!rebuilt.sound) continue; // pas de balise continue (intermittente ou absente)
        sound = rebuilt.sound;
        roleGain = rebuilt.beaconRoleGain;
        temporaries.set(entry.entity.id, sound);
      }

      const open = spatialRendering(entry, live.x - x, NO_MUFFLE);
      const openVolume = open.volume * beaconFactor * roleGain * entry.flyingVolumeFactor;
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
