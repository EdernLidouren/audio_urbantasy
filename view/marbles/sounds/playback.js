// Jeu des billes, sons de l'écran : la LECTURE. Ce qui touche à l'audio : les
// repères joués à leur place (playCue), la réverbération de la table, les
// roulements suivis frame par frame, la balise au survol, le préchargement et la
// musique de l'écran. Point d'entrée et vue d'ensemble : view/marbles/sounds.js.

import {
  MARBLE_SOUND_PROFILES,
  MARBLES_AUDIO,
  MARBLES_COLLISION,
  MARBLES_PITCH_VARIATION,
  MARBLES_ROLLS,
  MARBLES_SOUND_DEPTH,
} from "../../../config/marbles-values.js";
import { TUNING_DEFAULTS } from "../../../config/tuning.js";
import {
  clearMusicLayers,
  createReverbBus,
  playOneShot,
  playTrackedOneShot,
  preloadMusic,
  preloadOneShot,
  randomRate,
  setGlobalVolume,
  setMusicLayer,
} from "../../../lib/audio.js";
import { assetKeyMembers, resolveAsset } from "../../../lib/assets.js";
import { beaconVolumeFactor, interfaceVolumeFactor, musicVolumeFactor } from "../../audio/volume-factors.js";
import { positionOf, renderAt, renderPosition, rollRendering } from "./space.js";
import MARBLE_TYPES from "../../../marbles/types/index.js";

// Le profil sonore d'une bille : celui de son calibre.
const profileOf = (marble) => MARBLE_SOUND_PROFILES[MARBLE_TYPES[marble].size];

// Le chemin et le volume d'un repère ponctuel.
function cueSound(cue) {
  const gain = cue.gain ?? 1;
  if (cue.sound === "shuffle") return { key: MARBLES_AUDIO.shuffle, volume: gain * interfaceVolumeFactor() };
  if (cue.sound === "drop") return { key: profileOf(cue.marble).drop, volume: gain * interfaceVolumeFactor() };
  return { key: profileOf(cue.marble).beacon, volume: gain * beaconVolumeFactor() };
}

// La vitesse de lecture d'un son : tirée autour de 1 pour les familles qui varient
// (MARBLES_PITCH_VARIATION), 1 pour les autres, balises comprises.
const pitchOf = (sound) => randomRate(MARBLES_PITCH_VARIATION[sound] ?? 0);

// La réverbération de la table, le temps de l'écran (null : aucune, hors écran ou
// sans contexte audio).
let tableReverb = null;

export function openTableReverb() {
  closeTableReverb();
  tableReverb = createReverbBus(MARBLES_SOUND_DEPTH.reverb);
}

export function closeTableReverb() {
  tableReverb?.destroy();
  tableReverb = null;
}

// Les options de lecture d'un son à `place`, au volume `volume` de sa catégorie,
// à la vitesse de lecture `rate`.
function placedOptions(place, volume, rate = 1) {
  const { pan, gain, lowpassHz, reverbSend } = renderAt(place);
  const options = { volume: volume * gain, stereo: pan, rate, permanent: true };
  if (lowpassHz !== undefined) options.lowpassHz = lowpassHz;
  if (reverbSend > 0 && tableReverb?.input) Object.assign(options, { reverbSend, reverbBusInput: tableReverb.input });
  return options;
}

export function playCue(cue) {
  if (cue.sound === "roll") {
    startRoll(cue);
    return;
  }
  if (cue.sound === "collision") {
    playCollision(cue);
    return;
  }
  const { key, volume } = cueSound(cue);
  playAt(key, cue.place, volume, pitchOf(cue.sound), cue.sound);
}

function playAt(key, place, volume, rate, label, delayMs = 0) {
  try {
    playOneShot(resolveAsset(key), { ...placedOptions(place, volume, rate), delayMs });
  } catch (error) {
    console.warn(`son des billes indisponible (${label}, "${key}") : ${error.message}`);
  }
}

// La frappeuse tout de suite, la frappée `flamMs` plus tard, retardée par la chaîne
// audio (voir l'en-tête) ; chacune avec sa propre variation de ton.
function playCollision(cue) {
  const volume = (cue.gain ?? 1) * interfaceVolumeFactor();
  const impact = (marble, delayMs) => playAt(profileOf(marble).impact, cue.place, volume, pitchOf("impact"), "impact", delayMs);
  impact(cue.marble, 0);
  impact(cue.struck, MARBLES_COLLISION.flamMs);
}

// --- Roulements (voir l'en-tête) ---

// Les billes qui roulent en ce moment : { roll, elapsedMs, volume, pitch, voice,
// deadline }. `pitch` : la variation de ton tirée pour ce trajet, qui multiplie la
// vitesse de lecture du rendu.
const rollingVoices = new Set();

// Marge de l'échéance en temps réel d'un roulement, au-delà de sa durée : assez
// pour ne jamais couper un trajet qui reçoit ses frames.
const ROLL_DEADLINE_MARGIN_MS = 250;

