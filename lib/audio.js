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

// Empêche l'auto-suspension du contexte (comportement par défaut de
// Howler : le contexte se suspend après une période d'inactivité audio,
// pour économiser des ressources) — si le joueur reste immobile un moment
// avant son premier pas, le contexte peut déjà être suspendu au moment du
// déclenchement, ajoutant un resume() asynchrone au décodage à froid
// (voir preloadOneShot) : deux causes cumulables du même symptôme ("le pas
// saute au début"). Réveille aussi le contexte s'il est déjà suspendu, même
// logique qu'ensureAudioUnlocked mais réutilisable indépendamment du tout
// premier appui touche. Voir view/audio/city-scene.js, appelé au montage
// d'une scène — jamais réactivé ensuite, le contexte reste éveillé pour
// toute la session de jeu une fois une scène entrée.
export function keepAudioContextAwake() {
  Howler.autoSuspend = false;
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
// volume/stereo/rate (défauts 1/0/1, inchangés si omis) : appliqués à
// l'instance jouée via Howl.volume()/stereo()/rate() juste avant play() —
// sans id, Howler les utilise comme réglages par défaut de la PROCHAINE
// lecture. Permet à l'appelant d'appliquer un facteur de préférence (voir
// config/preferences.js), un pan calculé (positionnement) ou une variation
// de hauteur relus à CHAQUE appel, déjà à jour sans mécanisme de
// rafraîchissement séparé. TOUJOURS appliqués, jamais seulement si fournis :
// le Howl sous-jacent est mis en cache et réutilisé par tout appelant
// partageant le même chemin (voir oneShotCache) — sans ce filet, la valeur
// laissée par un appel précédent (ex. panné) resterait collée à un appel
// suivant qui n'en fournit pas (ex. centré).
//
// ensureOneShot(path) : partagé par playOneShot ET preloadOneShot
// (ci-dessous) — un seul chemin de création/mise en cache, jamais dupliqué.
// new Howl() démarre déjà son chargement en arrière-plan (preload:true, le
// défaut de Howler) : la première utilisation d'un chemin lance donc TOUJOURS
// le décodage, que ce soit via preloadOneShot (à l'avance, voir
// view/audio/city-scene.js) ou via un playOneShot "à froid" (Howler met
// alors la lecture en attente jusqu'à la fin du décodage — jamais perdue,
// mais en retard, ce qui s'entend comme un pas qui "saute").
function ensureOneShot(path) {
  let entry = oneShotCache.get(path);
  if (!entry) {
    entry = { howl: new Howl({ src: [path] }), sendGain: null };
    oneShotCache.set(path, entry);
  }
  return entry;
}

// Amorce le chargement d'UN chemin sans le jouer — voir
// view/audio/city-scene.js, préchargement de scène. Idempotent (ensureOneShot
// retombe sur l'entrée déjà en cache si déjà amorcée par un appel précédent,
// preload ou lecture réelle), jamais de rechargement en double.
export function preloadOneShot(path) {
  ensureOneShot(path);
}

export function playOneShot(path, { reverbSend, reverbBusInput, volume = 1, stereo = 0, rate = 1 } = {}) {
  const entry = ensureOneShot(path);

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
  entry.howl.stereo(stereo);
  entry.howl.rate(rate);
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

// Cache des Howl de voix positionnées CONTINUES (balises), PAR CLÉ fournie
// par l'appelant (cacheKey ci-dessous — ce module ne connaît aucune
// entité, jamais de clé devinée ici) — persiste AU-DELÀ d'une scène,
// symétrique à oneShotCache (plus haut) pour les sons ponctuels : une
// balise déjà entendue une fois (lieu déjà visité) ne doit pas se
// redécoder à chaque aller-retour, cohérent avec les MONDES eux-mêmes
// gardés en mémoire (voir core/state.js). stop() (plus bas) n'unload PLUS
// le Howl : arrête seulement la lecture, le buffer décodé reste en cache
// pour une reprise future. Limite connue, acceptée : ce cache grandit avec
// le nombre d'entités à balise continue jamais rencontrées, jamais purgé —
// négligeable à l'échelle actuelle (une poignée de lieux/entités), pas une
// préoccupation pour un projet de cette taille (voir aussi la limite déjà
// documentée pour le bus de réverb, même esprit).
const positionedSoundCache = new Map();

// Chaque entité a besoin de sa PROPRE voix (panning indépendant) : cacheKey
// (fourni par l'appelant, typiquement un id d'entité stable d'une visite à
// l'autre — voir view/audio/city-scene.js) identifie CETTE voix précise,
// jamais le chemin seul (deux entités différentes pourraient un jour
// partager le même fichier de balise sans vouloir partager leur pan/
// volume). Omis -> repli sur path (comportement historique, un Howl par
// chemin) : suffisant pour un appelant qui n'a pas cette distinction à
// faire. rate (optionnel, défaut 1) : taux de lecture, réappliqué à CHAQUE
// appel (y compris sur une voix réutilisée, si l'appelant en fournit une
// différente).
export function createPositionedSound(path, { rate = 1, cacheKey = path } = {}) {
  let howl = positionedSoundCache.get(cacheKey);
  if (howl) {
    // Voix déjà connue (lieu déjà visité) : buffer déjà décodé, on relance
    // juste la lecture — jamais de nouveau Howl, jamais de redécodage.
    // volume(0) : même point de départ qu'une création fraîche (voir
    // ci-dessous) — la voix vient d'être arrêtée par la scène précédente,
    // sans ce reset elle repartirait au volume qu'elle avait à l'instant
    // de cet arrêt, un court instant avant que update() (premier tick) ne
    // le recalcule.
    howl.rate(rate);
    howl.volume(0);
    howl.play();
  } else {
    howl = new Howl({ src: [path], loop: true, volume: 0, rate });
    positionedSoundCache.set(cacheKey, howl);
    howl.play();
  }

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
      // PAS de howl.unload() : le buffer décodé reste en cache (voir
      // positionedSoundCache ci-dessus) pour une reprise future — seule LA
      // VOIX EN COURS est arrêtée ici, jamais le cache lui-même. C'est le
      // sens de "aucun Howl résiduel après transition" ailleurs dans ce
      // module : des voix arrêtées, pas un cache vidé.
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
// html5:true (streaming, décodage progressif via un <audio> HTML plutôt que
// Web Audio) : ces deux canaux portent des fichiers LONGS (musiques
// plusieurs minutes, ambiances tout autant — mesuré : jusqu'à ~5 min pour
// traffic_street_afternoon) — les décoder ENTIÈREMENT en mémoire (défaut
// Web Audio, adapté aux sons COURTS comme pas/balises/vocaux/collision,
// voir playOneShot/createPositionedSound) gâcherait pour rien plusieurs Mo
// de PCM décodé par piste. Aucune fonctionnalité perdue : ni l'un ni
// l'autre canal ne passe par le pan/filtre/réverb (voir le commentaire
// plus haut, "stéréo à plat"), donc rien qui dépende de Web Audio ici.
const GLOBAL_CHANNELS = {
  music: { limit: 1, overflow: "replace", html5: true },
  ambience: { limit: AMBIENCE_CHANNEL_LIMIT, overflow: "reject", html5: true },
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
  const { limit, overflow, html5 } = channelPolicy(channel);

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

  const howl = new Howl({ src: [path], loop: true, html5 });
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

// Gain de sortie GLOBAL, APRÈS tout le reste (balises, vocal, pas, musique,
// ambiances, UI, collision) — Howler.volume() pilote Howler.masterGain, le
// nœud vers lequel TOUT converge déjà dans ce fichier : les sons positionnés
// (createPositionedSound, via leur filtre passe-bas), le bus de réverb
// partagé (createReverbBus), et tout Howl créé sans routage particulier
// (playOneShot/playGlobal, branchement par défaut de Howler). Un seul appel
// ici re-multiplie donc INSTANTANÉMENT tout ce qui joue déjà, sans avoir à
// reparcourir/rafraîchir chaque flux comme setGlobalVolume (ci-dessus) doit
// le faire par canal — c'est la bonne primitive pour un volume "principal"
// qui ne doit jamais changer les équilibres relatifs entre canaux.
export function setMasterVolume(factor) {
  Howler.volume(factor);
}
