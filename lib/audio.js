// Couche bas niveau sur Howler. Aucune connaissance du jeu : ni entités, ni
// registre, ni session — que des chemins de fichiers et des nombres. Howl et
// Howler sont des globals (vendor/howler.min.js, chargé en script classique
// avant ce module dans index.html) : pas d'import pour eux. Seule exception :
// AMBIENCE_CHANNEL_LIMIT (config/audio-channels.js), une donnée neutre —
// déjà partagée avec core/level.js, seule source de cette limite (voir
// GLOBAL_CHANNELS plus bas).
import { AMBIENCE_CHANNEL_LIMIT } from "../config/audio-channels.js";

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
// volume (défaut 1, inchangé si omis) : appliqué à l'instance jouée via
// Howl.volume() juste avant play() — sans id, Howler l'utilise comme volume
// par défaut de la PROCHAINE lecture. Permet à l'appelant d'appliquer un
// facteur de préférence (voir config/preferences.js) relu à chaque appel,
// donc déjà à jour au pas suivant sans mécanisme de rafraîchissement séparé.
export function playOneShot(path, { reverbSend, reverbBusInput, volume = 1 } = {}) {
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

  entry.howl.volume(volume);
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
    // pause()/resume() : pause SÉLECTIVE de CETTE voix (ex. pendant un menu
    // qui superpose la ville, voir view/interaction.js), jamais du contexte
    // audio global. howl.play() sans id : Howler retrouve tout seul l'unique
    // instance en pause de ce Howl et la reprend là où elle en était (pas de
    // nouvelle lecture depuis le début) — valable ici puisqu'un seul play()
    // a jamais lieu par Howl positionné (voir plus haut).
    pause() {
      howl.pause();
    },
    resume() {
      howl.play();
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

// Canaux globaux non spatialisés (stéréo à plat, aucun pan/filtre/réverb —
// jamais createPositionedSound, jamais sendToReverb) : musique et ambiance
// partagent CE mécanisme commun, identifiés par un nom de canal plutôt que
// par du code dupliqué par usage. Jamais des sons d'entité, donc jamais mis
// en pause par la pause sélective des balises (voir pause()/resume() plus
// haut, qui n'agissent que sur LEUR propre voix).
//
// Politique par canal, déclarée en UN SEUL point : limit (flux simultanés
// max) et overflow — "replace" évince le(s) flux le(s) plus ancien(s) pour
// faire de la place (comportement musique) ; "reject" n'ajoute rien au-delà
// de la limite, juste un avertissement (comportement ambiance). Toute la
// logique de lecture ci-dessous LIT limit/overflow d'ici, n'en contient
// jamais en dur. La limite d'ambiance vient d'AMBIENCE_CHANNEL_LIMIT
// (config/audio-channels.js), PAS d'un littéral ici : c'est la même valeur
// que core/level.js utilise pour valider le format de niveau — monter cette
// seule constante (ex. 2 -> 3) suffit à autoriser 3 ambiances de bout en
// bout, sans toucher à playGlobal/playAmbiences ni à core/level.js.
const GLOBAL_CHANNELS = {
  music: { limit: 1, overflow: "replace" },
  ambience: { limit: AMBIENCE_CHANNEL_LIMIT, overflow: "reject" },
};

// nom de canal -> Howl[] en cours sur ce canal.
const globalChannels = new Map();

function channelStreams(channel) {
  if (!globalChannels.has(channel)) globalChannels.set(channel, []);
  return globalChannels.get(channel);
}

// Repli pour un canal non déclaré dans GLOBAL_CHANNELS : un seul flux,
// éviction (même comportement que l'ancien fallback universel, avant
// l'introduction des politiques par canal).
function channelPolicy(channel) {
  return GLOBAL_CHANNELS[channel] ?? { limit: 1, overflow: "replace" };
}

// Ajoute un flux au canal selon SA politique (channelPolicy) : "replace"
// évince les flux les plus anciens jusqu'à repasser sous la limite (arrêtés
// + déchargés) avant d'ajouter le nouveau — pour un canal à 1 flux, c'est
// exactement "remplace la piste en cours", jamais deux pistes superposées,
// jamais de boucle fantôme. "reject" n'ajoute rien si la limite est déjà
// atteinte, avec un avertissement nommant le canal et sa limite.
export function playGlobal(channel, path) {
  const streams = channelStreams(channel);
  const { limit, overflow } = channelPolicy(channel);

  if (streams.length >= limit) {
    if (overflow !== "replace") {
      console.warn(`audio: canal "${channel}" déjà à sa limite (${limit}), flux ignoré.`);
      return;
    }
    while (streams.length >= limit) {
      const oldest = streams.shift();
      oldest.stop();
      oldest.unload();
    }
  }

  const howl = new Howl({ src: [path], loop: true });
  howl.play();
  streams.push(howl);
}

// Lance les ambiances données (jusqu'à la limite du canal "ambience", voir
// GLOBAL_CHANNELS — au-delà, playGlobal les rejette et avertit, aucun
// plafond redondant ici) : repart TOUJOURS d'un canal vide plutôt que
// d'empiler par-dessus un appel précédent — aucun résidu d'une scène ou
// d'une configuration antérieure.
export function playAmbiences(paths) {
  stopGlobal("ambience");
  for (const path of paths) {
    playGlobal("ambience", path);
  }
}

// Arrête et décharge TOUS les flux du canal — cycle de vie propre.
export function stopGlobal(channel) {
  const streams = globalChannels.get(channel);
  if (!streams) return;
  for (const howl of streams) {
    howl.stop();
    howl.unload();
  }
  globalChannels.set(channel, []);
}

// Applique le même facteur à TOUS les flux du canal (ex. les deux couches
// d'ambiance partagent un seul curseur de volume).
export function setGlobalVolume(channel, factor) {
  const streams = globalChannels.get(channel);
  if (!streams) return;
  for (const howl of streams) {
    howl.volume(factor);
  }
}
