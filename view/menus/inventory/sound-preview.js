// ÉCOUTE depuis un menu (fiche d'entité, menu des émotes) : un son non
// spatialisé, au volume de l'interface, dont UNE SEULE lecture vit à la
// fois. Un nouvel appui coupe la précédente avant de relancer ; le menu qui
// la possède la coupe en se fermant (stop). Purement de la vue : rien de
// l'état de la partie ne bouge.

import { playTrackedOneShot } from "../../../lib/audio.js";
import { resolveAsset } from "../../../lib/assets.js";
import { TUNING_DEFAULTS } from "../../../config/tuning.js";
import { interfaceVolumeFactor } from "../../audio/volume-factors.js";

// Même fondu que l'effet "stopSounds" : coupé sans clic, assez vite pour ne
// pas traîner sous la lecture suivante.
const PREVIEW_STOP_FADE_MS = TUNING_DEFAULTS.stopSoundsFadeMs;

export function createSoundPreview() {
  let current = null;

  function stop() {
    if (current) current.stop(PREVIEW_STOP_FADE_MS);
    current = null;
  }

  // `path` : une clé d'asset (un pool : un fichier différent à chaque
  // écoute). `gain` multiplie le volume de l'interface ; `rate` : la hauteur
  // de CETTE lecture (variation déjà tirée par l'appelant, voir randomRate).
  function play(path, { gain = 1, rate = 1 } = {}) {
    stop();
    try {
      current = playTrackedOneShot(resolveAsset(path), { volume: gain * interfaceVolumeFactor(), rate });
    } catch (error) {
      console.warn(`écoute indisponible ("${path}") : ${error.message}`);
    }
  }

  return { play, stop };
}
