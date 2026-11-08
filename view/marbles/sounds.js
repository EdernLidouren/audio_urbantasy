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
//   chutes d'un échange ; la balise de la bille active à la phase de son
//   emplacement. L'écran les met dans sa file de sons
//   (view/marbles/sound-queue.js) et les joue à leur échéance : le son seul
//   attend, jamais le joueur ;
// - la BALISE AU SURVOL (playFocusBeacon) : la voix de la bille sur laquelle le
//   curseur arrive, une seule à la fois : la suivante coupe la précédente, pour que
//   des flèches rapides ne s'empilent pas ;
// - la MUSIQUE de l'écran (startMarblesMusic, stopMarblesMusic).
//
// ESPACE : un son de bille s'entend à sa PLACE sur la table, un repère
// { kind: "hand", index, size } ou { kind: "slot", slot } : la balise d'une bille
// piochée à sa place dans la main, la chute d'une pose et la balise de phase à
// l'emplacement, la balise au survol là où est le curseur. renderAt traduit la
// place en rendu : panoramique gauche-droite et PROFONDEUR (volume, passe-bas, part
// de réverbération), d'après config/marbles-values.js/MARBLES_SOUND_PLACES et
// MARBLES_SOUND_DEPTH. Stéréo et volume, jamais de HRTF (CLAUDE.md). La table a sa
// propre réverbération, créée à l'ouverture de l'écran et défaite à sa sortie. Sans
// place (brassage, menus du sac et de la défausse) : au centre, sec, plein volume.
//
// VOLUMES : les balises (pioche, survol) suivent le volume des balises du jeu, elles
// ont vocation à être positionnées ; brassage et chutes, celui de l'interface ; la
// musique, celui de la musique. Tous les sons des billes sont PERMANENTS (jamais
// purgés, lib/audio/retention.js) et préchargés à l'ouverture
// (preloadMarblesAudio) : la première balise ne part pas en retard sur la touche.
// Un son manquant avertit en console, jamais de plantage.

import {
  MARBLE_SOUND_PROFILES,
  MARBLE_TYPES,
  MARBLES_AUDIO,
  MARBLES_SETTINGS,
  MARBLES_SOUND_DEPTH,
  MARBLES_SOUND_PLACES,
} from "../../config/marbles-values.js";
import { SLOTS } from "../../core/marbles.js";
import { TUNING_DEFAULTS } from "../../config/tuning.js";
import {
  clearMusicLayers,
  createReverbBus,
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

function checkNumber(value, name, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`marbles : ${name} doit être un nombre entre ${min} et ${max}.`);
  }
}

// Chaque place a son panoramique dans [-1, 1] et sa profondeur dans [0, 1].
export function validateSoundPlaces(places) {
  checkNumber(places.hand?.fromX, "hand.fromX", -1, 1);
  checkNumber(places.hand?.toX, "hand.toX", -1, 1);
  checkNumber(places.hand?.y, "hand.y", 0, 1);
  for (const slot of SLOTS) {
    checkNumber(places[slot]?.x, `${slot}.x`, -1, 1);
    checkNumber(places[slot]?.y, `${slot}.y`, 0, 1);
  }
}

export function validateSoundDepth(depth) {
  checkNumber(depth.farGainDb, "farGainDb", -60, 0);
  checkNumber(depth.nearLowpassHz, "nearLowpassHz", 20, 24000);
  checkNumber(depth.farLowpassHz, "farLowpassHz", 20, 24000);
  checkNumber(depth.nearReverbSend, "nearReverbSend", 0, 1);
  checkNumber(depth.farReverbSend, "farReverbSend", 0, 1);
  checkNumber(depth.reverb?.durationSec, "reverb.durationSec", 0.05, 10);
  checkNumber(depth.reverb?.decay, "reverb.decay", 0.1, 100);
  checkNumber(depth.reverb?.wet, "reverb.wet", 0, 1);
}

validateSoundPlaces(MARBLES_SOUND_PLACES);
validateSoundDepth(MARBLES_SOUND_DEPTH);

// --- Espace (pur) ---

// La position d'une place : { x, y } (voir l'en-tête).
export function positionOf(place, places = MARBLES_SOUND_PLACES) {
  if (place.kind === "slot") return places[place.slot];
  const { fromX, toX, y } = places.hand;
  if (place.size <= 1) return { x: (fromX + toX) / 2, y };
  return { x: fromX + ((toX - fromX) * place.index) / (place.size - 1), y };
}

// Le rendu d'une place : { pan, gain, lowpassHz, reverbSend }. `gain` multiplie le
// volume de la catégorie ; `lowpassHz` est absent au plus près (aucun filtre).
// Sans place : centre, plein volume, sec.
export function renderAt(place, places = MARBLES_SOUND_PLACES, depth = MARBLES_SOUND_DEPTH) {
  if (!place) return { pan: 0, gain: 1, lowpassHz: undefined, reverbSend: 0 };
  const { x, y } = positionOf(place, places);
  return {
    pan: x,
    gain: 10 ** ((depth.farGainDb * y) / 20),
    // L'oreille entend la fréquence sur une échelle logarithmique : une rampe
    // linéaire sonnerait comme un saut puis presque rien.
    lowpassHz: y > 0 ? depth.nearLowpassHz * (depth.farLowpassHz / depth.nearLowpassHz) ** y : undefined,
    reverbSend: depth.nearReverbSend + (depth.farReverbSend - depth.nearReverbSend) * y,
  };
}

