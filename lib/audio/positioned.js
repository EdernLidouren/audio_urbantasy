// SON POSITIONNÉ : une voix en boucle par entité (pan, volume, passe-bas,
// passe-haut, envoi de réverb), pilotée au tick par l'appelant.

import { ensureEntityLayerGain, webAudioNode } from "./context.js";
import { MAX_FILTER_FREQ_HZ, MIN_FILTER_FREQ_HZ, clampVolume } from "./levels.js";
import { clamp } from "../math.js";

// Cache des Howl de voix positionnées CONTINUES (balises), PAR CLÉ fournie
// par l'appelant (cacheKey ci-dessous — ce module ne connaît aucune
// entité, jamais de clé devinée ici) — persiste AU-DELÀ d'une scène,
// symétrique à oneShotCache (./oneshots.js) pour les sons ponctuels : une
// balise déjà entendue une fois (monde déjà visité) ne doit pas se
// redécoder à chaque aller-retour, cohérent avec un jeu qui garde ses
// scènes visitées en mémoire. stop() (plus bas) n'unload JAMAIS le Howl :
// il arrête seulement la lecture, le buffer décodé reste en cache
// pour une reprise future. Limite connue, acceptée : ce cache grandit avec
// le nombre d'entités à balise continue jamais rencontrées, jamais purgé —
// négligeable à l'échelle actuelle (une poignée de mondes/entités), pas une
// préoccupation pour un projet de cette taille (voir aussi la limite déjà
// documentée pour le bus de réverb, même esprit).
const positionedSoundCache = new Map();

