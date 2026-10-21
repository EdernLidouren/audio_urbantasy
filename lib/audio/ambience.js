// AMBIANCE : couches (état / scène / météo) synchronisées par emplacement,
// avec fondus croisés. Principe des couches : voir ./music.js.

import { channelPolicy, channelStreams, channelVolume } from "./channels.js";

// --- Ambiance : DIFFING PAR COUCHE (état / scène / météo) ---
//
// L'ambiance porte TROIS couches déclarées (état, scène, météo — voir
// ambienceLayers/weatherAmbienceLayer plus bas), dont une ADDITIVE (météo,
// superposée à la couche gagnante état/scène, jamais à sa place). Un ancien
// modèle comparait un SEUL blob d'identité au niveau du CANAL ENTIER : dès
// qu'UNE SEULE couche changeait, tout le canal était refondu — y compris
// les couches qui n'avaient pourtant pas bougé (bug rapporté en jeu : un
// changement de météo accrochait l'ambiance de SCÈNE, pourtant inchangée).
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
// EXCLUSIVES pour la LECTURE (l'état prime) même si chacune
// garde SA PROPRE déclaration en continu — la scène peut rester déclarée
// "trafic" tout du long, son EFFECTIF devient silence dès que l'état prend
// la main, puis redevient "trafic" (sans re-fondu, puisque son IDENTITY
// PROPRE n'a pas varié) quand l'état la relâche. La météo, elle, n'est
// jamais éclipsée par l'état/la scène — seulement BORNÉE par la place qui
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
// eu lieu, même politique que l'entrée en scène de la musique.
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
// trois peuvent changer ENSEMBLE à un même montage (nouvelle scène,
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
// silencieux comme "clear"). Persistante au niveau MODULE comme
// ambienceLayers : survit à la destruction/recréation d'une scène, c'est CE
// qui permet à une ambiance météo de continuer SANS COUPURE à travers un
// changement de scène tant que la météo elle-même ne change pas.
export function setWeatherAmbienceLayer(identity, resolvedPaths, fadeMs) {
  weatherAmbienceLayer.identity = identity ?? null;
  weatherAmbienceLayer.resolvedPaths = resolvedPaths;
  syncAmbienceLayers(fadeMs);
}

// Voir clearMusicLayers — même principe, même appelant unique. Vide AUSSI
// la couche météo (sortie RÉELLE de partie, jamais un simple changement de
// scène) : les trois couches d'ambiance repartent de zéro.
export function clearAmbienceLayers(fadeMs) {
  ambienceLayers.location = { identity: null, resolvedPaths: null };
  ambienceLayers.state = { identity: null, resolvedPaths: null };
  weatherAmbienceLayer.identity = null;
  weatherAmbienceLayer.resolvedPaths = null;
  syncAmbienceLayers(fadeMs);
}
