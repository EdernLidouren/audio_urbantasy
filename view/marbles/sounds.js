// Jeu des billes : les SONS de l'écran. Aucune règle ici : ce qui se passe vient
// du journal (core/marbles.js), ce que chaque bille fait entendre de son profil
// sonore (champ `sound` de config/marbles-values.js/MARBLE_TYPES, profils dans
// MARBLE_SOUND_PROFILES).
//
// TROIS FAMILLES :
// - les sons d'ÉVÈNEMENT, un point d'accroche par type d'évènement du journal
//   (MARBLE_EVENT_CUES) : il dit quels REPÈRES l'évènement produit, et quand, sur
//   une ligne de temps propre au geste (eventCues). Le brassage du sac, puis chaque
//   pioche, une balise après l'autre ; la bille posée qui roule de la main à son
//   emplacement, puis sa chute, ou son choc contre l'occupante, qui roule à la
//   défausse ; les deux billes d'un échange qui roulent l'une vers l'autre ; la
//   balise de la bille active à la phase de son emplacement ; la bille usée qui
//   roule à la défausse ; les billes du triangle qui tournent ensemble, chacune
//   vers l'emplacement suivant. L'écran les met dans sa file de sons
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
// ROULEMENTS : un repère "roll" suit un chemin de places. Sa boucle de roulement
// (le `roll` du profil) joue en continu, et chaque frame (advanceRolls, appelée par
// l'onFrame de l'écran) la déplace : position et vitesse viennent de
// view/marbles/rolls.js, le rendu de la position, de renderPosition, comme une
// place. Le volume et la vitesse de lecture suivent la vitesse de la bille. Un
// menu ouvert par-dessus fige l'écran, donc le déplacement : chaque roulement a
// aussi une échéance en temps réel, qui le coupe s'il n'a plus de frames.
//
// VOLUMES : les balises (pioche, survol) suivent le volume des balises du jeu, elles
// ont vocation à être positionnées ; brassage, chutes, chocs et roulements, celui de
// l'interface ; la musique, celui de la musique. Tous les sons des billes sont PERMANENTS (jamais
// purgés, lib/audio/retention.js) et préchargés à l'ouverture
// (preloadMarblesAudio) : la première balise ne part pas en retard sur la touche.
// Un son manquant avertit en console, jamais de plantage.

import {
  MARBLE_SOUND_PROFILES,
  MARBLE_TYPES,
  MARBLES_AUDIO,
  MARBLES_ROLLS,
  MARBLES_SETTINGS,
  MARBLES_SOUND_DEPTH,
  MARBLES_SOUND_PLACES,
} from "../../config/marbles-values.js";
import { ROTATION_NEXT, SLOTS } from "../../core/marbles.js";
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
import { rollAt, rollDurationMs, rollEnvelope } from "./rolls.js";

// --- Validation au chargement ---

const TIMING_SETTINGS = ["shuffleToDrawMs", "drawSoundIntervalMs", "swapSoundDelayMs"];