function startRoll(cue) {
  const key = profileOf(cue.marble).roll;
  const style = MARBLES_ROLLS[cue.style];
  const roll = {
    path: cue.path.map((place) => positionOf(place)),
    durationMs: cue.durationMs,
    endRatio: style.endRatio,
    gain: style.gain ?? 1,
  };
  const rolling = { roll, elapsedMs: 0, volume: interfaceVolumeFactor(), pitch: pitchOf("roll"), voice: null, deadline: null };
  const start = rollRendering(roll, 0, rolling.volume);
  // L'envoi de réverbération n'est pilotable que s'il existe dès le départ : posé au
  // plus fort du chemin, puis ramené aussitôt à celui du départ.
  const send = Math.max(...roll.path.map((position) => renderPosition(position).reverbSend));
  try {
    rolling.voice = playTrackedOneShot(resolveAsset(key), {
      loop: true,
      permanent: true,
      volume: start.volume,
      stereo: start.pan,
      rate: start.rate * rolling.pitch,
      lowpassHz: start.lowpassHz,
      ...(send > 0 && tableReverb?.input ? { reverbSend: send, reverbBusInput: tableReverb.input } : {}),
    });
  } catch (error) {
    console.warn(`roulement de bille indisponible ("${key}") : ${error.message}`);
  }
  if (!rolling.voice) return;
  rolling.voice.setReverbSend(start.reverbSend);
  rolling.deadline = setTimeout(() => endRoll(rolling), cue.durationMs + ROLL_DEADLINE_MARGIN_MS);
  rollingVoices.add(rolling);
}

function endRoll(rolling) {
  clearTimeout(rolling.deadline);
  rolling.voice.stop();
  rollingVoices.delete(rolling);
}

// Le temps passe pour les billes qui roulent : chacune avance, ou s'arrête arrivée.
export function advanceRolls(deltaMs) {
  for (const rolling of rollingVoices) {
    rolling.elapsedMs += deltaMs;
    if (rolling.elapsedMs >= rolling.roll.durationMs) {
      endRoll(rolling);
      continue;
    }
    const { pan, volume, rate, lowpassHz, reverbSend } = rollRendering(rolling.roll, rolling.elapsedMs, rolling.volume);
    rolling.voice.update(pan, volume, lowpassHz);
    rolling.voice.setRate(rate * rolling.pitch);
    rolling.voice.setReverbSend(reverbSend);
  }
}

// Coupe tous les roulements : séquence passée, sortie de l'écran.
export function stopRolls() {
  for (const rolling of rollingVoices) endRoll(rolling);
}

// La balise au survol en cours, pour la couper à la suivante.
let focusBeacon = null;

// `place` : où est le curseur (voir l'en-tête) ; sans place, au centre (menus du
// sac et de la défausse).
export function playFocusBeacon(marble, place) {
  stopFocusBeacon();
  const key = profileOf(marble).beacon;
  try {
    focusBeacon = playTrackedOneShot(resolveAsset(key), placedOptions(place, beaconVolumeFactor()));
  } catch (error) {
    console.warn(`balise de bille indisponible ("${key}") : ${error.message}`);
  }
}

export function stopFocusBeacon() {
  focusBeacon?.stop();
  focusBeacon = null;
}

// Tous les sons de l'écran, décodés d'avance.
export function preloadMarblesAudio() {
  const keys = [MARBLES_AUDIO.shuffle, ...Object.values(MARBLE_SOUND_PROFILES).flatMap((profile) => Object.values(profile))];
  for (const member of keys.flatMap(assetKeyMembers)) preloadOneShot(member);
  for (const member of assetKeyMembers(MARBLES_AUDIO.music)) preloadMusic(member);
}

// --- Musique ---

const MUSIC_FADE_MS = TUNING_DEFAULTS.musicFadeMs;
const MUSIC_BREATHER_RANGE = { min: TUNING_DEFAULTS.musicBreatherMinMs, max: TUNING_DEFAULTS.musicBreatherMaxMs };

// La musique de l'écran, sur la couche de base du canal musique (lib/audio/music.js) ;
// la couche de la perception, propre à la ville, est vidée. Un seul morceau : en
// boucle ; plusieurs : enchaînés, avec une respiration entre deux, comme en ville.
export function startMarblesMusic() {
  const pool = MARBLES_AUDIO.music;
  setGlobalVolume("music", musicVolumeFactor());
  setMusicLayer("override", null, null, MUSIC_FADE_MS);
  setMusicLayer(
    "base",
    pool,
    { pickPath: () => resolveAsset(pool), loop: assetKeyMembers(pool).length === 1, breatherRange: MUSIC_BREATHER_RANGE },
    MUSIC_FADE_MS
  );
}

export function stopMarblesMusic() {
  clearMusicLayers(MUSIC_FADE_MS);
}
