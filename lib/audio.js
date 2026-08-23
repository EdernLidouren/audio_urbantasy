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

// options.reverbSend/reverbBusInput sont optionnels : sans eux, comportement
// strictement inchangé (chemin sec uniquement). Avec eux, un GainNode d'envoi
// est créé et branché UNE FOIS par Howl mis en cache (pas à chaque appel),
// depuis le nœud par-instance de Howler vers le bus — en parallèle du chemin
// sec par défaut de Howler vers masterGain, jamais à sa place.
//
// Limite connue : le cache est global et persiste au-delà d'une scène ; si
// un bus de réverb est un jour détruit puis qu'un autre est recréé (ex.
// sortie/re-entrée en ville, non atteignable dans l'app actuelle faute de
// chemin pour quitter la ville), l'envoi déjà câblé pointerait vers l'ancien
// bus. Pas de retente/rebranchement automatique pour l'instant.
export function playOneShot(path, { reverbSend, reverbBusInput } = {}) {
  let entry = oneShotCache.get(path);
  if (!entry) {
    entry = { howl: new Howl({ src: [path] }), sendGain: null };
    oneShotCache.set(path, entry);
  }

  if (reverbBusInput && reverbSend && !entry.sendGain && Howler.ctx) {
    const sound = entry.howl._sounds && entry.howl._sounds[0];
    const node = sound && sound._node;
    if (node) {
      entry.sendGain = Howler.ctx.createGain();
      entry.sendGain.gain.value = reverbSend;
      node.connect(entry.sendGain);
      entry.sendGain.connect(reverbBusInput);
    }
  }

  entry.howl.play();
}

// Bornes structurelles de setCutoff (pas un réglage de feeling, une garantie
// de fréquence valide) : au-delà, un BiquadFilterNode lowpass n'a plus grand
// effet audible (trop grave) ou plus aucun (trop aigu, tout passe).
const MIN_FILTER_FREQ_HZ = 300;
const MAX_FILTER_FREQ_HZ = 20000;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Génère une réponse impulsionnelle synthétique (pas de fichier externe) :
// bruit blanc stéréo (2 canaux indépendants) multiplié par une enveloppe de
// déclin exponentiel — le patron standard pour un ConvolverNode sans asset.
// decay est un taux (1/s) : plus haut = la queue s'éteint plus vite.
// Défensif : sans contexte audio, retourne null plutôt que de planter.
export function generateImpulseResponse({ durationSec, decay }) {
  if (!Howler.ctx) return null;

  const sampleRate = Howler.ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = Howler.ctx.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-decay * t);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
  }

  return buffer;
}

// Compensation de gain (pas un réglage de feeling — une correction technique
// de la mise à l'échelle de ConvolverNode) : avec `normalize` par défaut
// (activé, on le laisse tel quel plutôt que de réimplémenter notre propre
// normalisation — un essai de mise à l'échelle maison a montré qu'il est
// facile de saturer), une IR de bruit dense sur toute sa durée ressort très
// atténuée (mesuré : ~14% de transfert d'énergie pour une IR de 1.2s/decay
// 2.5). Sans cette compensation, `wet`/`reverbSend` à leur maximum (1.0)
// resteraient à la limite du perceptible. Calibré par mesure directe du
// signal en sortie (voix réelle, ConvolverNode normalisé) : à
// wet=1 * WET_MAKEUP_GAIN, la queue de réverb est nettement audible.
const WET_MAKEUP_GAIN = 4;

// Bus de réverb PARTAGÉ : un ConvolverNode (buffer = impulsionnelle générée)
// -> un gain "wet" (niveau de retour) -> Howler.masterGain. `input` est le
// nœud auquel les voix envoient une part de leur signal (voir
// createPositionedSound.sendToReverb) — jamais un convolver par entité,
// toujours ce bus unique. Défensif : sans contexte, poignée inerte.
export function createReverbBus({ durationSec, decay, wet }) {
  if (!Howler.ctx) {
    return { input: null, setWet() {}, destroy() {} };
  }

  const convolver = Howler.ctx.createConvolver();
  convolver.buffer = generateImpulseResponse({ durationSec, decay });

  const wetGain = Howler.ctx.createGain();
  wetGain.gain.value = wet * WET_MAKEUP_GAIN;

  convolver.connect(wetGain);
  wetGain.connect(Howler.masterGain);

  return {
    input: convolver,
    setWet(level) {
      wetGain.gain.value = level * WET_MAKEUP_GAIN;
    },
    destroy() {
      convolver.disconnect();
      wetGain.disconnect();
    },
  };
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
  // Envoi de réverb : un GainNode branché depuis la SORTIE du filtre (le
  // même point que le chemin sec vers masterGain) vers l'entrée du bus. Le
  // chemin sec reste inchangé, ceci n'ajoute qu'une dérivation.
  let sendGain = null;
  let pendingSend = null; // { busInput, level } tant que le filtre n'existe pas

  function attachSend(busInput, level) {
    if (!busInput || !filter) return;
    sendGain = Howler.ctx.createGain();
    sendGain.gain.value = level;
    filter.connect(sendGain);
    sendGain.connect(busInput);
  }

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

    // Le filtre vient d'apparaître : s'il y avait un envoi de réverb en
    // attente (sendToReverb appelé avant que le nœud soit prêt), on le
    // branche maintenant, depuis ce même point de sortie.
    if (pendingSend) {
      attachSend(pendingSend.busInput, pendingSend.level);
      pendingSend = null;
    }

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
    sendToReverb(busInput, level) {
      // Même dépendance que setCutoff : sans filtre, on retente plus tard
      // (ensureFilter est aussi rappelé par setCutoff à chaque tick).
      if (!ensureFilter()) {
        pendingSend = { busInput, level };
        return;
      }
      attachSend(busInput, level);
    },
    stop() {
      if (sendGain) {
        sendGain.disconnect();
        sendGain = null;
      }
      if (filter) {
        filter.disconnect();
        filter = null;
      }
      howl.stop();
      howl.unload();
    },
  };
}
