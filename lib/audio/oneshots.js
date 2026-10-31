// SONS PONCTUELS : un Howl par chemin, mis en cache (chargé une fois, rejoué
// à volonté, déchargé quand les lieux où il a servi sont assez loin
// derrière, voir ./retention.js), et une chaîne PAR LECTURE : chaque instance jouée reçoit ses
// propres filtres (passe-bas, passe-haut), sa destination (couche entités ou
// sortie principale), son envoi de réverb, son volume, son pan et sa hauteur,
// d'après les options de CET appel. Deux lectures du même fichier, même
// simultanées, ne partagent donc rien : ni routage, ni filtre, ni bus de
// réverb (celui de la scène courante, passé à chaque appel), ni volume.
// Aussi : sons ponctuels SUIVIS (pilotables pendant la lecture), variation
// de hauteur.

import { ensureEntityLayerGain, webAudioNode } from "./context.js";
import { currentAudioScope, registerAudioReleaser } from "./retention.js";
import { createFilter, rampParam } from "./nodes.js";
import { MAX_FILTER_FREQ_HZ, MIN_FILTER_FREQ_HZ, clampVolume } from "./levels.js";
import { clamp } from "../math.js";

// Un Howl par chemin : play() sur un Howl déjà chargé démarre une instance
// de plus, sans interrompre les précédentes. new Howl() lance le décodage
// aussitôt (preload, le défaut de Howler) : un chemin préchargé
// (preloadOneShot) est prêt à sa première lecture ; un chemin joué "à froid"
// attend la fin de son décodage — jamais perdu, mais en retard, ce qui
// s'entend comme un pas qui "saute".
// Chaque entrée note aussi la dernière portée où le son a servi, ou
// `permanent` s'il ne doit jamais être purgé (voir ./retention.js).
const oneShotCache = new Map(); // path -> { howl, scope, permanent }

// Un Howl BASCULÉ en HTML5 (téléchargement échoué, voir
// ./context.js/webAudioNode) est remplacé à la lecture suivante : le
// fichier est retenté en Web Audio plutôt que de rester sec pour toute la
// session. Les one-shots ne demandent jamais html5, `_html5` ne peut donc
// venir que de ce repli de Howler. L'ancien est déchargé : sorti du cache,
// aucune purge ne l'atteindrait plus (une lecture encore en cours s'arrête,
// et un son suivi qui l'attendait reçoit sa fin, voir playTrackedOneShot).
function ensureOneShot(path, { permanent = false } = {}) {
  let entry = oneShotCache.get(path);
  if (entry && entry.howl._html5) {
    console.warn(`audio: "${path}" rejoué en HTML5 après un échec de chargement, nouvel essai en Web Audio.`);
    entry.howl.unload();
    entry.howl = new Howl({ src: [path] });
  }
  if (!entry) {
    entry = { howl: new Howl({ src: [path] }), scope: null, permanent: false };
    oneShotCache.set(path, entry);
  }
  entry.scope = currentAudioScope();
  if (permanent) entry.permanent = true;
  return entry.howl;
}

// Purge (voir ./retention.js) : un son en cours de lecture est coupé net,
// mais un son d'une portée périmée ne joue plus — le lieu qui l'a lancé est
// quitté depuis au moins deux changements.
registerAudioReleaser((isStaleScope) => {
  for (const [path, entry] of oneShotCache) {
    if (entry.permanent || !isStaleScope(entry.scope)) continue;
    entry.howl.unload();
    oneShotCache.delete(path);
  }
});

// Nœuds posés par CE module derrière une instance Howler. Howler recycle ses
// instances terminées pour les lectures suivantes : la chaîne de la lecture
// précédente est défaite avant d'en poser une neuve (voir routeInstance).
const instanceChains = new WeakMap();

function releaseChain(chain) {
  if (!chain) return;
  for (const node of [chain.lowpass, chain.highpass, chain.sendGain]) {
    if (node) node.disconnect();
  }
}

