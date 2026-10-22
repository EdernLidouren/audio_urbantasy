// COUCHES GLOBALES d'une scène : musique et ambiances, non spatialisées
// (canaux globaux, voir lib/audio.js). Chaque canal superpose des couches
// déclarées, nommées par leur rôle dans lib/audio : la scène est la couche
// "base", la perception surnaturelle la couche "override" (elle prime sur la
// scène), la météo la surcouche d'ambiance "overlay" (superposée). Un canal
// ne s'interrompt que si l'identité DÉCLARÉE d'une couche change
// réellement, jamais pour "relancer la même chose" (voir
// lib/audio.js/setMusicLayer, syncAmbienceLayers).
//
// Suit trois états de la partie et réagit à leur bascule : la phase jour/
// nuit, la perception, la météo. Leurs ANNONCES vivent ailleurs (voir
// view/ambient-announcements.js).

import {
  setGlobalVolume,
  setMusicLayer,
  clearMusicLayers,
  setAmbienceLayer,
  clearAmbienceLayers,
  setAmbienceOverlay,
  declareAmbienceLayers,
  setAmbienceLimit,
} from "../../lib/audio.js";
import { resolveAsset } from "../../lib/assets.js";
import { TUNING_DEFAULTS } from "../../config/tuning.js";
import { PERCEPTION_MUSIC_POOL, PERCEPTION_AMBIENCE_POOL } from "../../config/perception.js";
import { WEATHER_STATES } from "../../config/weather-values.js";
import { AMBIENCE_CHANNEL_LIMIT } from "../../config/audio-channels.js";
import { phaseAt } from "../../core/time.js";
import { musicVolumeFactor, ambienceVolumeFactor } from "./volume-factors.js";

// Fondu de sortie de la musique (bascule de phase, changement de scène) et
// des ambiances de scène.
const MUSIC_FADE_MS = TUNING_DEFAULTS.musicFadeMs;
// Pause ("respiration") entre deux morceaux, sans effet en musicLoop.
const MUSIC_BREATHER_RANGE = { min: TUNING_DEFAULTS.musicBreatherMinMs, max: TUNING_DEFAULTS.musicBreatherMaxMs };
const WEATHER_AMBIENCE_FADE_MS = TUNING_DEFAULTS.weatherAmbienceFadeMs;
// Fondu de la perception : même durée pour les couches et pour la rampe
// d'étouffement des entités (voir ./muffle.js).
const PERCEPTION_FADE_MS = TUNING_DEFAULTS.perceptionFadeMs;

// Capacité du canal ambiance : la MÊME limite que celle qui valide les
// ambiances d'une scène (core/scene.js), fournie à lib/audio une fois, au
// chargement de ce module — avant toute déclaration de couche.
setAmbienceLimit(AMBIENCE_CHANNEL_LIMIT);

// Musique d'une scène POUR UNE PHASE : musicDay/musicNight, sinon `music`.
// Aucun des trois : pas de musique (undefined).
export function resolveMusicForPhase(world, phase) {
  if (phase === "day" && world.musicDay) return world.musicDay;
  if (phase === "night" && world.musicNight) return world.musicNight;
  return world.music;
}

// Tirage du morceau suivant d'une séquence : resolveAsset est déjà un tirage
// "sans répétition immédiate" (voir lib/assets.js), appelé à chaque morceau.
// La phase est figée à la création de la fonction : une bascule en crée une
// nouvelle.
function pickMusicPath(world, phase) {
  return () => resolveAsset(resolveMusicForPhase(world, phase));
}

