// Couche bas niveau sur Howler. Aucune connaissance du jeu : ni entités, ni
// registre, ni session — que des chemins de fichiers et des nombres. Howl et
// Howler sont des globals (vendor/howler.min.js, chargé en script classique
// avant ce module dans index.html) : pas d'import ici.

// Le contexte audio démarre suspendu tant qu'aucun geste utilisateur n'a eu
// lieu (règle autoplay des navigateurs). À invoquer au premier keydown.
export function ensureAudioUnlocked() {
  if (Howler.ctx && Howler.ctx.state === "suspended") {
    Howler.ctx.resume();
  }
}

// Un seul Howl par chemin, mis en cache : les lectures successives peuvent
// se chevaucher (play() sur un Howl déjà chargé démarre une instance sonore
// de plus, sans interrompre les précédentes).
const oneShotCache = new Map();

export function playOneShot(path) {
  let sound = oneShotCache.get(path);
  if (!sound) {
    sound = new Howl({ src: [path] });
    oneShotCache.set(path, sound);
  }
  sound.play();
}

// Chaque entité a besoin de son propre Howl (panning indépendant) : jamais
// de cache ici, un Howl neuf à chaque appel.
export function createPositionedSound(path) {
  const sound = new Howl({ src: [path], loop: true, volume: 0 });
  sound.play();

  return {
    update(pan, volume) {
      sound.stereo(pan);
      sound.volume(volume);
    },
    stop() {
      sound.stop();
      sound.unload();
    },
  };
}