// Chaque entité a besoin de sa PROPRE voix (panning indépendant) : cacheKey
// (fourni par l'appelant, typiquement un id d'entité stable d'une visite à
// l'autre) identifie CETTE voix précise, jamais le chemin seul (deux
// entités différentes pourraient partager le même fichier de balise sans
// vouloir partager leur pan/volume). Le cache est indexé par cacheKey ET
// chemin : un même identifiant peut désigner deux entités différentes
// (identifiants d'éphémères qui repartent de 0 dans chaque monde, ou un id
// commun à deux scènes), et une voix ne doit jamais jouer le fichier d'une
// autre. Omis -> repli sur path (un Howl par chemin) : suffisant pour un
// appelant qui n'a pas cette distinction à faire. rate (optionnel, défaut
// 1) : taux de lecture, réappliqué à CHAQUE appel (y compris sur une voix
// réutilisée, si l'appelant en fournit une différente).
// startDelayMs (défaut 0, immédiat) :
// retarde l'appel RÉEL à howl.play(), jamais howl.volume()/.stereo() (fixés
// au tick par l'appelant, voir update() ci-dessous — sans effet audible
// tant qu'aucune voix n'est en train de jouer) — pour DÉSEMPILER l'attaque
// de plusieurs voix qui démarreraient sinon dans la même fenêtre (ex. les
// balises d'une scène qu'on monte d'un coup). L'attaque (t=0 de la boucle) doit tomber RÉELLEMENT au
// moment décalé — retarder seulement le VOLUME reviendrait à révéler la
// voix en cours de boucle, après que son attaque soit déjà passée
// (silencieusement), ce qui manquerait l'effet recherché. Primitive
// GÉNÉRIQUE : ce module ignore tout du POURQUOI (désempilement, ou toute
// autre raison qu'un futur appelant pourrait avoir) — startTimer, jamais un
// booléen, pour qu'ANNULER via stop() (voir plus bas) empêche RÉELLEMENT le
// démarrage différé de survenir, pas seulement d'avoir un effet.
export function createPositionedSound(path, { rate = 1, cacheKey = path, startDelayMs = 0 } = {}) {
  const voiceKey = `${cacheKey}\n${path}`;
  let howl = positionedSoundCache.get(voiceKey);
  if (!howl) {
    howl = new Howl({ src: [path], loop: true, volume: 0, rate });
    positionedSoundCache.set(voiceKey, howl);
  }

  // `started` : vrai tant qu'on ATTEND que cette voix joue (posé par
  // startPlayback/resume, retiré par pause/stop) — distinct de
  // howl.playing() (voir isStuck() plus bas). Faux pendant un démarrage
  // DIFFÉRÉ pas encore survenu (staggerBeacon) : la voix est alors
  // légitimement silencieuse, pas "bloquée".
  let started = false;

  // Facteur de vitesse APPLIQUÉ par-dessus `rate` (voir setRateFactor) :
  // 1 = la vitesse de création. Retenu pour ne toucher à Howler que sur un
  // vrai changement, jamais à chaque tick d'un régime établi.
  let rateFactor = 1;

  // Voix déjà connue (monde déjà visité) : buffer déjà décodé, on relance
  // juste la lecture — jamais de nouveau Howl, jamais de redécodage.
  // volume(0) : même point de départ qu'une création fraîche — la voix
  // vient d'être arrêtée par la scène précédente, sans ce reset elle
  // repartirait au volume qu'elle avait à l'instant de cet arrêt, un court
  // instant avant que update() (premier tick) ne le recalcule.
  function startPlayback() {
    startTimer = null;
    started = true;
    rateFactor = 1;
    howl.rate(rate);
    howl.volume(0);
    howl.play();
  }

  let startTimer = startDelayMs > 0 ? setTimeout(startPlayback, startDelayMs) : null;
  if (!startTimer) startPlayback();
  // Démarrage différé suspendu par pause() avant d'avoir eu lieu : resume()
  // le lance (voir plus bas).
  let startPending = false;

  // Howler n'a pas de passe-bas natif : on insère nous-mêmes un
  // BiquadFilterNode dans la chaîne du son, entre son GainNode par-instance
  // (howl._sounds[0]._node, API bas niveau de Howler) et le gain de couche
  // ENTITÉS (voir "Gain de couche ENTITÉS", ./context.js — une balise continue
  // EST toujours une entité, jamais de l'UI, donc toujours soumise au fondu
  // de transition). La connexion d'origine _node -> masterGain (posée par
  // Howler) est remplacée une fois à la création du son et n'est JAMAIS retouchée
  // par le plugin stereo (qui ne reconnecte que l'ENTRÉE de _node, via un
  // panner) : on peut donc s'y insérer sans jamais perturber le pan, dans
  // n'importe quel ordre.
  //
  // Le nœud n'existe pas forcément tout de suite (chargement asynchrone) :
  // on retente à chaque appel de setCutoff, sans jamais planter si absent —
  // on se contente alors de ne pas filtrer.
  let filter = null; // passe-bas (distance, voir setCutoff)
  // Passe-haut OPTIONNEL, EN SÉRIE après le passe-bas ci-dessus (node ->
  // filter -> highpass -> gain de couche entités, voir ensureHighpass) —
  // ex. une entité volante qu'on veut entendre "en hauteur" : jamais créé
  // tant que setHighpass n'est pas appelé, donc AUCUN effet sur le chemin
  // d'une balise continue ordinaire.
  let highpass = null;
  // Envoi de réverb : un GainNode branché depuis la SORTIE de la chaîne
  // (highpass si présent, sinon le passe-bas) vers l'entrée du bus. Le
  // chemin sec reste inchangé, ceci n'ajoute qu'une dérivation.
  let sendGain = null;
  let pendingSend = null; // { busInput, level } tant que le filtre n'existe pas
  // Dernier envoi demandé : stop() démonte la chaîne de filtres, que le
  // prochain setCutoff reconstruit après resume() — l'envoi de réverb doit
  // suivre, sinon une balise arrêtée puis reprise (bascule de présence,
  // beacon conditionnel) revient sèche.
  let lastSend = null;

  function attachSend(busInput, level) {
    const source = highpass || filter;
    if (!busInput || !source) return;
    // Un seul envoi à la fois : une balise transmise à une scène
    // reconstruite (bascule recto/verso) est renvoyée vers le NOUVEAU bus,
    // l'ancien envoi est débranché plutôt que d'accumuler les deux.
    if (sendGain) sendGain.disconnect();
    sendGain = Howler.ctx.createGain();
    sendGain.gain.value = level;
    source.connect(sendGain);
    sendGain.connect(busInput);
  }

  function ensureFilter() {
    if (filter || !Howler.ctx) return filter;

    // Pas de nœud Web Audio (pas encore créé, ou Howl basculé en HTML5
    // après un échec de chargement, voir ./context.js/webAudioNode) : la
    // balise joue sans filtre plutôt que de planter.
    const node = webAudioNode(howl._sounds && howl._sounds[0]);
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

  // Tant que l'appelant n'appelle pas setHighpass, ce filtre reste `null` :
  // chemin STRICTEMENT inchangé pour toute balise continue ordinaire.
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
      howl.volume(clampVolume(volume));
    },
    // Fond le VOLUME de cette voix continue vers `target`, depuis sa valeur
    // ACTUELLE (howl.volume()) — ex. un fondu croisé entre deux espaces
    // sonores superposés. Howler.fade()
    // anime en interne, INDÉPENDAMMENT du tick de jeu (déjà vérifié : la
    // musique/l'ambiance continuent de fondre pendant un sas gelé, voir
    // ./ambience.js/crossfadeSlot) — pas besoin d'AudioParam natif ici,
    // contrairement au gain de couche entités (rampEntityLayerGain), qui,
    // lui, pilote un GainNode construit à la main hors du modèle Howler.
    fadeVolume(target, durationMs) {
      howl.fade(howl.volume(), clampVolume(target), durationMs);
    },
    // Vitesse de lecture RELATIVE à celle de création (`rate`, qui porte
    // déjà la variation de hauteur tirée par l'appelant) : 0.5 = moitié
    // plus lent ET une octave plus grave — Howler ne sépare pas hauteur et
    // tempo, comme une bande qu'on freine. Pilotée au tick par l'appelant
    // (ex. une montée en régime) ; la vitesse est mémorisée par Howler, une
    // voix arrêtée puis reprise repart à la dernière vitesse demandée.
    setRateFactor(factor) {
      if (factor === rateFactor) return;
      rateFactor = factor;
      howl.rate(rate * factor);
    },
    setCutoff(freqHz) {
      const f = ensureFilter();
      if (!f) return; // pas de nœud dispo pour l'instant : pas de filtrage
      f.frequency.value = clamp(freqHz, MIN_FILTER_FREQ_HZ, MAX_FILTER_FREQ_HZ);
    },
    // Fond le CUTOFF du passe-bas vers `targetHz`, depuis sa valeur
    // ACTUELLE — AudioParam natif (comme rampEntityLayerGain, ./context.js) :
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
      lastSend = { busInput, level };
      // Même dépendance que setCutoff : sans filtre, on retente plus tard
      // (ensureFilter est aussi rappelé par setCutoff à chaque tick).
      if (!ensureFilter()) {
        pendingSend = { busInput, level };
        return;
      }
      attachSend(busInput, level);
    },
    // isStuck() : filet de sécurité anti-blocage, que l'appelant interroge
    // à chaque tick pour relancer une voix bloquée. Howler v2
    // boucle nativement une balise continue (bufferSource.loop natif,
    // jamais un redémarrage JS), mais tient EN PARALLÈLE une chaîne de
    // setTimeout interne qui se réarme à chaque tour pour sa propre
    // comptabilité (_seek/_playStart, voir vendor/howler.min.js/_ended). Un
    // seul maillon manqué (throttling navigateur, entre autres — cause
    // exacte non isolée avec certitude malgré instrumentation, comportement
    // absent en environnement de test mais signalé intermittent et
    // dépendant du navigateur) casse cette chaîne pour de bon, sans
    // exception : la boucle native peut alors ne jamais se rebrancher
    // proprement. `started` (voir plus haut) distingue ce blocage d'un
    // silence VOULU (démarrage différé pas encore survenu, pause/stop
    // explicites) : seul `started && !howl.playing()` déclenche une reprise.
    isStuck() {
      return started && !howl.playing();
    },
    // pause()/resume() : pause SÉLECTIVE de CETTE voix (ex. pendant un menu
    // ouvert par-dessus le jeu), jamais du contexte
    // audio global. howl.play() sans id : Howler retrouve tout seul l'unique
    // instance en pause de ce Howl et la reprend là où elle en était (pas de
    // nouvelle lecture depuis le début) — valable ici puisqu'un seul play()
    // a jamais lieu par Howl positionné (voir plus haut).
    // Pause pendant un démarrage DIFFÉRÉ pas encore survenu : le démarrage
    // est suspendu (sinon la voix partirait sous le menu à l'échéance), et
    // c'est resume() qui le lance.
    pause() {
      started = false;
      if (startTimer) {
        clearTimeout(startTimer);
        startTimer = null;
        startPending = true;
        return;
      }
      howl.pause();
    },
    resume() {
      if (startPending) {
        startPending = false;
        startPlayback();
        return;
      }
      // Démarrage différé encore à venir : il aura lieu de lui-même, un
      // play() ici lancerait une seconde instance.
      if (startTimer) return;
      started = true;
      howl.play();
    },
    stop() {
      started = false;
      startPending = false;
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
      pendingSend = lastSend;
      howl.stop();
      // PAS de howl.unload() : le buffer décodé reste en cache (voir
      // positionedSoundCache ci-dessus) pour une reprise future — seule LA
      // VOIX EN COURS est arrêtée ici, jamais le cache lui-même. C'est le
      // sens de "aucun Howl résiduel après transition" ailleurs dans ce
      // module : des voix arrêtées, pas un cache vidé.
    },
  };
}
