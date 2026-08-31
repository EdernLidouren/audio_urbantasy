// Pools audio de la PERCEPTION SURNATURELLE (voir core/presence.js/
// "perceptionActive", view/audio/city-scene.js) — GLOBAUX, pas par scène :
// le surnaturel est une strate unique détachée du lieu visité, contrairement
// à musicDay/musicNight/ambiences qui restent des champs DE NIVEAU (voir
// level/schema.md). Donnée NEUTRE, zéro import — même statut que
// config/audio-channels.js : une clé de pool (voir lib/assets.js/
// resolveAsset), pas un chemin de fichier unique, résolue exactement comme
// world.musicDay/world.music le sont déjà.
export const PERCEPTION_MUSIC_POOL = "assets/musics/mystery";
export const PERCEPTION_AMBIENCE_POOL = "assets/ambiances/supernatural_reality";