// Howler crée un nœud par instance (`_node`, un GainNode qui porte son
// volume) et le branche directement sur Howler.masterGain. Chaîne posée à
// la place :
//   node -> [passe-bas] -> [passe-haut] -> destination
//                                       \-> envoi -> bus de réverb
// Ordre fixe, passe-bas d'abord : les deux restent composables (ex. une
// source en hauteur, passe-haut, entendue étouffée, passe-bas). L'envoi
// part de la SORTIE des filtres, en parallèle du chemin sec, jamais à sa
// place. Destination : la couche entités (soumise au fondu d'une
// transition) pour un son du paysage sonore (`entityLayer`), sinon la
// sortie principale — son d'interface, ou son qui doit survivre au fondu.
function routeInstance(howl, id, { reverbSend, reverbBusInput, highpassHz, lowpassHz, entityLayer }) {
  if (!Howler.ctx) return null;
  const sound = howl._soundById(id);
  const node = webAudioNode(sound);
  if (!node) return null;

  releaseChain(instanceChains.get(sound));
  node.disconnect();

  const chain = { lowpass: null, highpass: null, sendGain: null };
  let output = node;
  if (lowpassHz !== undefined) {
    chain.lowpass = createFilter("lowpass", lowpassHz);
    output.connect(chain.lowpass);
    output = chain.lowpass;
  }
  if (highpassHz !== undefined) {
    chain.highpass = createFilter("highpass", highpassHz);
    output.connect(chain.highpass);
    output = chain.highpass;
  }
  output.connect(entityLayer ? ensureEntityLayerGain() : Howler.masterGain);

  if (reverbBusInput && reverbSend) {
    chain.sendGain = Howler.ctx.createGain();
    chain.sendGain.gain.value = reverbSend;
    output.connect(chain.sendGain);
    chain.sendGain.connect(reverbBusInput);
  }

  instanceChains.set(sound, chain);
  return chain;
}

// Démarre une lecture, puis lui pose sa chaîne, son volume, son pan et sa
// hauteur PAR IDENTIFIANT : sans identifiant, Howler appliquerait ces
// réglages à TOUTES les lectures en cours du fichier (et couperait leurs
// fondus). Tout est posé dans la même tâche que play() : le premier
// échantillon sort déjà avec ce rendu. Un son pas encore décodé est mis en
// file par Howler avec ces réglages. `null` si la lecture n'a pas démarré.
// Pan : Howler crée le panoramique d'une instance à son premier pan (et la
// relance en interne pour l'y brancher) ; un son centré qui n'en a pas
// encore n'en a pas besoin.
function startInstance(path, { volume = 1, stereo = 0, rate = 1, permanent = false, ...routing }) {
  const howl = ensureOneShot(path, { permanent });
  const id = howl.play();
  if (id === null || id === undefined) return null;
  const chain = routeInstance(howl, id, routing);
  howl.volume(clampVolume(volume), id);
  const sound = howl._soundById(id);
  if (stereo !== 0 || (sound && sound._panner)) howl.stereo(stereo, id);
  howl.rate(rate, id);
  return { howl, id, chain };
}

// Amorce le chargement d'UN chemin sans le jouer (préchargement d'une
// scène). Idempotent : un chemin déjà en cache n'est jamais rechargé.
export function preloadOneShot(path) {
  ensureOneShot(path);
}

// Joue un son ponctuel. Options, toutes facultatives :
//   - volume, stereo, rate (défauts 1, 0, 1) ;
//   - lowpassHz, highpassHz : filtres de cette lecture (absents -> aucun) ;
//   - reverbSend + reverbBusInput : envoi vers un bus de réverb (sans l'un
//     des deux : chemin sec seulement) ;
//   - entityLayer (défaut false) : le son appartient au PAYSAGE SONORE de
//     la scène (pas, collision, vocal...) et passe par la couche entités,
//     soumise au fondu d'une transition. Un son d'interface l'omet ;
//   - permanent (défaut false) : le son reste en cache pour toute la
//     session, jamais purgé au changement de lieu (voir ./retention.js) —
//     pour les sons entendus partout, comme ceux de l'interface.
export function playOneShot(path, options = {}) {
  startInstance(path, options);
}

