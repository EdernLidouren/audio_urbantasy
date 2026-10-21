// MUSIQUE : séquence (enchaînement avec respiration) ou boucle, fondu de
// sortie universel, et COUCHES persistantes (scène / état) — le principe des
// couches, commun à la musique et à l'ambiance, est décrit ici.

import { channelPolicy, channelStreams, channelVolume } from "./channels.js";

// --- Musique : lecture SÉQUENCÉE (défaut) ou boucle continue (option) ---
//
// Contrairement à l'ambiance (plusieurs flux possibles, toujours en boucle,
// diffing par slot — voir "Ambiance : DIFFING PAR COUCHE", ./ambience.js), la
// musique a un cycle de vie propre (enchaînement avec respiration, fondu de
// sortie universel) qui a besoin de SA PROPRE mécanique — mais PARTAGE le
// tableau de suivi channelStreams ("music", voir GLOBAL_CHANNELS) avec
// ./channels.js/setGlobalVolume : le réglage de volume générique d'un canal n'a pas à
// savoir COMMENT ce canal enchaîne ses morceaux, et un appelant existant
// (ex. le slider "Volume de la musique", voir view/menus/audio-menu.js)
// continue de fonctionner sans changement.
//
// Cache des Howl de musique PAR CHEMIN — persiste au-delà d'une scène, comme
// positionedSoundCache/oneShotCache (./positioned.js, ./oneshots.js) : un membre de pool déjà joué
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
    // "music") : même source que channelPolicy("ambience").html5 (./channels.js),
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
// phase puis changement de scène aussitôt), seule la dernière génération
// démarrée peut encore agir.
let musicGeneration = 0;
let musicBreatherTimer = null;
// Minuteurs d'arrêt DIFFÉRÉ après fondu (voir fadeOutMusic) — un par flux
// SORTANT en cours de fondu, jamais un seul partagé : deux fondus qui se
// chevauchent (ex. bascule de phase suivie de près d'un changement de
// scène) ne doivent jamais se marcher dessus.
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

  if (loop) return; // boucle continue : pas d'enchaînement.

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
// l'entrée dans une scène : joue directement, SANS fondu d'entrée, puis
// enchaîne avec respiration si
// `loop` est faux. Invalide toute séquence précédente encore en attente
// (respiration ou `once("end")`) via le compteur de génération, sans jamais
// la manipuler directement — elle se reconnaît périmée d'elle-même.
export function startMusicSequence({ pickPath, loop = false, breatherRange }) {
  musicGeneration++;
  clearMusicBreather();
  playMusicTrack(pickPath, loop, breatherRange, musicGeneration);
}

// Arrêt UNIVERSEL de la musique — TOUT arrêt (bascule de phase, changement
// de scène, tout arrêt futur) passe par ici, jamais une coupure sèche. Fond
// le(s) morceau(x) EN COURS sur SA PROPRE référence, retirée IMMÉDIATEMENT
// de `streams` — donc invisible à un flux qui démarrerait dans la foulée sur
// ce même canal (ex. la scène suivante, voir startMusicSequence) : le fondu
// se termine en tâche de fond, entièrement indépendant de ce qui joue
// ensuite, jamais de fondus qui se battent ni de voix orpheline. Invalide
// aussi toute respiration/enchaînement en attente (compteur de génération) :
// un enchaînement naturel ne doit jamais ressusciter après cet arrêt.
// L'arrêt DIFFÉRÉ (après le fondu visuel/audible) est minuté PAR NOUS-MÊMES
// (setTimeout), JAMAIS via l'évènement `"fade"` de Howler, parce que
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
// près d'un changement de scène) s'auto-résout comme partout ci-dessus, la
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

// --- Couches persistantes MUSIQUE/AMBIANCE (musique/ambiance DE SCÈNE vs
// D'ÉTAT, continuité par IDENTITÉ) ---
//
// PRINCIPE : une piste ne s'arrête que si elle doit VRAIMENT changer,
// jamais pour "relancer la même chose". Deux couches INDÉPENDANTES par
// canal (music/ambience), COMPOSÉES par priorité :
//   - "state" (D'ÉTAT) : liée à un état de PARTIE qui transcende les
//     scènes — la perception surnaturelle (voir view/audio/city-scene.js)
//     est la première et SEULE cliente aujourd'hui, mais le mécanisme est
//     générique (pas une exception surnaturelle en dur) pour qu'une future
//     musique/ambiance d'événement global le réutilise tel quel.
//   - "location" (DE SCÈNE) : liée à la scène courante (musique de phase,
//     ambiance de la scène) — change à chaque transition/bascule de phase.
// "state" prime sur "location" quand elle est active (identity non null) ;
// sinon "location" pilote le canal. Persistant au niveau MODULE — survit à
// la destruction/recréation d'une scène (contrairement à l'état de
// createCityAudioScene) : c'est CE qui permet à une musique/ambiance
// D'ÉTAT de continuer SANS COUPURE à travers un changement de scène.
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
// démarrage DIRECT (comme à l'entrée en scène) si rien ne
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
// RÉELLE de partie (retour au menu principal), JAMAIS pour un changement
// de scène (qui ne doit jamais couper une couche qui continue légitimement
// — voir view/audio/layers.js/stopPersistentAudioLayers, seul
// appelant).
export function clearMusicLayers(fadeMs) {
  musicLayers.location = { identity: null, params: null };
  musicLayers.state = { identity: null, params: null };
  syncMusicChannel(fadeMs);
}
