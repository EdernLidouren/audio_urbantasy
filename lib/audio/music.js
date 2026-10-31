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
// savoir COMMENT ce canal enchaîne ses morceaux : un appelant générique
// (ex. un slider "Volume de la musique") règle la musique comme n'importe
// quel autre canal.
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

// Amorce le buffering d'un chemin de musique sans le jouer — ex. au
// préchargement d'une scène, tous les morceaux qu'elle peut jouer (pools
// jour ET nuit entiers, pas seulement la phase courante : une bascule ne
// doit jamais tomber sur un membre jamais amorcé).
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
// Dernier fondu de sortie qui a pris en charge chaque flux (voir
// fadeOutMusic) : deux fondus qui se chevauchent (ex. changement de scène
// puis retour au menu aussitôt) gardent chacun leur arrêt différé, et un
// flux n'est arrêté que par le DERNIER fondu qui l'a emporté.
const musicFadeOutOwner = new WeakMap();

function clearMusicBreather() {
  if (musicBreatherTimer) {
    clearTimeout(musicBreatherTimer);
    musicBreatherTimer = null;
  }
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
  // .stop() AVANT tout — musicHowlCache est PAR CHEMIN (voir plus haut) : ce
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

// Démarre une séquence musicale FRAÎCHE — ex. à l'entrée dans une scène :
// joue directement, SANS fondu d'entrée, puis
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
// ce fondu-ci n'ait fini d'animer. Deux pièges, MÊME cause :
//   - un `.fade()` ultérieur sur ce même Howl (ex. un second fondu qui le
//     recapture) REMPLACE l'animation interne de Howler SANS jamais émettre
//     `"fade"` pour la première — un `.stop()` accroché à cet évènement ne
//     se produirait JAMAIS, et la musique "suivante" (en fait la même voix
//     réutilisée) continuerait de jouer sans coupure ni silence.
//   - une reprise via `playMusicTrack` sur ce MÊME Howl pour un morceau
//     qu'on croit distinct : un simple `howl.volume()` n'annule PAS
//     l'animation de fondu Howler en cours, qui continue de tirer le volume
//     vers 0 en arrière-plan par-dessus — on entendrait la musique sortante
//     rejouer quelques secondes puis s'éteindre, alors que c'est déjà la
//     voix du morceau suivant. D'où, côté `playMusicTrack`, `.stop()` AVANT
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
// stoppée) ; reprise puis emportée par un fondu PLUS RÉCENT -> c'est lui qui
// l'arrêtera, à la fin de SON fondu (voir musicFadeOutOwner) ; sinon ->
// arrêt normal.
export function fadeOutMusic(fadeMs) {
  musicGeneration++;
  clearMusicBreather();

  const fadeOut = {};
  const streams = channelStreams("music");
  const outgoingStreams = streams.splice(0, streams.length);
  for (const outgoing of outgoingStreams) {
    musicFadeOutOwner.set(outgoing, fadeOut);
    outgoing.fade(outgoing.volume(), 0, fadeMs);
  }

  setTimeout(() => {
    const activeStreams = channelStreams("music");
    for (const outgoing of outgoingStreams) {
      if (activeStreams.includes(outgoing)) continue;
      if (musicFadeOutOwner.get(outgoing) !== fadeOut) continue;
      musicFadeOutOwner.delete(outgoing);
      outgoing.stop();
      // PAS de outgoing.unload() : voir musicHowlCache — le tampon reste
      // disponible pour une reprise future.
    }
  }, fadeMs);
}

// Bascule vers une AUTRE séquence (ex. changement de phase jour/nuit) :
// fondu du morceau courant (fadeOutMusic)
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

// --- Couches persistantes MUSIQUE/AMBIANCE (couche de BASE vs couche
// D'ÉTAT, continuité par IDENTITÉ) ---
//
// PRINCIPE : une piste ne s'arrête que si elle doit VRAIMENT changer,
// jamais pour "relancer la même chose". Deux couches INDÉPENDANTES par
// canal (music/ambience), COMPOSÉES par priorité :
//   - "base" : le fond, ce que l'appelant joue d'ordinaire (ex. la
//     musique et l'ambiance d'un niveau) — redéclarée à chaque fois que ce
//     fond change.
//   - "override" (PRIORITAIRE) : liée à un état qui transcende ce fond
//     (ex. un mode de jeu spécial) — mécanisme générique, jamais une
//     exception en dur, pour que toute musique/ambiance d'événement global
//     le réutilise tel quel.
// "override" prime sur "base" quand elle est active (identity non null) ;
// sinon "base" pilote le canal. Persistant au niveau MODULE — survit à
// la destruction/recréation d'une scène de l'appelant : c'est CE qui
// permet à une couche override de continuer SANS COUPURE pendant que la
// base change en dessous.
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
  base: { identity: null, params: null },
  override: { identity: null, params: null },
};
let musicPlayingIdentity = null;

function winningMusicLayer() {
  return musicLayers.override.identity !== null ? musicLayers.override : musicLayers.base;
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

// Déclare ce que la couche `layer` ("base" | "override") veut jouer —
// `identity`/`params` : voir header (params = { pickPath, loop,
// breatherRange }, ignoré si identity est null). Recalcule et applique
// IMMÉDIATEMENT la conséquence sur le canal (voir syncMusicChannel) :
// chaque appelant ne fait que déclarer SON INTENTION, jamais lui-même s'il
// faut fondre ou laisser filer — ?? null normalise un identity absent
// (undefined) en null, jamais une distinction fantôme entre les deux.
export function setMusicLayer(layer, identity, params, fadeMs) {
  musicLayers[layer] = { identity: identity ?? null, params };
  syncMusicChannel(fadeMs);
}

// Vide les DEUX couches et arrête le canal si besoin (voir
// syncMusicChannel, identity null -> fadeOutMusic) — pour un silence VOULU
// (sortie réelle de partie, transition qui se joue dans le silence avant que
// la scène suivante ne redéclare ses couches), JAMAIS pour un simple
// changement de scène (qui ne doit jamais couper une couche qui continue
// légitimement).
export function clearMusicLayers(fadeMs) {
  musicLayers.base = { identity: null, params: null };
  musicLayers.override = { identity: null, params: null };
  syncMusicChannel(fadeMs);
}
