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

// --- Gain de couche ENTITÉS (fondu de transition de scène) ---
//
// Un SEUL GainNode, au-dessus de TOUTE la couche sonore POSITIONNÉE/
// D'ENTITÉS (balises continues, vocaux, pas, one-shots positionnés, bus de
// réverb — voir ensureLowpass/ensureHighpass/ensureEntityGainRouting plus
// bas et createPositionedSound/createReverbBus plus loin, tous branchés
// ICI plutôt que directement sur Howler.masterGain) — JAMAIS la musique ni
// l'ambiance (canaux globaux séparés, voir GLOBAL_CHANNELS plus bas, qui
// restent branchés directement sur Howler.masterGain, hors de portée de ce
// nœud). Sert le "fondu au noir sonore" d'une transition de scène (voir
// view/city-screen.js/performTransition) : fondre ce gain à 0 avant de
// détruire la scène courante, le remonter à 1 une fois la scène cible
// construite — musique et ambiance suivent leur PROPRE logique de
// continuité/crossfade en parallèle, entièrement indifférentes à ce nœud.
//
// Rampe via l'AUTOMATION NATIVE de l'AudioParam (linearRampToValueAtTime),
// PAS le mécanisme de rampe JS par relecture périodique déjà utilisé pour
// le fondu du filtre d'étouffement mondain (mundaneMuffleRampFrom/To/
// StartedAt, voir view/audio/city-scene.js) : cette dernière dépend d'une
// relecture déclenchée par le TICK de jeu (applyEntityAudio, appelé depuis
// onTick) — or la séquence de transition tourne PENDANT que le jeu est
// gelé (sas, aucun tick, voir performTransition), donc rien n'y rappelle
// cette relecture. L'automation native d'un AudioParam, elle, progresse sur
// l'horloge du contexte audio, indépendamment de tout tick JS : c'est la
// SEULE des deux approches qui fonctionne pendant un gel — même PRINCIPE
// directeur (de/vers une valeur, sur une durée, jamais un saut sec) que la
// rampe existante, porté par l'outil natif adapté à un simple paramètre de
// nœud Web Audio plutôt que recopié tel quel.
let entityLayerGainNode = null;

function ensureEntityLayerGain() {
  if (!Howler.ctx) return null;
  if (entityLayerGainNode) return entityLayerGainNode;
  entityLayerGainNode = Howler.ctx.createGain();
  entityLayerGainNode.gain.value = 1;
  entityLayerGainNode.connect(Howler.masterGain);
  return entityLayerGainNode;
}

