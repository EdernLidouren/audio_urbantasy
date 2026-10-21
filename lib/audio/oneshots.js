// SONS PONCTUELS : un Howl par chemin (ou par clé), mis en cache, avec sa
// chaîne de filtres (passe-haut, passe-bas), son envoi de réverb et son
// routage dans la couche entités ; sons ponctuels SUIVIS (pilotables pendant
// la lecture) ; variation de hauteur.

import { ensureEntityLayerGain } from "./context.js";
import { MAX_FILTER_FREQ_HZ, MIN_FILTER_FREQ_HZ, clamp, clampVolume } from "./levels.js";

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
// view/audio/oneshots.js, contre le rendu normal du
// même fichier ailleurs) passent une clé DISTINCTE du chemin — même
// principe que ./positioned.js/createPositionedSound (cacheKey). Omis -> repli sur
// path (un Howl par chemin).
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
// (doc/entity-model.md, isFlying) : SEULE différence avec le branchement de
// sendGain ci-dessous (une simple DÉRIVATION en parallèle, jamais insérée
// dans le chemin lui-même). Mis en cache PAR CHEMIN, comme sendGain, avec
// la MÊME limite connue (deux entités qui partageraient exactement le même
// fichier partageraient aussi ce filtre) — acceptée ici pour la même
// raison : sans coût aujourd'hui, aucun contenu réel ne partage un chemin
// entre une entité isFlying et une qui ne l'est pas.
// Passe-bas OPTIONNEL pour un one-shot (voir "Rendu étouffé de l'autre
// face", CLAUDE.md/RECTO-VERSO) — MÊME position dans la chaîne
// que pour une balise continue (createPositionedSound/ensureFilter ci-bas) :
// node -> lowpass -> highpass (si présent) -> gain de couche entités,
// jamais l'inverse, pour que les deux filtres restent composables sur un
// même one-shot (ex. une entité isFlying entendue en étouffé depuis
// l'autre face). Seuls des one-shots D'ENTITÉ utilisent lowpassHz/
// highpassHz (voir view/audio/city-scene.js) — la destination finale peut
// donc être le gain de couche entités SANS condition, jamais un one-shot
// d'UI (voir ensureEntityGainRouting plus bas pour CEUX-LÀ, qui n'ont
// jamais de filtre).
// Sortie de la chaîne de filtres d'un one-shot : la couche ENTITÉS par
// défaut (soumise au fondu de transition), ou directement Howler.masterGain
// pour une entrée créée HORS couche (entityLayer:false, voir
// prepareOneShot) — un son positionné qui doit survivre au sas.
function chainDestination(entry) {
  return entry.outsideEntityLayer ? Howler.masterGain : ensureEntityLayerGain();
}

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
  entry.lowpass.connect(chainDestination(entry));

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
  entry.highpass.connect(chainDestination(entry));

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
// ci-dessus) : absents -> aucun filtre n'est même tenté. lowpassHz est appliqué EN
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
  prepareOneShot(entry, { reverbSend, reverbBusInput, highpassHz, lowpassHz, entityLayer });

  entry.howl.volume(clampVolume(volume));
  entry.howl.stereo(stereo);
  entry.howl.rate(rate);
  entry.howl.play();
}

// Chaîne de filtres/routage/réverb d'une entrée one-shot, posée AVANT la
// lecture — partagée par playOneShot et playTrackedOneShot ci-dessous, un
// seul point de branchement.
function prepareOneShot(entry, { reverbSend, reverbBusInput, highpassHz, lowpassHz, entityLayer }) {
  // Une entrée filtrée HORS couche entités garde cette destination pour
  // toujours : l'appelant lui réserve une cacheKey dédiée (voir
  // view/audio/city-scene.js, sons de départ).
  if (!entityLayer && (lowpassHz !== undefined || highpassHz !== undefined)) entry.outsideEntityLayer = true;
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
}