// Son ponctuel SUIVI : comme playOneShot, mais renvoie une POIGNÉE sur CETTE
// lecture pour la re-spatialiser pendant qu'elle joue (ex. un son ancré sur
// une entité qui bouge) et savoir quand elle se
// termine. Le passe-bas piloté est celui de cette lecture seule. `null` si
// la lecture n'a pas pu démarrer. highpassHz (ex. source en hauteur) : posé une
// fois au départ, jamais piloté — il ne dépend pas de la position.
export function playTrackedOneShot(path, options = {}) {
  const started = startInstance(path, options);
  if (!started) return null;
  const { howl, id, chain } = started;

  let ended = false;
  const endListeners = [];
  function finish() {
    if (ended) return;
    ended = true;
    // Les écouteurs qui n'ont pas servi (une fin naturelle laisse celui de
    // l'arrêt, etc.) : sinon ils s'accumuleraient sur un Howl rejoué toute
    // la session.
    howl.off("end", finish, id);
    howl.off("stop", finish, id);
    howl.off("playerror", finish, id);
    howl.off("loaderror", finish);
    howl.off("load", checkStillQueued);
    for (const listener of endListeners) listener();
  }
  howl.once("end", finish, id);
  howl.once("stop", finish, id);
  // Une lecture qui ne JOUERA jamais finit aussi, sinon un appelant qui
  // attend sa fin attendrait pour rien (une transition gelée jusqu'à la fin
  // d'un son, une source occupée tant que son son joue) :
  //   - lecture refusée par le navigateur (playerror, pour CETTE lecture) ;
  //   - fichier introuvable ou indécodable (loaderror, pour tout le Howl) ;
  //   - repli HTML5 après une erreur réseau (voir ensureOneShot) : Howler
  //     recharge le fichier en vidant ses lectures, celle-ci n'existe plus
  //     à la fin du rechargement et ne sera jamais jouée.
  // Les deux écouteurs du Howl entier ne servent que tant qu'il charge.
  function checkStillQueued() {
    if (!howl._soundById(id)) finish();
  }
  howl.once("playerror", finish, id);
  if (howl.state() !== "loaded") {
    howl.once("loaderror", finish);
    howl.once("load", checkStillQueued);
  }

  return {
    update(pan, nextVolume, cutoffHz) {
      if (ended) return;
      howl.stereo(pan, id);
      howl.volume(clampVolume(nextVolume), id);
      if (cutoffHz !== undefined && chain && chain.lowpass) {
        chain.lowpass.frequency.value = clamp(cutoffHz, MIN_FILTER_FREQ_HZ, MAX_FILTER_FREQ_HZ);
      }
    },
    // Fondu de VOLUME de cette lecture vers `target`, depuis sa valeur
    // actuelle — miroir de createPositionedSound/fadeVolume (ex. un fondu
    // croisé entre deux espaces sonores superposés). No-op une
    // fois terminée.
    fadeVolume(target, durationMs) {
      if (ended) return;
      howl.fade(howl.volume(id), clampVolume(target), durationMs, id);
    },
    // Rampe du passe-bas de cette lecture vers `targetHz` (AudioParam natif)
    // — miroir de createPositionedSound/rampCutoff. Sans passe-bas, no-op.
    rampCutoff(targetHz, durationMs) {
      if (ended || !chain || !chain.lowpass) return;
      rampParam(chain.lowpass.frequency, clamp(targetHz, MIN_FILTER_FREQ_HZ, MAX_FILTER_FREQ_HZ), durationMs);
    },
    onEnd(listener) {
      if (ended) listener();
      else endListeners.push(listener);
    },
    // Arrête CETTE lecture, après un fondu de `fadeMs` (0 = net). L'arrêt
    // déclenche l'événement "stop", donc les écouteurs de fin (onEnd).
    stop(fadeMs = 0) {
      if (ended) return;
      if (fadeMs > 0) {
        howl.fade(howl.volume(id), 0, fadeMs, id);
        setTimeout(() => howl.stop(id), fadeMs);
      } else {
        howl.stop(id);
      }
    },
  };
}

// Taux de lecture tiré uniformément dans [1-pitchVariation, 1+pitchVariation]
// — 1 (aucune variation) si pitchVariation est 0 ou absent, sans tirage
// inutile. SEUL point de calcul de cette variation, partagé par tout
// appelant qui en a besoin.
export function randomRate(pitchVariation) {
  if (!pitchVariation) return 1;
  return 1 + (Math.random() * 2 - 1) * pitchVariation;
}

// Joue un son ponctuel décrit par un DESCRIPTEUR de son — { path, gain,
// pitchVariation, reverbSend }, réduit à un son NON positionné (aucun pan,
// aucun filtre de distance) : ex. un son "méta" que le jeu déclenche sans
// source dans l'espace. `gain` multiplie `volumeFactor` (le facteur
// de préférence de l'appelant). `reverbSend` sans `reverbBusInput` (cas
// courant d'un son d'interface) : ignoré, jamais une erreur.
export function playDescribedOneShot(path, { gain = 1, pitchVariation = 0, reverbSend, reverbBusInput, volumeFactor = 1 } = {}) {
  playOneShot(path, {
    volume: gain * volumeFactor,
    rate: randomRate(pitchVariation),
    reverbSend,
    reverbBusInput,
  });
}
