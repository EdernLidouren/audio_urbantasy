// SONS DE PROXIMITÉ : une entité qui RÉPOND à l'approche du joueur —
// approachSound quand il entre dans sa zone d'interaction, leaveSound quand
// il en sort, et proximityLoop, une boucle tant qu'il s'y tient (ex. une
// porte automatique de boutique : elle s'ouvre, sa clochette sonne, elle se
// referme ; voir entities/types/automatic_sliding_door.js,
// doc/entity-model.md/"Sons de proximité"). Rendu PUR : aucune règle de
// jeu, rien dans le core ni dans la sauvegarde — l'interaction avec l'entité
// reste libre, quel que soit l'état de ses sons.
//
// Chaque entité concernée a un petit état, `open` (« ouverte » : le dernier
// son joué est son approachSound) et `busy` (un de ses deux sons joue
// encore), et deux règles :
//   - joueur DANS la zone, entité fermée, aucun son en cours -> approachSound ;
//   - joueur HORS de la zone depuis proximityHoldMs, entité ouverte, aucun
//     son en cours -> leaveSound.
// Ce qui se passe entre les deux en découle sans cas particulier : un départ
// pendant l'approachSound attend sa fin ET le délai ; un retour pendant le
// délai l'annule ; un retour pendant le leaveSound rouvre à sa fin. Un son
// n'est jamais coupé. Une entité qui ne déclare qu'un des deux rôles bascule
// en silence pour l'autre. La boucle joue quand le joueur est dans la zone,
// l'entité ouverte et aucun son en cours ; elle s'éteint en fondu
// (proximityLoopFadeMs) dès qu'il en sort.
//
// SONS CONDITIONNELS : chaque rôle peut porter une `condition` du script,
// comme la balise (voir doc/entity-model.md/"Sons conditionnels"), relue à
// chaque tick. approachSound fausse : l'entité NE S'OUVRE PAS, elle reste
// fermée (une boutique fermée ne s'ouvre pas à votre approche ; si vous êtes
// devant quand la condition redevient vraie, elle s'ouvre à ce moment-là).
// leaveSound fausse : elle se ferme en silence. proximityLoop fausse : la
// boucle s'éteint en fondu.
//
// Temps compté en TICKS de la scène (voir lib/loop.js/TICK_MS), jamais à
// l'horloge murale : un menu ouvert fige la scène, et le délai avec elle.
// Une entité déjà dans la zone à la première mise à jour (le joueur arrive
// par elle) est OUVERTE d'emblée, sans son. Une entité dormante (present
// false) ou disparue oublie son état : elle repart de zéro à son retour.

import { TICK_MS } from "../../lib/loop.js";
import { createPositionedSound, randomRate } from "../../lib/audio.js";
import { resolveAsset } from "../../lib/assets.js";
import { spatialRendering } from "./spatial.js";
import { beaconVolumeFactor } from "./volume-factors.js";

// FILET : durée maximale (ms, temps de jeu) d'un son de proximité. Si sa fin
// n'est jamais signalée (contexte audio suspendu, lecture bloquée),
// l'entité est libérée passé ce délai au lieu de rester « en cours » pour
// toujours. Bien au-delà de tout son de porte : un invariant de sécurité,
// pas un réglage de ressenti.
const MAX_PROXIMITY_SOUND_MS = 15000;