// Monte les couches de la scène `world` et rend { update(session, world) }.
export function createSceneLayers(getSession, world) {
  let currentPhase = phaseAt(getSession().time);
  const musicLoop = Boolean(world.musicLoop);
  const ambiences = world.ambiences;
  let perceptionActive = getSession().perceptionActive;
  const pickPerceptionMusicPath = () => resolveAsset(PERCEPTION_MUSIC_POOL);

  // Volumes AVANT toute déclaration : un flux créé lit le volume de son
  // canal dès sa création.
  setGlobalVolume("music", musicVolumeFactor());
  setGlobalVolume("ambience", ambienceVolumeFactor());

  // Couche OVERRIDE (perception) avant couche BASE (scène) : si la
  // perception est déjà active au montage (partie reprise, changement de
  // scène en pleine perception), elle impose directement son identité et la couche de scène, déclarée juste
  // après, est simplement ignorée (override prime) — rien n'est démarré puis
  // interrompu pour rien.
  const musicOverrideParams = { pickPath: pickPerceptionMusicPath, loop: false, breatherRange: MUSIC_BREATHER_RANGE };
  setMusicLayer("override", perceptionActive ? PERCEPTION_MUSIC_POOL : null, musicOverrideParams, PERCEPTION_FADE_MS);
  setMusicLayer(
    "base",
    resolveMusicForPhase(world, currentPhase),
    { pickPath: pickMusicPath(world, currentPhase), loop: musicLoop, breatherRange: MUSIC_BREATHER_RANGE },
    MUSIC_FADE_MS
  );

  // Ambiance : perception (override), scène (base) et météo (overlay)
  // déclarées EN UNE FOIS. Le diffing se fait PAR COUCHE : un changement de
  // météo seul ne touche jamais l'ambiance de scène, et inversement. La
  // météo dépend de la NATURE de la scène
  // (intérieur/extérieur), fixe pendant sa vie : passer de l'extérieur à
  // l'intérieur (nouveau montage) fond la seule couche météo vers le pool
  // intérieur.
  let weatherState = getSession().weather.state;
  const indoor = Boolean(world.indoor);
  function weatherAmbiencePool(state) {
    return WEATHER_STATES[state]?.ambience?.[indoor ? "indoor" : "outdoor"];
  }
  const mountWeatherPool = weatherAmbiencePool(weatherState);
  declareAmbienceLayers(
    {
      override: {
        identity: perceptionActive ? [PERCEPTION_AMBIENCE_POOL] : null,
        resolvedPaths: perceptionActive ? [resolveAsset(PERCEPTION_AMBIENCE_POOL)] : null,
      },
      base: {
        identity: ambiences && ambiences.length > 0 ? ambiences : null,
        resolvedPaths: ambiences && ambiences.length > 0 ? ambiences.map(resolveAsset) : null,
      },
      overlay: {
        identity: mountWeatherPool ? [mountWeatherPool] : null,
        resolvedPaths: mountWeatherPool ? [resolveAsset(mountWeatherPool)] : null,
      },
    },
    MUSIC_FADE_MS
  );

  function declareWeatherAmbience(state, fadeMs) {
    const pool = weatherAmbiencePool(state);
    setAmbienceOverlay(pool ? [pool] : null, pool ? [resolveAsset(pool)] : null, fadeMs);
  }

  // À chaque tick : réagit aux bascules de phase, de perception et de météo.
  function update(session, world) {
    // Phase : la couche de scène se redéclare (fondu vers la musique de la
    // nouvelle phase).
    const phase = phaseAt(session.time);
    if (phase !== currentPhase) {
      currentPhase = phase;
      setMusicLayer(
        "base",
        resolveMusicForPhase(world, currentPhase),
        { pickPath: pickMusicPath(world, currentPhase), loop: musicLoop, breatherRange: MUSIC_BREATHER_RANGE },
        MUSIC_FADE_MS
      );
    }

    // Perception : la couche override (musique et ambiance) apparaît ou
    // disparaît en fondu, par-dessus la couche de scène.
    if (session.perceptionActive !== perceptionActive) {
      perceptionActive = session.perceptionActive;
      setMusicLayer("override", perceptionActive ? PERCEPTION_MUSIC_POOL : null, musicOverrideParams, PERCEPTION_FADE_MS);
      setAmbienceLayer(
        "override",
        perceptionActive ? [PERCEPTION_AMBIENCE_POOL] : null,
        perceptionActive ? [resolveAsset(PERCEPTION_AMBIENCE_POOL)] : null,
        PERCEPTION_FADE_MS
      );
    }

    // Météo : seule la couche météo est redéclarée (rien si l'ambiance ne
    // change pas réellement).
    if (session.weather.state !== weatherState) {
      weatherState = session.weather.state;
      declareWeatherAmbience(weatherState, WEATHER_AMBIENCE_FADE_MS);
    }
  }

  return { update };
}

// Arrête POUR DE BON musique et ambiances : sortie réelle de la partie
// (retour au menu principal), quand aucune scène suivante ne reprendra ces
// couches. Une scène détruite, elle, ne les touche jamais.
export function stopPersistentAudioLayers() {
  clearMusicLayers(MUSIC_FADE_MS);
  clearAmbienceLayers(MUSIC_FADE_MS);
}