// Programme la rampe (voir header) : ANNULE toute automation en cours
// (cancelScheduledValues) et repart de la valeur COURANTE (setValueAtTime)
// — un fondu interrompu par un autre reprend proprement depuis où il en
// est, jamais un saut. Sans contexte audio (Howler.ctx absent, ex. premier
// geste utilisateur pas encore fait), no-op silencieux : la séquence de
// transition (voir son appelant) continue quand même, simplement sans
// effet audible à faire fondre.
export function rampEntityLayerGain(target, durationMs) {
  const gain = ensureEntityLayerGain();
  if (!gain) return;
  const now = Howler.ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(target, now + durationMs / 1000);
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
// cacheKey (défaut : path) : DEUX appelants distincts qui jouent le MÊME
// fichier mais veulent des CHAÎNES DE FILTRES indépendantes (ex. le rendu
// ÉTOUFFÉ de l'autre face d'une scène à deux faces, voir
// view/audio/city-scene.js/RECTO-VERSO étape 2/2, contre le rendu normal du
// même fichier ailleurs) passent une clé DISTINCTE du chemin — même
// principe que createPositionedSound/cacheKey plus bas. Omis -> repli sur
// path (comportement historique inchangé, un Howl par chemin).
function ensureOneShot(path, cacheKey = path) {
  let entry = oneShotCache.get(cacheKey);
  if (!entry) {
    entry = { howl: new Howl({ src: [path] }), sendGain: null, lowpass: null, highpass: null, routedToEntityGain: false };
    oneShotCache.set(cacheKey, entry);
  }
  return entry;
}

// Passe-haut OPTIONNEL, inséré DANS le chemin sec (Howler l'avait branché
// tel quel vers ENTRÉE le gain de couche entités à la création du son, voir
// ensureEntityGainRouting plus bas) — voir "Chaîne de filtres hauteur"
// (entities/model.md, isFlying) : SEULE différence avec le branchement de
// sendGain ci-dessous (une simple DÉRIVATION en parallèle, jamais insérée
// dans le chemin lui-même). Mis en cache PAR CHEMIN, comme sendGain, avec
// la MÊME limite connue (deux entités qui partageraient exactement le même
// fichier partageraient aussi ce filtre) — acceptée ici pour la même
// raison : sans coût aujourd'hui, aucun contenu réel ne partage un chemin
// entre une entité isFlying et une qui ne l'est pas.
// Passe-bas OPTIONNEL pour un one-shot (voir "Rendu étouffé de l'autre
// face", CLAUDE.md/RECTO-VERSO étape 2/2) — MÊME position dans la chaîne
// que pour une balise continue (createPositionedSound/ensureFilter ci-bas) :
// node -> lowpass -> highpass (si présent) -> gain de couche entités,
// jamais l'inverse, pour que les deux filtres restent composables sur un
// même one-shot (ex. une entité isFlying entendue en étouffé depuis
// l'autre face). Seuls des one-shots D'ENTITÉ utilisent lowpassHz/
// highpassHz (voir view/audio/city-scene.js) — la destination finale peut
// donc être le gain de couche entités SANS condition, jamais un one-shot
// d'UI (voir ensureEntityGainRouting plus bas pour CEUX-LÀ, qui n'ont
// jamais de filtre).
function ensureLowpass(entry, freqHz) {
  if (!Howler.ctx) return null;
  if (entry.lowpass) {
    entry.lowpass.frequency.value = freqHz;
    return entry.lowpass;
  }
  const sound = entry.howl._sounds && entry.howl._sounds[0];
  const node = sound && sound._node;
  if (!node) return null;

  entry.lowpass = Howler.ctx.createBiquadFilter();
  entry.lowpass.type = "lowpass";
  entry.lowpass.frequency.value = freqHz;

  node.disconnect();
  node.connect(entry.lowpass);
  entry.lowpass.connect(ensureEntityLayerGain());

  // Un highpass ou un envoi de réverb déjà branchés DIRECTEMENT depuis node
  // (posés par un appel antérieur sans lowpassHz) seraient rompus par le
  // disconnect() ci-dessus — rebranchés depuis la SORTIE du filtre, même
  // principe que ensureHighpass ci-dessous.
  if (entry.highpass) entry.lowpass.connect(entry.highpass);
  if (entry.sendGain) entry.lowpass.connect(entry.sendGain);

  return entry.lowpass;
}

function ensureHighpass(entry, freqHz) {
  if (!Howler.ctx) return null;
  if (entry.highpass) {
    entry.highpass.frequency.value = freqHz;
    return entry.highpass;
  }
  // Chaîné APRÈS le passe-bas s'il existe déjà (voir ensureLowpass
  // ci-dessus) — sinon directement depuis node, comportement inchangé.
  const sound = entry.howl._sounds && entry.howl._sounds[0];
  const source = entry.lowpass || (sound && sound._node);
  if (!source) return null;

  entry.highpass = Howler.ctx.createBiquadFilter();
  entry.highpass.type = "highpass";
  entry.highpass.frequency.value = freqHz;

  source.disconnect();
  source.connect(entry.highpass);
  entry.highpass.connect(ensureEntityLayerGain());

  // Un envoi de réverb déjà branché DIRECTEMENT depuis `source` (posé par un
  // appel antérieur sans highpassHz) serait rompu par le disconnect()
  // ci-dessus — rebranché depuis la SORTIE du filtre pour ne jamais le
  // perdre.
  if (entry.sendGain) {
    entry.highpass.connect(entry.sendGain);
  }

  return entry.highpass;
}

// Reroute le nœud PAR-INSTANCE de Howler (par défaut connecté à
// Howler.masterGain, voir ensureLowpass) DIRECTEMENT vers le gain de
// couche entités, SANS filtre — pour un one-shot D'ENTITÉ qui n'a besoin
// d'aucun passe-bas/passe-haut (le cas courant : pas, collision, la plupart
// des vocaux/balises intermittentes). Réservé aux one-shots D'ENTITÉ (voir
// playOneShot/entityLayer) : un one-shot d'UI (menu, confirmation) ne passe
// jamais par ici, reste branché directement sur Howler.masterGain, inchangé.
// No-op si un filtre gère DÉJÀ ce routage (ensureLowpass/ensureHighpass
// s'en chargent eux-mêmes) ou si déjà posé — retentée à chaque appel tant
// que le nœud par-instance n'est pas encore prêt (même limite ACCEPTÉE
// qu'ensureLowpass/ensureHighpass : un tout premier one-shot jamais joué
// avant peut manquer ce routage une fois, rattrapé au second appel — sans
// conséquence en pratique, les sons d'entité sont préchargés au montage de
// la scène, voir warmUpFootstep/preloadKeys).
function ensureEntityGainRouting(entry) {
  if (entry.routedToEntityGain || entry.lowpass || entry.highpass) return;
  const gain = ensureEntityLayerGain();
  if (!gain) return;
  const sound = entry.howl._sounds && entry.howl._sounds[0];
  const node = sound && sound._node;
  if (!node) return;

  node.disconnect();
  node.connect(gain);
  // Un envoi de réverb déjà branché DIRECTEMENT depuis node (posé par un
  // appel antérieur) serait rompu par le disconnect() ci-dessus — rebranché
  // ici, même principe qu'ensureLowpass/ensureHighpass.
  if (entry.sendGain) node.connect(entry.sendGain);
  entry.routedToEntityGain = true;
}

// Amorce le chargement d'UN chemin sans le jouer — voir
// view/audio/city-scene.js, préchargement de scène. Idempotent (ensureOneShot
// retombe sur l'entrée déjà en cache si déjà amorcée par un appel précédent,
// preload ou lecture réelle), jamais de rechargement en double. cacheKey :
// voir ensureOneShot.
export function preloadOneShot(path, cacheKey) {
  ensureOneShot(path, cacheKey);
}

// highpassHz/lowpassHz optionnels (voir ensureHighpass/ensureLowpass
// ci-dessus) : absents -> chemin STRICTEMENT inchangé, comme avant leur
// introduction (aucun filtre même tenté). lowpassHz est appliqué EN
// PREMIER (voir l'ordre de chaîne ci-dessus), pour que highpassHz — s'il est
// AUSSI fourni sur le même appel (ex. entité isFlying rendue en étouffé
// depuis l'autre face) — vienne toujours se brancher APRÈS lui, quel que
// soit l'ordre des propriétés dans l'objet d'options. cacheKey : voir
// ensureOneShot — permet à deux rendus du MÊME fichier (ex. normal vs
// étouffé) de garder chacun sa propre chaîne de filtres, jamais partagée.
// entityLayer (défaut false) : ce one-shot appartient au PAYSAGE SONORE
// D'ENTITÉS de la scène (pas/collision/vocal/balise, voir
// view/audio/city-scene.js) — route DANS le gain de couche entités (voir
// ensureEntityGainRouting), soumis au fondu de transition de scène. Un
// one-shot d'UI/menu (confirmation, refus...) omet ce drapeau : reste
// branché directement sur Howler.masterGain, jamais affecté par ce fondu.
export function playOneShot(path, { reverbSend, reverbBusInput, volume = 1, stereo = 0, rate = 1, highpassHz, lowpassHz, cacheKey, entityLayer = false } = {}) {
  const entry = ensureOneShot(path, cacheKey);

  if (lowpassHz !== undefined) {
    ensureLowpass(entry, lowpassHz);
  }
  if (highpassHz !== undefined) {
    ensureHighpass(entry, highpassHz);
  }
  if (entityLayer) {
    ensureEntityGainRouting(entry);
  }

  if (reverbBusInput && reverbSend && !entry.sendGain && Howler.ctx) {
    const sound = entry.howl._sounds && entry.howl._sounds[0];
    // Envoi depuis la SORTIE de la chaîne : le dernier filtre existant
    // (highpass, sinon lowpass), sinon node directement (comportement
    // inchangé).
    const source = entry.highpass || entry.lowpass || (sound && sound._node);
    if (source) {
      entry.sendGain = Howler.ctx.createGain();
      entry.sendGain.gain.value = reverbSend;
      source.connect(entry.sendGain);
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
// -> un gain "wet" (niveau de retour) -> gain de couche entités (voir
// "Gain de couche ENTITÉS" plus haut — la réverb n'est QUE l'écho de sons
// d'entité, elle doit donc fondre AVEC eux, jamais rester audible seule une
// fois la couche sèche coupée). `input` est le nœud auquel les voix
// envoient une part de leur signal (voir createPositionedSound.sendToReverb)
// — jamais un convolver par entité, toujours ce bus unique. Défensif : sans
// contexte, poignée inerte.
export function createReverbBus({ durationSec, decay, wet }) {
  if (!Howler.ctx) {
    return { input: null, setWet() {}, destroy() {} };
  }

  const convolver = Howler.ctx.createConvolver();
  convolver.buffer = generateImpulseResponse({ durationSec, decay });

  const wetGain = Howler.ctx.createGain();
  wetGain.gain.value = wet * WET_MAKEUP_GAIN;

  convolver.connect(wetGain);
  wetGain.connect(ensureEntityLayerGain());

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
// startDelayMs (défaut 0, immédiat — comportement historique inchangé) :
// retarde l'appel RÉEL à howl.play(), jamais howl.volume()/.stereo() (fixés
// au tick par l'appelant, voir update() ci-dessous — sans effet audible
// tant qu'aucune voix n'est en train de jouer) — pour DÉSEMPILER l'attaque
// de plusieurs voix qui démarreraient sinon dans la même fenêtre (voir
// view/audio/city-scene.js/buildEntitySoundEntry, seul appelant à fournir
// cette option). L'attaque (t=0 de la boucle) doit tomber RÉELLEMENT au
// moment décalé — retarder seulement le VOLUME reviendrait à révéler la
// voix en cours de boucle, après que son attaque soit déjà passée
// (silencieusement), ce qui manquerait l'effet recherché. Primitive
// GÉNÉRIQUE : ce module ignore tout du POURQUOI (désempilement, ou toute
// autre raison qu'un futur appelant pourrait avoir) — startTimer, jamais un
// booléen, pour qu'ANNULER via stop() (voir plus bas) empêche RÉELLEMENT le
// démarrage différé de survenir, pas seulement d'avoir un effet.
export function createPositionedSound(path, { rate = 1, cacheKey = path, startDelayMs = 0 } = {}) {
  let howl = positionedSoundCache.get(cacheKey);
  if (!howl) {
    howl = new Howl({ src: [path], loop: true, volume: 0, rate });
    positionedSoundCache.set(cacheKey, howl);
  }

  // Voix déjà connue (lieu déjà visité) : buffer déjà décodé, on relance
  // juste la lecture — jamais de nouveau Howl, jamais de redécodage.
  // volume(0) : même point de départ qu'une création fraîche — la voix
  // vient d'être arrêtée par la scène précédente, sans ce reset elle
  // repartirait au volume qu'elle avait à l'instant de cet arrêt, un court
  // instant avant que update() (premier tick) ne le recalcule.
  function startPlayback() {
    startTimer = null;
    howl.rate(rate);
    howl.volume(0);
    howl.play();
  }

  let startTimer = startDelayMs > 0 ? setTimeout(startPlayback, startDelayMs) : null;
  if (!startTimer) startPlayback();

  // Howler n'a pas de passe-bas natif : on insère nous-mêmes un
  // BiquadFilterNode dans la chaîne du son, entre son GainNode par-instance
  // (howl._sounds[0]._node, API bas niveau de Howler) et le gain de couche
  // ENTITÉS (voir "Gain de couche ENTITÉS" plus haut — une balise continue
  // EST toujours une entité, jamais de l'UI, donc toujours soumise au fondu
  // de transition). Cette connexion _node -> masterGain (posée par Howler)
  // est remplacée une fois à la création du son et n'est JAMAIS retouchée
  // par le plugin stereo (qui ne reconnecte que l'ENTRÉE de _node, via un
  // panner) : on peut donc s'y insérer sans jamais perturber le pan, dans
  // n'importe quel ordre.
  //
  // Le nœud n'existe pas forcément tout de suite (chargement asynchrone) :
  // on retente à chaque appel de setCutoff, sans jamais planter si absent —
  // on se contente alors de ne pas filtrer.
  let filter = null; // passe-bas (distance, voir setCutoff)
  // Passe-haut OPTIONNEL, EN SÉRIE après le passe-bas ci-dessus (node ->
  // filter -> highpass -> masterGain) — voir "Chaîne de filtres hauteur"
  // (entities/model.md, isFlying) : jamais créé tant que setHighpass n'est
  // jamais appelé (aucune entité non-isFlying n'y touche), donc AUCUN effet
  // sur le chemin d'une balise continue ordinaire.
  let highpass = null;
  // Envoi de réverb : un GainNode branché depuis la SORTIE de la chaîne
  // (highpass si présent, sinon le passe-bas) vers l'entrée du bus. Le
  // chemin sec reste inchangé, ceci n'ajoute qu'une dérivation.
  let sendGain = null;
  let pendingSend = null; // { busInput, level } tant que le filtre n'existe pas

  function attachSend(busInput, level) {
    const source = highpass || filter;
    if (!busInput || !source) return;
    sendGain = Howler.ctx.createGain();
    sendGain.gain.value = level;
    source.connect(sendGain);
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
    filter.connect(ensureEntityLayerGain());

    // Le filtre vient d'apparaître : s'il y avait un envoi de réverb en
    // attente (sendToReverb appelé avant que le nœud soit prêt), on le
    // branche maintenant, depuis ce même point de sortie.
    if (pendingSend) {
      attachSend(pendingSend.busInput, pendingSend.level);
      pendingSend = null;
    }

    return filter;
  }

  // setHighpass n'est jamais appelé pour une entité non-isFlying (voir
  // view/audio/city-scene.js) : ce filtre reste `null` pour toute balise
  // continue ordinaire, chemin STRICTEMENT inchangé.
  function ensureHighpass(freqHz) {
    const lp = ensureFilter(); // s'assure d'abord du passe-bas — même ordre à chaque fois
    if (!lp) return null;
    if (highpass) {
      highpass.frequency.value = freqHz;
      return highpass;
    }

    highpass = Howler.ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = freqHz;

    // Insère APRÈS le passe-bas (node -> filter -> highpass -> gain de
    // couche entités) : coupe le lien posé par ensureFilter, reconstruit
    // via ce second filtre.
    filter.disconnect();
    filter.connect(highpass);
    highpass.connect(ensureEntityLayerGain());

    // Un envoi de réverb déjà branché depuis la sortie du passe-bas (posé
    // par un appel antérieur sans highpass) serait rompu par le
    // disconnect() ci-dessus — rebranché depuis la sortie du highpass.
    if (sendGain) {
      highpass.connect(sendGain);
    }

    return highpass;
  }

  return {
    update(pan, volume) {
      howl.stereo(pan);
      howl.volume(volume);
    },
    // Fond le VOLUME de cette voix continue vers `target`, depuis sa valeur
    // ACTUELLE (howl.volume()) — voir view/audio/city-scene.js/
    // crossfadeFaceSwap (croisement d'occlusion recto/verso). Howler.fade()
    // anime en interne, INDÉPENDAMMENT du tick de jeu (déjà vérifié : la
    // musique/l'ambiance continuent de fondre pendant un sas gelé, voir
    // lib/audio.js/crossfadeSlot) — pas besoin d'AudioParam natif ici,
    // contrairement au gain de couche entités (rampEntityLayerGain), qui,
    // lui, pilote un GainNode construit à la main hors du modèle Howler.
    fadeVolume(target, durationMs) {
      howl.fade(howl.volume(), target, durationMs);
    },
    setCutoff(freqHz) {
      const f = ensureFilter();
      if (!f) return; // pas de nœud dispo pour l'instant : pas de filtrage
      f.frequency.value = clamp(freqHz, MIN_FILTER_FREQ_HZ, MAX_FILTER_FREQ_HZ);
    },
    // Fond le CUTOFF du passe-bas vers `targetHz`, depuis sa valeur
    // ACTUELLE — AudioParam natif (comme rampEntityLayerGain, lib/audio.js) :
    // ce filtre, LUI, est un BiquadFilterNode construit à la main (pas un
    // objet Howler), donc pas de Howler.fade() disponible dessus — la seule
    // automation native possible. Sans filtre encore prêt (ensureFilter
    // retente à chaque appel, voir son commentaire), no-op silencieux.
    rampCutoff(targetHz, durationMs) {
      const f = ensureFilter();
      if (!f || !Howler.ctx) return;
      const now = Howler.ctx.currentTime;
      const target = clamp(targetHz, MIN_FILTER_FREQ_HZ, MAX_FILTER_FREQ_HZ);
      f.frequency.cancelScheduledValues(now);
      f.frequency.setValueAtTime(f.frequency.value, now);
      f.frequency.linearRampToValueAtTime(target, now + durationMs / 1000);
    },
    setHighpass(freqHz) {
      const f = ensureHighpass(freqHz);
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
      // Annule un démarrage DIFFÉRÉ pas encore survenu (voir startDelayMs
      // ci-dessus) : l'entité a disparu/est devenue dormante avant la fin
      // de son délai — démarrage annulé, JAMAIS de son fantôme qui
      // partirait quand même après coup. clearTimeout, jamais un simple
      // drapeau : empêche RÉELLEMENT startPlayback de s'exécuter.
      if (startTimer) {
        clearTimeout(startTimer);
        startTimer = null;
      }
      if (sendGain) {
        sendGain.disconnect();
        sendGain = null;
      }
      if (highpass) {
        highpass.disconnect();
        highpass = null;
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
// Politique par canal, déclarée en UN SEUL point : `limit` (flux simultanés
// max, lu par la synchronisation d'ambiance PAR SLOT plus bas — voir
// "Ambiance : DIFFING PAR COUCHE"/desiredAmbienceSlots, seule à l'appliquer
// aujourd'hui) et `html5` (streaming, voir plus bas). `overflow` reste
// déclaré pour documenter l'INTENTION de chaque canal (musique : la
// nouvelle piste évincerait l'ancienne ; ambiance : au-delà de la limite,
// dégrader plutôt qu'évincer) mais n'est lu par aucun code aujourd'hui —
// chaque canal gère sa propre politique de dépassement à sa façon (musique :
// un seul flux par construction, jamais deux ; ambiance : troncature de la
// couche météo, voir desiredAmbienceSlots). La limite d'ambiance vient
// d'AMBIENCE_CHANNEL_LIMIT (config/audio-channels.js), PAS d'un littéral
// ici : c'est la même valeur que core/level.js utilise pour valider le
// format de niveau — monter cette seule constante (ex. 2 -> 3) suffit à
// autoriser 3 ambiances de bout en bout, sans toucher à ce fichier ni à
// core/level.js.
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

// Dernier facteur appliqué à un canal — mémorisé EN PLUS de l'application
// immédiate ci-dessous (jamais à sa place) : un flux qui naît PLUS TARD sur
// ce canal (ex. le morceau suivant d'une séquence musicale, voir
// startMusicSequence plus bas ; ou une couche d'ambiance qui apparaît en
// cours de scène, voir "Ambiance : DIFFING PAR COUCHE" plus bas) doit
// démarrer à ce même niveau, sans attendre un futur appel explicite.
const channelVolumes = new Map();

function channelVolume(channel) {
  return channelVolumes.get(channel) ?? 1;
}

// Applique le même facteur à TOUS les flux du canal (ex. les deux couches
// d'ambiance partagent un seul curseur de volume).
export function setGlobalVolume(channel, factor) {
  channelVolumes.set(channel, factor);
  const streams = globalChannels.get(channel);
  if (!streams) return;
  for (const howl of streams) {
    howl.volume(factor);
  }
}

// Gain de sortie GLOBAL, APRÈS tout le reste (balises, vocal, pas, musique,
// ambiances, UI, collision) — Howler.volume() pilote Howler.masterGain, le
// nœud vers lequel TOUT converge déjà dans ce fichier, directement OU via le
// gain de couche entités (voir "Gain de couche ENTITÉS" plus haut, lui-même
// branché sur Howler.masterGain) : les sons d'entité (positionnés, one-shots
// avec entityLayer, bus de réverb) passent par ce gain intermédiaire ; la
// musique, l'ambiance et les one-shots d'UI restent branchés directement,
// sans routage particulier. Un seul appel ici re-multiplie donc
// INSTANTANÉMENT tout ce qui joue déjà, sans avoir à reparcourir/rafraîchir
// chaque flux comme setGlobalVolume (ci-dessus) doit le faire par canal —
// c'est la bonne primitive pour un volume "principal"
// qui ne doit jamais changer les équilibres relatifs entre canaux.
export function setMasterVolume(factor) {
  Howler.volume(factor);
}

// --- Musique : lecture SÉQUENCÉE (défaut) ou boucle continue (option) ---
//
// Contrairement à l'ambiance (plusieurs flux possibles, toujours en boucle,
// diffing par slot — voir "Ambiance : DIFFING PAR COUCHE" plus bas), la
// musique a un cycle de vie propre (enchaînement avec respiration, fondu de
// sortie universel) qui a besoin de SA PROPRE mécanique — mais PARTAGE le
// tableau de suivi channelStreams ("music", voir GLOBAL_CHANNELS) avec
// setGlobalVolume ci-dessus : le réglage de volume générique d'un canal n'a pas à
// savoir COMMENT ce canal enchaîne ses morceaux, et un appelant existant
// (ex. le slider "Volume de la musique", voir view/menus/audio-menu.js)
// continue de fonctionner sans changement.
//
// Cache des Howl de musique PAR CHEMIN — persiste au-delà d'une scène, comme
// positionedSoundCache/oneShotCache plus haut : un membre de pool déjà joué
// une fois (ou préchargé, voir preloadMusic) ne doit jamais se re-bufferiser
// à un enchaînement ou une revisite. html5:true (streaming, voir
// GLOBAL_CHANNELS) : la simple CRÉATION du Howl amorce déjà le buffering
// progressif, avant tout .play() — c'est ce qui rend le préchargement utile
// et NE JAMAIS unload() ci-dessous peu coûteux (rien n'est décodé en mémoire
// pour un Howl html5, juste un élément <audio> qui bufferise).
const musicHowlCache = new Map();

function ensureMusicHowl(path, loop) {
  let howl = musicHowlCache.get(path);
  if (!howl) {
    // html5 lu depuis la politique DÉCLARÉE du canal (GLOBAL_CHANNELS,
    // "music") : même source que channelPolicy("ambience").html5 plus bas,
    // jamais un littéral dupliqué ici.
    howl = new Howl({ src: [path], html5: channelPolicy("music").html5 });
    musicHowlCache.set(path, howl);
  }
  howl.loop(loop);
  return howl;
}

// Amorce le buffering d'un chemin de musique sans le jouer — voir
// view/audio/city-scene.js, préchargement de scène (pools jour ET nuit
// entiers, pas seulement la phase courante : une bascule ne doit jamais
// tomber sur un membre jamais amorcé).
export function preloadMusic(path) {
  ensureMusicHowl(path, false);
}

// Compteur de GÉNÉRATION musicale : incrémenté à chaque démarrage/arrêt
// EXPLICITE (startMusicSequence, switchMusicSequence, fadeOutMusic) — un
// enchaînement (`once("end")`) ou une respiration programmés par une
// génération PÉRIMÉE se reconnaissent (comparaison à la génération capturée
// à leur création) et s'auto-annulent. ROBUSTESSE AU CHEVAUCHEMENT en UN
// SEUL compteur, plutôt qu'un suivi individuel de chaque timer/écouteur :
// quel que soit le nombre d'arrêts/bascules coup sur coup (ex. bascule de
// phase puis transition de lieu aussitôt), seule la dernière génération
// démarrée peut encore agir.
let musicGeneration = 0;
let musicBreatherTimer = null;
// Minuteurs d'arrêt DIFFÉRÉ après fondu (voir fadeOutMusic) — un par flux
// SORTANT en cours de fondu, jamais un seul partagé : deux fondus qui se
// chevauchent (ex. bascule de phase suivie de près d'une transition de
// lieu) ne doivent jamais se marcher dessus.
let musicFadeOutTimers = [];

function clearMusicBreather() {
  if (musicBreatherTimer) {
    clearTimeout(musicBreatherTimer);
    musicBreatherTimer = null;
  }
}

function clearMusicFadeOutTimers() {
  for (const timer of musicFadeOutTimers) clearTimeout(timer);
  musicFadeOutTimers = [];
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// Joue UN morceau et programme la SUITE (enchaînement avec respiration),
// sauf en mode boucle continue. `pickPath()` : fournie par l'appelant,
// appelée FRAÎCHEMENT à chaque morceau (jamais mémorisée) — tire un membre
// du pool courant ; la politique "sans répétition immédiate" vit déjà dans
// resolveAsset/pickFromPool (voir lib/assets.js), ce module l'ignore
// totalement, il ne fait qu'appeler ce qu'on lui donne. `generation` :
// capturée par l'appelant (startMusicSequence/switchMusicSequence),
// comparée à musicGeneration à CHAQUE réveil — périmée -> no-op silencieux.
function playMusicTrack(pickPath, loop, breatherRange, generation) {
  if (generation !== musicGeneration) return;

  const streams = channelStreams("music");
  const howl = ensureMusicHowl(pickPath(), loop);
  // .stop() AVANT tout — musicHowlCache est PAR CHEMIN (voir plus bas) : ce
  // Howl a pu être repioché en plein FONDU DE SORTIE (fadeOutMusic, même
  // membre de pool repris) et porter encore une animation de fondu Howler
  // ACTIVE en arrière-plan, qui continuerait à tirer le volume vers 0 même
  // après le howl.volume() ci-dessous — .stop() coupe net cette animation
  // (Howler l'arrête en interne), garantissant un volume qui TIENT. Sur un
  // Howl déjà arrêté (cas normal), no-op inoffensif.
  howl.stop();
  howl.volume(channelVolume("music"));
  streams.push(howl);
  howl.play();

  if (loop) return; // boucle continue : pas d'enchaînement, comportement historique préservé.

  howl.once("end", () => {
    const index = streams.indexOf(howl);
    if (index !== -1) streams.splice(index, 1);
    // PAS de howl.unload() : voir musicHowlCache plus haut — le morceau
    // reste bufferisé pour une reprise future sans redécodage.
    if (generation !== musicGeneration) return; // arrêt/bascule survenu entre-temps

    const pauseMs = randomBetween(breatherRange.min, breatherRange.max);
    musicBreatherTimer = setTimeout(() => {
      musicBreatherTimer = null;
      playMusicTrack(pickPath, loop, breatherRange, generation);
    }, pauseMs);
  });
}

// Démarre une séquence musicale FRAÎCHE — voir view/audio/city-scene.js, à
// l'entrée dans une scène : joue directement, SANS fondu d'entrée
// (comportement historique inchangé), puis enchaîne avec respiration si
// `loop` est faux. Invalide toute séquence précédente encore en attente
// (respiration ou `once("end")`) via le compteur de génération, sans jamais
// la manipuler directement — elle se reconnaît périmée d'elle-même.
export function startMusicSequence({ pickPath, loop = false, breatherRange }) {
  musicGeneration++;
  clearMusicBreather();
  playMusicTrack(pickPath, loop, breatherRange, musicGeneration);
}

// Arrêt UNIVERSEL de la musique — TOUT arrêt (bascule de phase, transition
// de lieu, tout arrêt futur) passe par ici, jamais une coupure sèche. Fond
// le(s) morceau(x) EN COURS sur SA PROPRE référence, retirée IMMÉDIATEMENT
// de `streams` — donc invisible à un flux qui démarrerait dans la foulée sur
// ce même canal (ex. la scène suivante, voir startMusicSequence) : le fondu
// se termine en tâche de fond, entièrement indépendant de ce qui joue
// ensuite, jamais de fondus qui se battent ni de voix orpheline. Invalide
// aussi toute respiration/enchaînement en attente (compteur de génération) :
// un enchaînement naturel ne doit jamais ressusciter après cet arrêt.
// L'arrêt DIFFÉRÉ (après le fondu visuel/audible) est minuté PAR NOUS-MÊMES
// (setTimeout), JAMAIS via l'évènement `"fade"` de Howler — bug corrigé :
// `outgoing` vient du cache PAR CHEMIN (musicHowlCache), qui peut retomber
// sur EXACTEMENT le même Howl pour le morceau SUIVANT (même membre de pool
// repioché, ou tout autre appelant qui repartirait sur ce chemin) AVANT que
// ce fondu-ci n'ait fini d'animer. Deux symptômes observés, MÊME cause :
//   - un `.fade()` ultérieur sur ce même Howl (ex. un second fondu qui le
//     recapture) REMPLACE l'animation interne de Howler SANS jamais émettre
//     `"fade"` pour la première — le `.stop()` attendu ne se produit
//     JAMAIS, la musique "suivante" (en fait la même voix réutilisée)
//     continue de jouer sans coupure ni silence.
//   - une reprise via `playMusicTrack` sur ce MÊME Howl pour un morceau
//     qu'on croit "nouveau" : un simple `howl.volume()` n'annule PAS
//     l'animation de fondu Howler en cours, qui continue de tirer le volume
//     vers 0 en arrière-plan par-dessus — entendu comme "l'ancienne musique
//     rejoue quelques secondes puis s'éteint", alors que c'est déjà la voix
//     du morceau suivant. Corrigé côté `playMusicTrack` : `.stop()` AVANT
//     `.volume()`/`.play()` sur tout Howl repioché du cache, qui coupe net
//     l'animation résiduelle (voir son commentaire).
// En pilotant nous-mêmes le délai (durée EXACTE fadeMs, indépendante de tout
// ce que Howler fait par ailleurs sur ce Howl), l'arrêt différé vérifie à
// l'échéance si CETTE INSTANCE PRÉCISE sert encore quelque chose de vivant
// (présente dans le canal ACTIF, voir channelStreams) — pas une génération
// globale (trop large : elle annulerait aussi l'arrêt d'une voix VRAIMENT
// abandonnée dès qu'une scène suivante démarre, laissant tourner en silence
// une instance qu'on aurait pu proprement arrêter). Reprise entre-temps par
// une lecture plus récente sur ce même chemin -> on la LAISSE VIVRE (jamais
// stoppée) ; sinon -> arrêt normal.
export function fadeOutMusic(fadeMs) {
  musicGeneration++;
  clearMusicBreather();
  clearMusicFadeOutTimers();

  const streams = channelStreams("music");
  const outgoingStreams = streams.splice(0, streams.length);
  for (const outgoing of outgoingStreams) {
    outgoing.fade(outgoing.volume(), 0, fadeMs);
  }

  const timer = setTimeout(() => {
    musicFadeOutTimers = musicFadeOutTimers.filter((t) => t !== timer);
    const activeStreams = channelStreams("music");
    for (const outgoing of outgoingStreams) {
      if (activeStreams.includes(outgoing)) continue; // récupérée entre-temps (même chemin) : vivante, jamais stoppée ici
      outgoing.stop();
      // PAS de outgoing.unload() : voir musicHowlCache — le tampon reste
      // disponible pour une reprise future.
    }
  }, fadeMs);
  musicFadeOutTimers.push(timer);
}

// Bascule vers une NOUVELLE séquence (ex. changement de phase jour/nuit,
// voir view/audio/city-scene.js) : fondu du morceau courant (fadeOutMusic)
// PUIS une respiration PUIS démarrage de la nouvelle séquence — RÉUTILISE
// le fondu universel et la respiration de l'enchaînement naturel, jamais un
// second mécanisme. La génération est capturée APRÈS le fondu (qui vient
// d'en démarrer une nouvelle) : un chevauchement (ex. bascule suivie de
// près d'une transition de lieu) s'auto-résout comme partout ci-dessus, la
// dernière génération démarrée gagnant toujours.
export function switchMusicSequence({ pickPath, loop = false, breatherRange, fadeMs }) {
  fadeOutMusic(fadeMs);
  const generation = musicGeneration;
  const pauseMs = randomBetween(breatherRange.min, breatherRange.max);
  musicBreatherTimer = setTimeout(() => {
    musicBreatherTimer = null;
    playMusicTrack(pickPath, loop, breatherRange, generation);
  }, fadeMs + pauseMs);
}

// --- Couches persistantes MUSIQUE/AMBIANCE (musique/ambiance DE LIEU vs
// D'ÉTAT, continuité par IDENTITÉ) ---
//
// PRINCIPE : une piste ne s'arrête que si elle doit VRAIMENT changer,
// jamais pour "relancer la même chose". Deux couches INDÉPENDANTES par
// canal (music/ambience), COMPOSÉES par priorité :
//   - "state" (D'ÉTAT) : liée à un état de PARTIE qui transcende les
//     lieux — la perception surnaturelle (voir view/audio/city-scene.js)
//     est la première et SEULE cliente aujourd'hui, mais le mécanisme est
//     générique (pas une exception surnaturelle en dur) pour qu'une future
//     musique/ambiance d'événement global le réutilise tel quel.
//   - "location" (DE LIEU) : liée à la scène courante (musique de phase,
//     ambiance du niveau) — change à chaque transition/bascule de phase.
// "state" prime sur "location" quand elle est active (identity non null) ;
// sinon "location" pilote le canal. Persistant au niveau MODULE — survit à
// la destruction/recréation d'une scène (contrairement à l'état de
// createCityAudioScene) : c'est CE qui permet à une musique/ambiance
// D'ÉTAT de continuer SANS COUPURE à travers une transition de lieu.
//
// "Identity" = la SOURCE DÉCLARÉE (une clé de pool musique, un tableau de
// clés d'ambiance), PAS le fichier exact tiré par resolveAsset — ce module
// ignore tout des pools eux-mêmes (voir header du fichier : aucune
// connaissance du jeu), `identity` n'est qu'une valeur COMPARABLE et
// opaque, fournie par l'appelant. Deux appels avec la MÊME identity NE
// DÉCLENCHENT JAMAIS de fondu ni de redémarrage, quel que soit ce qui joue
// déjà — c'est la garde universelle de continuité. `null` = "cette couche
// ne veut rien".

const musicLayers = {
  location: { identity: null, params: null },
  state: { identity: null, params: null },
};
let musicPlayingIdentity = null;

function winningMusicLayer() {
  return musicLayers.state.identity !== null ? musicLayers.state : musicLayers.location;
}

// Synchronise le canal "music" avec la couche GAGNANTE — NO-OP si son
// identity est déjà celle qui joue (continuité, voir header). Sinon :
// démarrage DIRECT (comme à l'entrée en scène historique) si rien ne
// jouait, sinon un fondu (switchMusicSequence) vers la nouvelle — jamais
// de coupure sèche.
function syncMusicChannel(fadeMs) {
  const winning = winningMusicLayer();
  if (winning.identity === musicPlayingIdentity) return;
  musicPlayingIdentity = winning.identity;

  if (winning.identity === null) {
    fadeOutMusic(fadeMs);
    return;
  }
  if (channelStreams("music").length === 0) {
    startMusicSequence(winning.params);
  } else {
    switchMusicSequence({ ...winning.params, fadeMs });
  }
}

// Déclare ce que la couche `layer` ("location" | "state") veut jouer —
// `identity`/`params` : voir header (params = { pickPath, loop,
// breatherRange }, ignoré si identity est null). Recalcule et applique
// IMMÉDIATEMENT la conséquence sur le canal (voir syncMusicChannel) :
// chaque appelant (montage de scène, bascule de phase, bascule de
// perception) ne fait que déclarer SON INTENTION, jamais lui-même s'il
// faut fondre ou laisser filer — ?? null normalise un identity absent
// (undefined) en null, jamais une distinction fantôme entre les deux.
export function setMusicLayer(layer, identity, params, fadeMs) {
  musicLayers[layer] = { identity: identity ?? null, params };
  syncMusicChannel(fadeMs);
}

// Vide les DEUX couches et arrête le canal si besoin (voir
// syncMusicChannel, identity null -> fadeOutMusic) — pour une sortie
// RÉELLE de partie (retour au menu principal), JAMAIS pour une transition
// de lieu (qui ne doit jamais couper une couche qui continue légitimement
// — voir view/audio/city-scene.js/stopPersistentAudioLayers, seul
// appelant).
export function clearMusicLayers(fadeMs) {
  musicLayers.location = { identity: null, params: null };
  musicLayers.state = { identity: null, params: null };
  syncMusicChannel(fadeMs);
}

// --- Ambiance : DIFFING PAR COUCHE (état / lieu / météo) ---
//
// L'ambiance porte TROIS couches déclarées (état, lieu, météo — voir
// ambienceLayers/weatherAmbienceLayer plus bas), dont une ADDITIVE (météo,
// superposée à la couche gagnante état/lieu, jamais à sa place). Un ancien
// modèle comparait un SEUL blob d'identité au niveau du CANAL ENTIER : dès
// qu'UNE SEULE couche changeait, tout le canal était refondu — y compris
// les couches qui n'avaient pourtant pas bougé (bug rapporté en jeu : un
// changement de météo accrochait l'ambiance de LIEU, pourtant inchangée).
//
// Chaque couche est maintenant comparée et fondue INDÉPENDAMMENT (voir
// slotPlaying/syncAmbienceLayers) : une couche dont la source déclarée
// (identity — un pool/une clé, PAS le fichier exact tiré par resolveAsset)
// n'a PAS changé garde EXACTEMENT ses flux Howl en cours — aucun fondu,
// aucun nouveau tirage dans le pool, la MÊME instance continue. C'est la
// continuité déjà en place pour la musique (voir syncMusicChannel),
// GÉNÉRALISÉE par slot au lieu d'un blob de canal entier.
//
// "Effectif" (state/location) : ces deux couches restent mutuellement
// EXCLUSIVES pour la LECTURE (l'état prime, comme avant) même si chacune
// garde SA PROPRE déclaration en continu — le lieu peut rester déclaré
// "trafic" tout du long, son EFFECTIF devient silence dès que l'état prend
// la main, puis redevient "trafic" (sans re-fondu, puisque son IDENTITY
// PROPRE n'a pas varié) quand l'état la relâche. La météo, elle, n'est
// jamais éclipsée par l'état/le lieu — seulement BORNÉE par la place qui
// reste sous AMBIENCE_CHANNEL_LIMIT une fois la couche gagnante posée
// (state/location sont chacune déjà <= la limite par construction : state
// = 1 pool au plus, location validé <= la limite au chargement — jamais
// tronquées elles-mêmes, seule la météo peut l'être).
const ambienceLayers = {
  location: { identity: null, resolvedPaths: null },
  state: { identity: null, resolvedPaths: null },
};
const weatherAmbienceLayer = { identity: null, resolvedPaths: null };

// Égalité d'identity : un TABLEAU de clés comparé par ENSEMBLE (ordre
// indifférent), jamais par référence. Une couche sans rien à jouer est
// TOUJOURS `null` (jamais `[]`, voir desiredAmbienceSlots) : deux `null`
// sont égaux via `a === b`, un `null` n'est jamais égal à un tableau.
function ambienceIdentityEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((key, i) => key === sortedB[i]);
}

// Ce qui joue RÉELLEMENT, PAR SLOT (state/location/weather) — l'identity
// EFFECTIVE actuellement audible sur ce slot et les flux Howl qui la
// portent. SEULE source de vérité pour le diffing (jamais ambienceLayers/
// weatherAmbienceLayer, qui portent l'INTENTION déclarée, pas ce qui joue
// réellement à cet instant).
const slotPlaying = {
  state: { identity: null, streams: [] },
  location: { identity: null, streams: [] },
  weather: { identity: null, streams: [] },
};

// Dérive ce que CHAQUE slot DEVRAIT jouer maintenant, à partir des
// déclarations courantes — pure dérivation, ne touche à AUCUN Howl (voir
// syncAmbienceLayers, seul appelant, qui compare ensuite à slotPlaying).
function desiredAmbienceSlots() {
  const stateWins = ambienceLayers.state.identity !== null;
  const winningPathsLength = stateWins
    ? ambienceLayers.state.resolvedPaths.length
    : (ambienceLayers.location.resolvedPaths ?? []).length;

  const stateSlot = stateWins
    ? { identity: ambienceLayers.state.identity, resolvedPaths: ambienceLayers.state.resolvedPaths }
    : { identity: null, resolvedPaths: null };
  const locationSlot = stateWins
    ? { identity: null, resolvedPaths: null }
    : { identity: ambienceLayers.location.identity, resolvedPaths: ambienceLayers.location.resolvedPaths };

  const { limit } = channelPolicy("ambience");
  const room = Math.max(0, limit - winningPathsLength);
  const weatherIdentity = weatherAmbienceLayer.identity;
  let weatherSlot = { identity: null, resolvedPaths: null };
  if (weatherIdentity) {
    if (room === 0) {
      console.warn(`audio: canal "ambience" déjà à sa limite (${limit}), couche météo ignorée.`);
    } else {
      if (weatherIdentity.length > room) {
        console.warn(`audio: canal "ambience" déjà à sa limite (${limit}), ${weatherIdentity.length - room} flux météo ignoré(s).`);
      }
      weatherSlot = { identity: weatherIdentity.slice(0, room), resolvedPaths: weatherAmbienceLayer.resolvedPaths.slice(0, room) };
    }
  }

  return { state: stateSlot, location: locationSlot, weather: weatherSlot };
}

// Fond UN SLOT de son contenu ACTUEL vers `paths` (peut être vide -> fondu
// de sortie seul) — ENTIÈREMENT AUTONOME (son propre tableau `outgoing`,
// son propre minuteur). Contrairement à l'ancien mécanisme (un minuteur
// PARTAGÉ par tout le canal, annulé à chaque nouvel appel — la cause du bug
// corrigé ici : un fondu à peine commencé, remplacé par le suivant avant
// d'avoir pu nettoyer ses propres flux, s'entendait comme une coupure
// nette), rien ici n'annule le nettoyage d'un AUTRE appel — qu'il concerne
// ce même slot ou un autre. Chaque Howl est un objet FRAIS (jamais repioché
// d'un cache, contrairement à la musique) : aucun risque qu'un appel
// ultérieur récupère la MÊME instance avant sa fin de fondu, donc rien à
// vérifier à l'échéance du minuteur (contrairement à fadeOutMusic).
function crossfadeSlot(slot, paths, fadeMs) {
  const record = slotPlaying[slot];
  const outgoing = record.streams;
  for (const howl of outgoing) {
    howl.fade(howl.volume(), 0, fadeMs);
  }
  if (outgoing.length > 0) {
    setTimeout(() => {
      const streams = channelStreams("ambience");
      for (const howl of outgoing) {
        howl.stop();
        howl.unload();
        const index = streams.indexOf(howl);
        if (index !== -1) streams.splice(index, 1);
      }
    }, fadeMs);
  }

  const targetVolume = channelVolume("ambience");
  const html5 = channelPolicy("ambience").html5;
  const streams = channelStreams("ambience");
  record.streams = paths.map((path) => {
    const howl = new Howl({ src: [path], loop: true, html5, volume: 0 });
    streams.push(howl);
    howl.play();
    howl.fade(0, targetVolume, fadeMs);
    return howl;
  });
}

// Démarre UN SLOT directement, sans fondu — réservé au tout premier son du
// canal (voir syncAmbienceLayers, `wasEmpty`) : une scène qui s'ouvre sur
// un canal jusque-là silencieux ne doit pas "finir un fondu" qui n'a jamais
// eu lieu, même politique que l'entrée en scène historique de la musique.
function startSlotDirect(slot, paths) {
  const targetVolume = channelVolume("ambience");
  const html5 = channelPolicy("ambience").html5;
  const streams = channelStreams("ambience");
  slotPlaying[slot].streams = paths.map((path) => {
    const howl = new Howl({ src: [path], loop: true, html5 });
    howl.volume(targetVolume);
    streams.push(howl);
    howl.play();
    return howl;
  });
}

// Synchronise le canal "ambience" — DIFF PAR SLOT (voir header) : calcule ce
// que chaque slot DEVRAIT jouer (desiredAmbienceSlots), compare à ce qu'il
// joue DÉJÀ (slotPlaying) — IDENTIQUE -> ce slot n'est même pas touché
// (aucun fondu, aucun nouveau Howl, sa voix continue exactement comme
// avant) ; DIFFÉRENT -> fondu (ou démarrage direct si le canal entier était
// silencieux avant cette synchronisation — `wasEmpty` figé UNE FOIS pour
// que plusieurs slots démarrant ENSEMBLE à un même montage le fassent tous
// directement, jamais l'un fondu et l'autre pas pour la même scène).
function syncAmbienceLayers(fadeMs) {
  const wasEmpty = channelStreams("ambience").length === 0;
  const desired = desiredAmbienceSlots();
  for (const slot of ["state", "location", "weather"]) {
    const next = desired[slot];
    const current = slotPlaying[slot];
    if (ambienceIdentityEqual(next.identity, current.identity)) continue;
    current.identity = next.identity;
    const paths = next.resolvedPaths ?? [];
    if (wasEmpty) {
      startSlotDirect(slot, paths);
    } else {
      crossfadeSlot(slot, paths, fadeMs);
    }
  }
}

// Déclare ce que la couche `layer` veut jouer — `identity` : tableau de
// clés (ou null) ; `resolvedPaths` : les MÊMES clés déjà résolues par
// l'appelant (voir lib/assets.js/resolveAsset — ce module n'en a aucune
// connaissance, voir header du fichier), ignoré si identity est null.
export function setAmbienceLayer(layer, identity, resolvedPaths, fadeMs) {
  ambienceLayers[layer] = { identity: identity ?? null, resolvedPaths };
  syncAmbienceLayers(fadeMs);
}

// Déclare les TROIS composantes du canal "ambience" EN UNE SEULE
// SYNCHRONISATION — voir view/audio/city-scene.js, montage de scène : les
// trois peuvent changer ENSEMBLE à un même montage (nouveau lieu,
// éventuellement nouveau contexte indoor/outdoor, éventuellement perception
// déjà active). Les déclarer une par une synchroniserait le canal TROIS
// fois de suite sur des cibles INTERMÉDIAIRES — inoffensif depuis le
// passage au diffing PAR SLOT ci-dessus (une cible intermédiaire où une
// seule couche a changé ne touche justement QUE cette couche), mais cette
// fonction reste le point d'entrée du montage : un seul appel, une
// intention complète.
export function declareAmbienceLayers({ state, location, weather }, fadeMs) {
  ambienceLayers.state = { identity: state.identity ?? null, resolvedPaths: state.resolvedPaths };
  ambienceLayers.location = { identity: location.identity ?? null, resolvedPaths: location.resolvedPaths };
  weatherAmbienceLayer.identity = weather.identity ?? null;
  weatherAmbienceLayer.resolvedPaths = weather.resolvedPaths;
  syncAmbienceLayers(fadeMs);
}

// Déclare ce que la couche MÉTÉO veut jouer EN PLUS de la couche gagnante
// (voir desiredAmbienceSlots ci-dessus) — MÊME contrat que setAmbienceLayer
// (identity/resolvedPaths, null = "rien à superposer", ex. un état météo
// silencieux comme "sunny"). Persistante au niveau MODULE comme
// ambienceLayers : survit à la destruction/recréation d'une scène, c'est CE
// qui permet à une ambiance météo de continuer SANS COUPURE à travers une
// transition de lieu tant que la météo elle-même ne change pas.
export function setWeatherAmbienceLayer(identity, resolvedPaths, fadeMs) {
  weatherAmbienceLayer.identity = identity ?? null;
  weatherAmbienceLayer.resolvedPaths = resolvedPaths;
  syncAmbienceLayers(fadeMs);
}

// Voir clearMusicLayers — même principe, même appelant unique. Vide AUSSI
// la couche météo (sortie RÉELLE de partie, jamais une simple transition de
// lieu) : les trois couches d'ambiance repartent de zéro.
export function clearAmbienceLayers(fadeMs) {
  ambienceLayers.location = { identity: null, resolvedPaths: null };
  ambienceLayers.state = { identity: null, resolvedPaths: null };
  weatherAmbienceLayer.identity = null;
  weatherAmbienceLayer.resolvedPaths = null;
  syncAmbienceLayers(fadeMs);
}
