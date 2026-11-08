// Jeu des billes : les SONS de l'écran. Aucune règle ici : ce qui se passe vient
// du journal (core/marbles.js), ce que chaque bille fait entendre de son profil
// sonore (champ `sound` de config/marbles-values.js/MARBLE_TYPES, profils dans
// MARBLE_SOUND_PROFILES).
//
// TROIS FAMILLES :
// - les sons d'ÉVÈNEMENT, un point d'accroche par type d'évènement du journal
//   (MARBLE_EVENT_CUES) : il dit quels REPÈRES l'évènement produit, et quand, sur
//   une ligne de temps propre au geste (eventCues). Le brassage du sac, puis chaque
//   pioche, une balise après l'autre ; la chute d'une bille posée ; les deux
//   chutes d'un échange. L'écran les met dans sa file de sons
//   (view/marbles/sound-queue.js) et les joue à leur échéance : le son seul
//   attend, jamais le joueur ;
// - la BALISE AU SURVOL (playFocusBeacon) : la voix de la bille sur laquelle le
//   curseur arrive, une seule à la fois : la suivante coupe la précédente, pour que
//   des flèches rapides ne s'empilent pas ;
// - la MUSIQUE de l'écran (startMarblesMusic, stopMarblesMusic).
//
// VOLUMES : les balises (pioche, survol) suivent le volume des balises du jeu, elles
// ont vocation à être positionnées ; brassage et chutes, celui de l'interface ; la
// musique, celui de la musique. Tous les sons des billes sont PERMANENTS (jamais
// purgés, lib/audio/retention.js) et préchargés à l'ouverture
// (preloadMarblesAudio) : la première balise ne part pas en retard sur la touche.
// Un son manquant avertit en console, jamais de plantage.

import { MARBLE_SOUND_PROFILES, MARBLE_TYPES, MARBLES_AUDIO, MARBLES_SETTINGS } from "../../config/marbles-values.js";
import { TUNING_DEFAULTS } from "../../config/tuning.js";
import {
  clearMusicLayers,
  playOneShot,
  playTrackedOneShot,
  preloadMusic,
  preloadOneShot,
  setGlobalVolume,
  setMusicLayer,
} from "../../lib/audio.js";
import { assetKeyMembers, resolveAsset } from "../../lib/assets.js";
import { beaconVolumeFactor, interfaceVolumeFactor, musicVolumeFactor } from "../audio/volume-factors.js";

// --- Validation au chargement ---

const TIMING_SETTINGS = ["shuffleToDrawMs", "drawSoundIntervalMs", "swapSoundDelayMs"];

// Échoue au chargement : une bille sans profil, ou un profil incomplet, se
// découvrirait sinon en pleine partie, en silence.
export function validateMarbleSounds(types, profiles, settings) {
  for (const [id, type] of Object.entries(types)) {
    if (!Object.hasOwn(profiles, type.sound)) throw new Error(`marbles : bille "${id}", profil sonore inconnu "${type.sound}".`);
  }
  for (const [name, profile] of Object.entries(profiles)) {
    for (const role of ["beacon", "drop"]) {
      if (typeof profile[role] !== "string") throw new Error(`marbles : profil sonore "${name}" sans ${role}.`);
    }
  }
  for (const name of TIMING_SETTINGS) {
    const value = settings[name];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`marbles : ${name} doit être un nombre >= 0.`);
  }
}

validateMarbleSounds(MARBLE_TYPES, MARBLE_SOUND_PROFILES, MARBLES_SETTINGS);

// --- Repères d'évènement (pur) ---

