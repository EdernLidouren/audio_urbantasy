// Couche bas niveau sur Howler. Aucune connaissance du jeu : ni entités, ni
// registre, ni session — que des chemins de fichiers et des nombres. Howl et
// Howler sont des globals (vendor/howler.min.js, chargé en script classique
// avant ce module dans index.html) : pas d'import pour eux. Ce que le jeu
// doit fournir (ex. la limite de flux d'ambiance, setAmbienceLimit) passe par
// des appels, jamais par un import du jeu.
//
// Ce fichier est le POINT D'ENTRÉE : il réexporte l'API publique des modules
// de lib/audio/ (un par bloc), qui restent des détails d'implémentation —
// les appelants n'importent jamais lib/audio/<module>.js directement.

export { ensureAudioUnlocked, keepAudioContextAwake, rampEntityLayerGain } from "./audio/context.js";
export { preloadOneShot, playOneShot, playTrackedOneShot, randomRate, playDescribedOneShot } from "./audio/oneshots.js";
export { createReverbBus } from "./audio/reverb.js";
export { createPositionedSound } from "./audio/positioned.js";
export { enterAudioScope, releaseStaleAudio } from "./audio/retention.js";
export { setGlobalVolume, setMasterVolume, setAmbienceLimit } from "./audio/channels.js";
export { preloadMusic, setMusicLayer, clearMusicLayers } from "./audio/music.js";
export { setAmbienceLayer, declareAmbienceLayers, setAmbienceOverlay, clearAmbienceLayers } from "./audio/ambience.js";