// Échoue au chargement : une bille sans profil, ou un profil incomplet, se
// découvrirait sinon en pleine partie, en silence.
export function validateMarbleSounds(types, profiles, settings) {
  for (const [id, type] of Object.entries(types)) {
    if (!Object.hasOwn(profiles, type.sound)) throw new Error(`marbles : bille "${id}", profil sonore inconnu "${type.sound}".`);
  }
  for (const [name, profile] of Object.entries(profiles)) {
    for (const role of ["beacon", "drop", "roll", "impact"]) {
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
  for (const place of [...SLOTS, "discard"]) {
    checkNumber(places[place]?.x, `${place}.x`, -1, 1);
    checkNumber(places[place]?.y, `${place}.y`, 0, 1);
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

// Une vitesse nulle ferait un trajet sans fin.
export function validateRolls(rolls) {
  for (const style of SPEED_STYLES) {
    checkNumber(rolls[style]?.speed, `${style}.speed`, 0.01, 100);
    checkNumber(rolls[style]?.endRatio, `${style}.endRatio`, 0.01, 1);
  }
  checkNumber(rolls.rotation?.notchMs, "rotation.notchMs", 50, 5000);
  checkNumber(rolls.rotation?.endRatio, "rotation.endRatio", 0.01, 1);
  checkNumber(rolls.rotation?.gain, "rotation.gain", 0, 1);
  checkNumber(rolls.rotation?.dropGain, "rotation.dropGain", 0, 1);
  checkNumber(rolls.restRate, "restRate", 0.1, 1);
  checkNumber(rolls.fadeMs, "fadeMs", 0, 1000);
  checkNumber(rolls.impactToOutMs, "impactToOutMs", 0, 5000);
  checkNumber(rolls.outStaggerMs, "outStaggerMs", 0, 5000);
}

// Les styles dont la durée vient de la vitesse ; la rotation a ses crans.
const SPEED_STYLES = ["place", "swap", "out"];

validateSoundPlaces(MARBLES_SOUND_PLACES);
validateSoundDepth(MARBLES_SOUND_DEPTH);
validateRolls(MARBLES_ROLLS);

// --- Espace (pur) ---

// La position d'une place : { x, y } (voir l'en-tête).
export function positionOf(place, places = MARBLES_SOUND_PLACES) {
  if (place.kind === "slot") return places[place.slot];
  if (place.kind === "discard") return places.discard;
  const { fromX, toX, y } = places.hand;
  if (place.size <= 1) return { x: (fromX + toX) / 2, y };
  return { x: fromX + ((toX - fromX) * place.index) / (place.size - 1), y };
}

// Le rendu d'une place : { pan, gain, lowpassHz, reverbSend }. `gain` multiplie le
// volume de la catégorie ; `lowpassHz` est absent au plus près (aucun filtre).
// Sans place : centre, plein volume, sec.
export function renderAt(place, places = MARBLES_SOUND_PLACES, depth = MARBLES_SOUND_DEPTH) {
  if (!place) return { pan: 0, gain: 1, lowpassHz: undefined, reverbSend: 0 };
  return renderPosition(positionOf(place, places), depth);
}

// Le rendu d'une POSITION de la table, celle d'une place ou celle d'une bille qui
// roule entre deux.
export function renderPosition({ x, y }, depth = MARBLES_SOUND_DEPTH) {
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
export const discardPlace = () => ({ kind: "discard" });

// Le rendu d'une bille qui roule, `elapsedMs` après son départ, au volume `volume`
// de sa catégorie -> { pan, volume, rate, lowpassHz, reverbSend }. `roll` : `path`
// en positions, `durationMs`, `endRatio` (view/marbles/rolls.js), et `gain`
// (facultatif, 1 par défaut). Le passe-bas est toujours là, ouvert au plus près,
// pour être piloté tout le trajet.
export function rollRendering(roll, elapsedMs, volume, rolls = MARBLES_ROLLS, depth = MARBLES_SOUND_DEPTH) {
  const { position, speedRatio } = rollAt(roll, elapsedMs);
  const rendered = renderPosition(position, depth);
  const gain = roll.gain ?? 1;
  return {
    pan: rendered.pan,
    volume: volume * gain * rendered.gain * speedRatio * rollEnvelope(elapsedMs, roll.durationMs, rolls.fadeMs),
    rate: rolls.restRate + (1 - rolls.restRate) * speedRatio,
    lowpassHz: rendered.lowpassHz ?? depth.nearLowpassHz,
    reverbSend: rendered.reverbSend,
  };
}

// --- Repères d'évènement (pur) ---

// La ligne de temps d'un geste : les repères déjà posés, l'échéance de la
// prochaine balise de pioche (la suivante attend la précédente) et celle du
// prochain départ d'une bille usée. Un repère : { atMs, sound, marble?, place?,
// gain? } (`gain` multiplie le volume de sa catégorie) ; un roulement : { atMs,
// sound: "roll", marble, path, style, durationMs }, `path` étant la suite des places
// par où passe la bille.
function createTimeline(settings, { rolls, places }) {
  const cues = [];
  let nextDrawAt = 0;
  let nextWornAt = 0;
  const cue = (atMs, sound, marble, place, gain) => ({
    atMs,
    sound,
    ...(marble === undefined ? {} : { marble }),
    ...(place === undefined ? {} : { place }),
    ...(gain === undefined ? {} : { gain }),
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
    // Une bille roule le long de `path` (des places) à partir de `atMs` :
    // l'échéance de son arrivée.
    roll(atMs, marble, path, style) {
      const durationMs = rollDurationMs(
        path.map((place) => positionOf(place, places)),
        rolls[style]
      );
      cues.push({ atMs, sound: "roll", marble, path, style, durationMs });
      return atMs + durationMs;
    },
    // Une bille quitte `slot` pour la défausse à partir de `atMs`, et y tombe.
    out(atMs, marble, slot) {
      const arrival = this.roll(atMs, marble, [slotPlace(slot), discardPlace()], "out");
      cues.push(cue(arrival, "drop", marble, discardPlace()));
    },
    // Le triangle tourne de `notches` crans : chaque bille roule d'emplacement en
    // emplacement jusqu'au sien, toutes ensemble, puis s'y cale. `triangleAfter` :
    // le triangle après la rotation, d'où l'on remonte qui venait d'où.
    rotation(triangleAfter, notches) {
      for (const origin of SLOTS) {
        const slots = rotationPath(origin, notches);
        const destination = slots[slots.length - 1];
        const placed = triangleAfter[destination];
        if (placed === null) continue;
        const arrival = this.roll(0, placed.marble, slots.map(slotPlace), "rotation");
        cues.push(cue(arrival, "drop", placed.marble, slotPlace(destination), rolls.rotation.dropGain));
      }
    },
    // Une bille usée part à la défausse ; plusieurs, l'une après l'autre.
    worn(marble, slot) {
      this.out(nextWornAt, marble, slot);
      nextWornAt += rolls.outStaggerMs;
    },
  };
}

// Les emplacements par où passe la bille de `origin` quand le triangle tourne de
// `notches` crans, départ et arrivée compris : 1 cran, deux emplacements ; 3 crans,
// le tour complet, elle revient à sa place. L'ordre est celui du cœur
// (core/marbles.js/ROTATION_NEXT).
export function rotationPath(origin, notches) {
  const slots = [origin];
  for (let notch = 0; notch < notches; notch++) slots.push(ROTATION_NEXT[slots[slots.length - 1]]);
  return slots;
}

// Un point d'accroche par type d'évènement du journal : ce qu'il ajoute à la ligne
// de temps, ou null s'il est muet aujourd'hui. Un nouvel évènement a sa ligne ici
// (vérifié par le domaine marbles-view). `context` : `triangleAfter`, le triangle
// juste après l'action, pour l'échange, dont l'évènement ne nomme que les
// emplacements ; `nextDrawPlace()`, la place dans la main de la bille piochée
// suivante ; `placeFrom`, la place dans la main de la bille posée ; `struck`, la
// bille délogée par la pose en cours, que le journal dit AVANT la pose.
export const MARBLE_EVENT_CUES = {
  turnStarted: null,
  draw: (event, timeline, context) => timeline.draw(event.marble, context.nextDrawPlace()),
  drawSkipped: null,
  bagRegenerated: (event, timeline) => timeline.shuffle(),
  // La bille choisie roule la première (elle était en `a`, elle est maintenant en
  // `b`), puis l'autre, s'il y en avait une ; chacune tombe à son arrivée.
  swapped: (event, timeline, context, settings) => {
    const chosen = context.triangleAfter[event.b];
    const other = context.triangleAfter[event.a];
    if (chosen !== null) {
      const arrival = timeline.roll(0, chosen.marble, [slotPlace(event.a), slotPlace(event.b)], "swap");
      timeline.at(arrival, "drop", chosen.marble, slotPlace(event.b));
    }
    if (other !== null) {
      const arrival = timeline.roll(chosen === null ? 0 : settings.swapSoundDelayMs, other.marble, [slotPlace(event.b), slotPlace(event.a)], "swap");
      timeline.at(arrival, "drop", other.marble, slotPlace(event.a));
    }
  },
  // Le choc se joue avec la pose qui suit, à l'arrivée de la bille posée.
  knockout: (event, timeline, context) => {
    context.struck = event.marble;
  },
  removed: null,
  // L'usée roule à la défausse ; la délogée part avec le choc (placed).
  discarded: (event, timeline) => {
    if (event.cause === "wear") timeline.worn(event.marble, event.slot);
  },
  // La bille roule de la main à l'emplacement. Vide : elle y tombe. Occupé : le
  // choc des deux billes, puis la délogée roule à la défausse.
  placed: (event, timeline, context, settings, rolls) => {
    const to = slotPlace(event.slot);
    const arrival = timeline.roll(0, event.marble, [context.placeFrom, to], "place");
    if (context.struck === null) {
      timeline.at(arrival, "drop", event.marble, to);
      return;
    }
    timeline.at(arrival, "impact", event.marble, to);
    timeline.at(arrival, "impact", context.struck, to);
    timeline.out(arrival + rolls.impactToOutMs, context.struck, event.slot);
    context.struck = null;
  },
  hit: null,
  // La bille active fait entendre sa voix quand vient la phase de son emplacement,
  // avec l'étape de la séquence qui dit ce qu'elle produit.
  phase: (event, timeline) => timeline.now("beacon", event.marble, slotPlace(event.slot)),
  phaseSkipped: null,
  effect: null,
  wear: null,
  impact: null,
  // Un cran par tour aujourd'hui ; le jour où un effet en ajoutera (jusqu'à 3, un
  // tour complet), l'évènement dira combien, et rotation() suivra.
  rotation: (event, timeline) => timeline.rotation(event.triangle, 1),
  turnEnded: null,
  gameOver: null,
};

// Les repères des évènements d'un geste, dans l'ordre du journal. `shuffleFirst` :
// le sac vient d'être constitué (ouverture de la partie), ce que le journal ne dit
// pas, la simulation mélangeant le sac à sa création. `handAfter` : la main après le
// geste ; une pioche ajoute sa bille au bout de la main, les billes piochées sont
// donc les dernières, dans l'ordre. Sans elle, les balises de pioche s'entendent au
// centre. `placeFrom` : d'où part la bille posée, sa place dans la main AVANT la
// pose (le journal ne la dit pas) ; sans elle, du milieu de la main. `motion` :
// les réglages des roulements et les places, pour les durées des trajets.
export function eventCues(
  events,
  { triangleAfter = null, handAfter = null, shuffleFirst = false, placeFrom = handPlace(0, 1) } = {},
  settings = MARBLES_SETTINGS,
  { rolls = MARBLES_ROLLS, places = MARBLES_SOUND_PLACES } = {}
) {
  const timeline = createTimeline(settings, { rolls, places });
  const drawCount = events.filter((event) => event.type === "draw").length;
  let drawn = 0;
  const context = {
    triangleAfter,
    placeFrom,
    struck: null,
    nextDrawPlace: () => (handAfter === null ? undefined : handPlace(handAfter.length - drawCount + drawn++, handAfter.length)),
  };
  if (shuffleFirst) timeline.shuffle();
  for (const event of events) {
    const cue = MARBLE_EVENT_CUES[event.type];
    if (cue) cue(event, timeline, context, settings, rolls);
  }
  return timeline.cues;
}

// --- Lecture ---

const profileOf = (marble) => MARBLE_SOUND_PROFILES[MARBLE_TYPES[marble].sound];

// Le chemin et le volume d'un repère ponctuel.
function cueSound(cue) {
  const gain = cue.gain ?? 1;
  if (cue.sound === "shuffle") return { key: MARBLES_AUDIO.shuffle, volume: gain * interfaceVolumeFactor() };
  if (cue.sound === "drop") return { key: profileOf(cue.marble).drop, volume: gain * interfaceVolumeFactor() };
  if (cue.sound === "impact") return { key: profileOf(cue.marble).impact, volume: gain * interfaceVolumeFactor() };
  return { key: profileOf(cue.marble).beacon, volume: gain * beaconVolumeFactor() };
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
  if (cue.sound === "roll") {
    startRoll(cue);
    return;
  }
  const { key, volume } = cueSound(cue);
  try {
    playOneShot(resolveAsset(key), placedOptions(cue.place, volume));
  } catch (error) {
    console.warn(`son des billes indisponible (${cue.sound}, "${key}") : ${error.message}`);
  }
}

// --- Roulements (voir l'en-tête) ---

// Les billes qui roulent en ce moment : { roll, elapsedMs, volume, voice, deadline }.
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
  const rolling = { roll, elapsedMs: 0, volume: interfaceVolumeFactor(), voice: null, deadline: null };
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
      rate: start.rate,
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
    rolling.voice.setRate(rate);
    rolling.voice.setReverbSend(reverbSend);
  }
}

// Coupe tous les roulements : séquence passée, sortie de l'écran.
export function stopRolls() {
  for (const rolling of rollingVoices) endRoll(rolling);
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