// La ligne de temps d'un geste : les repères déjà posés, et l'échéance de la
// prochaine balise de pioche (la suivante attend la précédente).
function createTimeline(settings) {
  const cues = [];
  let nextDrawAt = 0;
  return {
    cues,
    now(sound, marble) {
      cues.push(marble === undefined ? { atMs: 0, sound } : { atMs: 0, sound, marble });
    },
    at(atMs, sound, marble) {
      cues.push({ atMs, sound, marble });
    },
    shuffle() {
      cues.push({ atMs: 0, sound: "shuffle" });
      nextDrawAt = Math.max(nextDrawAt, settings.shuffleToDrawMs);
    },
    draw(marble) {
      cues.push({ atMs: nextDrawAt, sound: "beacon", marble });
      nextDrawAt += settings.drawSoundIntervalMs;
    },
  };
}

// Un point d'accroche par type d'évènement du journal : ce qu'il ajoute à la ligne
// de temps, ou null s'il est muet aujourd'hui. Un nouvel évènement a sa ligne ici
// (vérifié par le domaine marbles-view). `context.triangleAfter` : le triangle
// juste après l'action, pour l'échange, dont l'évènement ne nomme que les
// emplacements.
export const MARBLE_EVENT_CUES = {
  turnStarted: null,
  draw: (event, timeline) => timeline.draw(event.marble),
  drawSkipped: null,
  bagRegenerated: (event, timeline) => timeline.shuffle(),
  // La bille choisie d'abord (elle était en `a`, elle est maintenant en `b`), puis
  // l'autre, s'il y en avait une.
  swapped: (event, timeline, context, settings) => {
    const chosen = context.triangleAfter[event.b];
    const other = context.triangleAfter[event.a];
    if (chosen !== null) timeline.now("drop", chosen.marble);
    if (other !== null) timeline.at(chosen === null ? 0 : settings.swapSoundDelayMs, "drop", other.marble);
  },
  knockout: null,
  removed: null,
  discarded: null,
  placed: (event, timeline) => timeline.now("drop", event.marble),
  hit: null,
  phase: null,
  phaseSkipped: null,
  effect: null,
  wear: null,
  impact: null,
  rotation: null,
  turnEnded: null,
  gameOver: null,
};

// Les repères des évènements d'un geste, dans l'ordre du journal. `shuffleFirst` :
// le sac vient d'être constitué (ouverture de la partie), ce que le journal ne dit
// pas, la simulation mélangeant le sac à sa création.
export function eventCues(events, { triangleAfter = null, shuffleFirst = false } = {}, settings = MARBLES_SETTINGS) {
  const timeline = createTimeline(settings);
  if (shuffleFirst) timeline.shuffle();
  for (const event of events) {
    const cue = MARBLE_EVENT_CUES[event.type];
    if (cue) cue(event, timeline, { triangleAfter }, settings);
  }
  return timeline.cues;
}

// --- Lecture ---

const profileOf = (marble) => MARBLE_SOUND_PROFILES[MARBLE_TYPES[marble].sound];

// Le chemin et le volume d'un repère.
function cueSound(cue) {
  if (cue.sound === "shuffle") return { key: MARBLES_AUDIO.shuffle, volume: interfaceVolumeFactor() };
  if (cue.sound === "drop") return { key: profileOf(cue.marble).drop, volume: interfaceVolumeFactor() };
  return { key: profileOf(cue.marble).beacon, volume: beaconVolumeFactor() };
}

export function playCue(cue) {
  const { key, volume } = cueSound(cue);
  try {
    playOneShot(resolveAsset(key), { volume, permanent: true });
  } catch (error) {
    console.warn(`son des billes indisponible (${cue.sound}, "${key}") : ${error.message}`);
  }
}

// La balise au survol en cours, pour la couper à la suivante.
let focusBeacon = null;

export function playFocusBeacon(marble) {
  stopFocusBeacon();
  const key = profileOf(marble).beacon;
  try {
    focusBeacon = playTrackedOneShot(resolveAsset(key), { volume: beaconVolumeFactor(), permanent: true });
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
  const keys = [MARBLES_AUDIO.shuffle, ...Object.values(MARBLE_SOUND_PROFILES).flatMap((profile) => [profile.beacon, profile.drop])];
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
