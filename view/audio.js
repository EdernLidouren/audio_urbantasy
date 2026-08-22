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

// Bornes structurelles de setCutoff (pas un réglage de feeling, une garantie
// de fréquence valide) : au-delà, un BiquadFilterNode lowpass n'a plus grand
// effet audible (trop grave) ou plus aucun (trop aigu, tout passe).
const MIN_FILTER_FREQ_HZ = 300;
const MAX_FILTER_FREQ_HZ = 20000;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Chaque entité a besoin de son propre Howl (panning indépendant) : jamais
// de cache ici, un Howl neuf à chaque appel.
export function createPositionedSound(path) {
  const howl = new Howl({ src: [path], loop: true, volume: 0 });
  howl.play();

  // Howler n'a pas de passe-bas natif : on insère nous-mêmes un
  // BiquadFilterNode dans la chaîne du son, entre son GainNode par-instance
  // (howl._sounds[0]._node, API bas niveau de Howler) et Howler.masterGain.
  // Cette connexion _node -> masterGain est posée une fois à la création du
  // son et n'est JAMAIS retouchée par le plugin stereo (qui ne reconnecte
  // que l'ENTRÉE de _node, via un panner) : on peut donc s'y insérer sans
  // jamais perturber le pan, dans n'importe quel ordre.
  //
  // Le nœud n'existe pas forcément tout de suite (chargement asynchrone) :
  // on retente à chaque appel de setCutoff, sans jamais planter si absent —
  // on se contente alors de ne pas filtrer.
  let filter = null;

  function ensureFilter() {
    if (filter || !Howler.ctx) return filter;

    const sound = howl._sounds && howl._sounds[0];
    const node = sound && sound._node;
    if (!node) return null;

    filter = Howler.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = MAX_FILTER_FREQ_HZ;

    node.disconnect();
    node.connect(filter);
    filter.connect(Howler.masterGain);

    return filter;
  }

  return {
    update(pan, volume) {
      howl.stereo(pan);
      howl.volume(volume);
    },
    setCutoff(freqHz) {
      const f = ensureFilter();
      if (!f) return; // pas de nœud dispo pour l'instant : pas de filtrage
      f.frequency.value = clamp(freqHz, MIN_FILTER_FREQ_HZ, MAX_FILTER_FREQ_HZ);
    },
    stop() {
      if (filter) {
        filter.disconnect();
        filter = null;
      }
      howl.stop();
      howl.unload();
    },
  };
}