// `conditionAllows(condition, live)` : l'évaluateur des sons conditionnels
// (voir ./entity-audio.js/beaconConditionAllows), vrai sans condition.
export function createProximitySounds({ entities, oneShots, effectiveMuffle, reverbBusInput, conditionAllows }) {
  // id d'entité -> { open, busy, busyMs, outsideMs, loop, loopOn, loopStopMs }.
  // outsideMs : temps passé hors de la zone depuis la dernière sortie (0
  // dans la zone) ; busyMs : depuis le début du son en cours (voir le
  // filet) ; loop : voix de la boucle, loopOn : elle doit jouer ;
  // loopStopMs : temps restant avant l'arrêt réel, après son fondu.
  const states = new Map();
  // Une fin de son peut arriver après la destruction de la scène (bascule de
  // face, transition) : elle ne doit plus toucher à rien.
  let destroyed = false;
  let paused = false;

  function play(entry, live, sound, state, x) {
    state.busy = true;
    state.busyMs = 0;
    oneShots.playTransitionSound(entry, live.x - x, sound, effectiveMuffle(entry), {
      onEnd: () => {
        if (!destroyed) state.busy = false;
      },
    });
  }

  // Voix de la boucle, créée dès que l'entité est vue puis aussitôt arrêtée,
  // comme une balise dormante : décodée et prête quand elle servira.
  // cacheKey propre au rôle : jamais confondue avec la balise de l'entité.
  function createLoop(entry) {
    let file;
    try {
      file = resolveAsset(entry.proximityLoop.path);
    } catch (error) {
      console.warn(`proximity: boucle indisponible ("${entry.proximityLoop.path}") : ${error.message}`);
      return null;
    }
    const loop = createPositionedSound(file, {
      rate: randomRate(entry.proximityLoop.pitchVariation),
      cacheKey: `${entry.entity.id}#proximityLoop`,
    });
    loop.stop();
    if (reverbBusInput) loop.sendToReverb(reverbBusInput, entry.proximityLoop.reverbSend);
    return loop;
  }

  // Met la boucle en accord avec `wanted`, et la place à chaque tick où elle
  // joue (pan, volume, passe-bas : le même rendu qu'une balise continue).
  function updateLoop(entry, live, state, wanted, x) {
    const loop = state.loop;
    if (!loop) return;
    if (wanted) {
      if (!state.loopOn || state.loopStopMs > 0) {
        if (!state.loopOn && !paused) loop.resume();
        state.loopOn = true;
        state.loopStopMs = 0;
      }
      if (loop.isStuck()) loop.resume();
      const { pan, volume, cutoff } = spatialRendering(entry, live.x - x, effectiveMuffle(entry));
      loop.update(pan, volume * beaconVolumeFactor() * entry.proximityLoop.gain);
      loop.setCutoff(cutoff);
      return;
    }
    if (!state.loopOn) return;
    if (state.loopStopMs === 0) {
      loop.fadeVolume(0, entry.proximityLoopFadeMs);
      state.loopStopMs = entry.proximityLoopFadeMs;
      return;
    }
    state.loopStopMs -= TICK_MS;
    if (state.loopStopMs <= 0) {
      loop.stop();
      state.loopOn = false;
      state.loopStopMs = 0;
    }
  }

  function forget(id) {
    const state = states.get(id);
    if (state && state.loop) state.loop.stop();
    states.delete(id);
  }

  // À chaque tick de la scène, avec la position du joueur et la photo des
  // entités vivantes du tick (voir ./entity-sounds.js/liveEntitiesById).
  function update(x, liveById) {
    for (const entry of entities.entitySounds) {
      if (!entry.approachSound && !entry.leaveSound && !entry.proximityLoop) continue;
      const id = entry.entity.id;
      const live = liveById.get(id);
      if (!live || live.present === false) {
        forget(id);
        continue;
      }
      const inside = Math.abs(live.x - x) <= entry.interactRange;
      let state = states.get(id);
      if (!state) {
        state = { open: inside, busy: false, busyMs: 0, outsideMs: 0, loop: null, loopOn: false, loopStopMs: 0 };
        if (entry.proximityLoop) state.loop = createLoop(entry);
        states.set(id, state);
      }
      state.outsideMs = inside ? 0 : state.outsideMs + TICK_MS;
      if (state.busy) {
        state.busyMs += TICK_MS;
        if (state.busyMs >= MAX_PROXIMITY_SOUND_MS) state.busy = false;
      }
      const allows = (sound) => Boolean(sound) && conditionAllows(sound.condition, live);
      if (!state.busy) {
        if (inside && !state.open && (!entry.approachSound || allows(entry.approachSound))) {
          state.open = true;
          if (entry.approachSound) play(entry, live, entry.approachSound, state, x);
        } else if (!inside && state.open && state.outsideMs >= entry.proximityHoldMs) {
          state.open = false;
          if (allows(entry.leaveSound)) play(entry, live, entry.leaveSound, state, x);
        }
      }
      updateLoop(entry, live, state, inside && state.open && !state.busy && allows(entry.proximityLoop), x);
    }
  }

  // Pause / reprise des boucles derrière un menu, avec les balises (voir
  // ./entity-audio.js/pauseBeacons) : la scène ne tourne plus, une boucle
  // ne doit pas continuer seule.
  function pauseLoops() {
    paused = true;
    for (const state of states.values()) {
      if (state.loop && state.loopOn) state.loop.pause();
    }
  }
  function resumeLoops() {
    paused = false;
    for (const state of states.values()) {
      if (state.loop && state.loopOn) state.loop.resume();
    }
  }

  function destroy() {
    destroyed = true;
    for (const state of states.values()) {
      if (state.loop) state.loop.stop();
    }
    states.clear();
  }

  return { update, pauseLoops, resumeLoops, destroy };
}