// One-shot SUIVI : comme playOneShot, mais renvoie une POIGNÉE sur CETTE
// instance de lecture (id Howler) pour la re-spatialiser pendant qu'elle
// joue (voir view/audio/oneshots.js/updateTrackedOneShots) et savoir
// quand elle se termine. Pan/volume sont pilotés PAR ID (jamais tout le
// Howl) ; le passe-bas reste celui de l'ENTRÉE (un nœud par cacheKey, voir
// ensureLowpass) — deux lectures simultanées du même cacheKey partagent
// donc leur coupure, limite acceptée, comme pour les autres filtres. `null`
// si la lecture n'a pas pu démarrer (cas limite, jamais en pratique).
// highpassHz (optionnel, entité isFlying) : posé une fois au départ, jamais
// piloté au tick — il ne dépend pas de la position.
export function playTrackedOneShot(path, { reverbSend, reverbBusInput, volume = 1, stereo = 0, rate = 1, lowpassHz, highpassHz, cacheKey, entityLayer = false } = {}) {
  const entry = ensureOneShot(path, cacheKey);
  prepareOneShot(entry, { reverbSend, reverbBusInput, lowpassHz, highpassHz, entityLayer });

  entry.howl.volume(clampVolume(volume));
  entry.howl.stereo(stereo);
  entry.howl.rate(rate);
  const id = entry.howl.play();
  if (id === null || id === undefined) return null;

  let ended = false;
  const endListeners = [];
  function finish() {
    if (ended) return;
    ended = true;
    for (const listener of endListeners) listener();
  }
  entry.howl.once("end", finish, id);
  entry.howl.once("stop", finish, id);

  return {
    update(pan, nextVolume, cutoffHz) {
      if (ended) return;
      entry.howl.stereo(pan, id);
      entry.howl.volume(clampVolume(nextVolume), id);
      if (cutoffHz !== undefined) ensureLowpass(entry, clamp(cutoffHz, MIN_FILTER_FREQ_HZ, MAX_FILTER_FREQ_HZ));
    },
    // Fondu de VOLUME de cette instance vers `target`, depuis sa valeur
    // actuelle (Howler.fade par id) — miroir de createPositionedSound/
    // fadeVolume, pour le croisement d'occlusion recto/verso (voir
    // view/audio/face-crossfade.js/crossfadeFaceSwap). No-op une fois terminé.
    fadeVolume(target, durationMs) {
      if (ended) return;
      entry.howl.fade(entry.howl.volume(id), clampVolume(target), durationMs, id);
    },
    // Rampe du passe-bas de l'entrée vers `targetHz` (AudioParam natif) —
    // miroir de createPositionedSound/rampCutoff, même remarque : le
    // filtre est partagé par cacheKey. Sans filtre encore posé, no-op.
    rampCutoff(targetHz, durationMs) {
      if (ended || !entry.lowpass || !Howler.ctx) return;
      const now = Howler.ctx.currentTime;
      const target = clamp(targetHz, MIN_FILTER_FREQ_HZ, MAX_FILTER_FREQ_HZ);
      entry.lowpass.frequency.cancelScheduledValues(now);
      entry.lowpass.frequency.setValueAtTime(entry.lowpass.frequency.value, now);
      entry.lowpass.frequency.linearRampToValueAtTime(target, now + durationMs / 1000);
    },
    onEnd(listener) {
      if (ended) listener();
      else endListeners.push(listener);
    },
    isPlaying() {
      return !ended;
    },
    // Arrête CETTE instance, après un fondu de `fadeMs` (0 = net). L'arrêt
    // déclenche l'événement "stop", donc les écouteurs de fin (onEnd).
    stop(fadeMs = 0) {
      if (ended) return;
      if (fadeMs > 0) {
        entry.howl.fade(entry.howl.volume(id), 0, fadeMs, id);
        setTimeout(() => entry.howl.stop(id), fadeMs);
      } else {
        entry.howl.stop(id);
      }
    },
  };
}

// Taux de lecture tiré uniformément dans [1-pitchVariation, 1+pitchVariation]
// — 1 (aucune variation) si pitchVariation est 0 ou absent, jamais d'appel à
// Math.random() inutile dans ce cas. Utilitaire GÉNÉRIQUE (aucune
// connaissance du jeu) : SEUL point de calcul de cette variation, partagé
// par tout appelant qui en a besoin (voir view/audio/city-scene.js pour les
// rôles positionnés — beacon/vocal/mouvement —, playDescribedOneShot
// ci-dessous pour un one-shot décrit).
export function randomRate(pitchVariation) {
  if (!pitchVariation) return 1;
  return 1 + (Math.random() * 2 - 1) * pitchVariation;
}

// Joue un one-shot décrit par le DESCRIPTEUR DE SON PARTAGÉ — { path, gain,
// pitchVariation, reverbSend }, les sous-champs COMMUNS aux rôles de son
// positionnés (beacon/vocal, voir view/audio/city-scene.js) réduits à un son
// PONCTUEL et NON positionné (aucun pan, aucun filtre de distance) : sert de
// primitive de lecture pour un effet "playSound" (voir view/interaction.js,
// core/scripting.md/"Effets"). `gain` (défaut 1) multiplie `volumeFactor`
// (le facteur de préférence de l'appelant, ex. interfaceVolume) — même
// composition que playPositionedOneShot (view/audio/city-scene.js) pour le
// volume. `reverbSend` n'a d'effet QUE si l'appelant fournit aussi
// `reverbBusInput` (comme playOneShot ci-dessus) : sans bus de réverb
// accessible (cas courant d'un son d'UI/interaction), silencieusement
// ignoré, jamais une erreur.
export function playDescribedOneShot(path, { gain = 1, pitchVariation = 0, reverbSend, reverbBusInput, volumeFactor = 1 } = {}) {
  playOneShot(path, {
    volume: gain * volumeFactor,
    rate: randomRate(pitchVariation),
    reverbSend,
    reverbBusInput,
  });
}
