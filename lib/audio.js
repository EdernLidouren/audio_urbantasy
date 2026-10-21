// Couche bas niveau sur Howler. Aucune connaissance du jeu : ni entités, ni
// registre, ni session — que des chemins de fichiers et des nombres. Howl et
// Howler sont des globals (vendor/howler.min.js, chargé en script classique
// avant ce module dans index.html) : pas d'import pour eux. Seule exception :
// AMBIENCE_CHANNEL_LIMIT (config/audio-channels.js), une donnée neutre —
// déjà partagée avec la validation des scènes du jeu, seule source de cette limite (voir
// lib/audio/channels.js).
//
// Ce fichier est le POINT D'ENTRÉE : il réexporte l'API publique des modules
// de lib/audio/ (un par bloc), qui restent des détails d'implémentation —
// les appelants n'importent jamais lib/audio/<module>.js directement.

export { ensureAudioUnlocked, keepAudioContextAwake, rampEntityLayerGain } from "./audio/context.js";
export { preloadOneShot, playOneShot, playTrackedOneShot, randomRate, playDescribedOneShot } from "./audio/oneshots.js";
export { generateImpulseResponse, createReverbBus } from "./audio/reverb.js";
export { createPositionedSound } from "./audio/positioned.js";
export { setGlobalVolume, setMasterVolume } from "./audio/channels.js";
export { preloadMusic, startMusicSequence, fadeOutMusic, switchMusicSequence, setMusicLayer, clearMusicLayers } from "./audio/music.js";
export { setAmbienceLayer, declareAmbienceLayers, setWeatherAmbienceLayer, clearAmbienceLayers } from "./audio/ambience.js";