export const slotPlace = (slot) => ({ kind: "slot", slot });
export const handPlace = (index, size) => ({ kind: "hand", index, size });

// --- Repères d'évènement (pur) ---

// La ligne de temps d'un geste : les repères déjà posés, et l'échéance de la
// prochaine balise de pioche (la suivante attend la précédente). Un repère :
// { atMs, sound, marble?, place? }.
function createTimeline(settings) {
  const cues = [];
  let nextDrawAt = 0;
  const cue = (atMs, sound, marble, place) => ({
    atMs,
    sound,
    ...(marble === undefined ? {} : { marble }),
    ...(place === undefined ? {} : { place }),
  });
  return {
    cues,
    now(sound, marble, place) {
      cues.push(cue(0, sound, marble, place));
    },
    at(atMs, sound, marble, place) {
      cues.push(cue(atMs, sound, marble, place));
    },
    shuffle() {
      cues.push(cue(0, "shuffle"));
      nextDrawAt = Math.max(nextDrawAt, settings.shuffleToDrawMs);
    },
    draw(marble, place) {
      cues.push(cue(nextDrawAt, "beacon", marble, place));
      nextDrawAt += settings.drawSoundIntervalMs;
    },
  };
}

// Un point d'accroche par type d'évènement du journal : ce qu'il ajoute à la ligne
// de temps, ou null s'il est muet aujourd'hui. Un nouvel évènement a sa ligne ici
// (vérifié par le domaine marbles-view). `context` : `triangleAfter`, le triangle
// juste après l'action, pour l'échange, dont l'évènement ne nomme que les
// emplacements ; `nextDrawPlace()`, la place dans la main de la bille piochée
// suivante.
export const MARBLE_EVENT_CUES = {
  turnStarted: null,
  draw: (event, timeline, context) => timeline.draw(event.marble, context.nextDrawPlace()),
  drawSkipped: null,
  bagRegenerated: (event, timeline) => timeline.shuffle(),
  // La bille choisie d'abord (elle était en `a`, elle est maintenant en `b`), puis
  // l'autre, s'il y en avait une.
  swapped: (event, timeline, context, settings) => {
    const chosen = context.triangleAfter[event.b];
    const other = context.triangleAfter[event.a];
    if (chosen !== null) timeline.now("drop", chosen.marble, slotPlace(event.b));
    if (other !== null) timeline.at(chosen === null ? 0 : settings.swapSoundDelayMs, "drop", other.marble, slotPlace(event.a));
  },
  knockout: null,
  removed: null,
  discarded: null,
  placed: (event, timeline) => timeline.now("drop", event.marble, slotPlace(event.slot)),
  hit: null,
  // La bille active fait entendre sa voix quand vient la phase de son emplacement,
  // avec l'étape de la séquence qui dit ce qu'elle produit.
  phase: (event, timeline) => timeline.now("beacon", event.marble, slotPlace(event.slot)),
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
// pas, la simulation mélangeant le sac à sa création. `handAfter` : la main après le
// geste ; une pioche ajoute sa bille au bout de la main, les billes piochées sont
// donc les dernières, dans l'ordre. Sans elle, les balises de pioche s'entendent au
// centre.
export function eventCues(events, { triangleAfter = null, handAfter = null, shuffleFirst = false } = {}, settings = MARBLES_SETTINGS) {
  const timeline = createTimeline(settings);
  const drawCount = events.filter((event) => event.type === "draw").length;
  let drawn = 0;
  const context = {
    triangleAfter,
    nextDrawPlace: () => (handAfter === null ? undefined : handPlace(handAfter.length - drawCount + drawn++, handAfter.length)),
  };
  if (shuffleFirst) timeline.shuffle();
  for (const event of events) {
    const cue = MARBLE_EVENT_CUES[event.type];
    if (cue) cue(event, timeline, context, settings);
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

// Les options de lecture d'un son à `place`, au volume `volume` de sa catégorie.
function placedOptions(place, volume) {
  const { pan, gain, lowpassHz, reverbSend } = renderAt(place);
  const options = { volume: volume * gain, stereo: pan, permanent: true };
  if (lowpassHz !== undefined) options.lowpassHz = lowpassHz;
  if (reverbSend > 0 && tableReverb?.input) Object.assign(options, { reverbSend, reverbBusInput: tableReverb.input });
  return options;
}

export function playCue(cue) {
  const { key, volume } = cueSound(cue);
  try {
    playOneShot(resolveAsset(key), placedOptions(cue.place, volume));
  } catch (error) {
    console.warn(`son des billes indisponible (${cue.sound}, "${key}") : ${error.message}`);
  }
}

// DÉMONSTRATION des places (mode debug, Maj+P) : la même balise à chaque place,
// de la plus proche à la plus lointaine, pour régler l'espace à l'oreille
// (MARBLES_SOUND_PLACES, MARBLES_SOUND_DEPTH). Une main de 5 : à gauche, au
// centre, à droite ; puis les deux bases et la pointe.
const DEMO_INTERVAL_MS = 700;

export function placesDemoCues(marble) {
  const places = [handPlace(0, 5), handPlace(2, 5), handPlace(4, 5), slotPlace("leftBase"), slotPlace("rightBase"), slotPlace("apex")];
  return places.map((place, index) => ({ atMs: index * DEMO_INTERVAL_MS, sound: "beacon", marble, place }));
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
