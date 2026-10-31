// AMBIANCE : couches (base / prioritaire / surcouche) synchronisées par
// emplacement, avec fondus croisés. Principe des couches : voir ./music.js.

import { channelPolicy, channelStreams, channelVolume } from "./channels.js";

// --- Ambiance : DIFFING PAR COUCHE (base / override / overlay) ---
//
// L'ambiance porte TROIS couches déclarées (voir ambienceLayers/overlayLayer
// plus bas) : "base" (le fond), "override" (prime sur la base quand elle
// est active) et une surcouche ADDITIVE, "overlay" (superposée à la couche
// gagnante base/override, jamais à sa place).
//
// Chaque couche est comparée et fondue INDÉPENDAMMENT (voir
// slotPlaying/syncAmbienceLayers) — jamais une identité unique pour le
// CANAL ENTIER, qui refondrait tout dès qu'UNE couche change (un changement
// de surcouche accrocherait la base, pourtant inchangée). Une couche dont la source déclarée
// (identity — un pool/une clé, PAS le fichier exact tiré par resolveAsset)
// n'a PAS changé garde EXACTEMENT ses flux Howl en cours — aucun fondu,
// aucun nouveau tirage dans le pool, la MÊME instance continue. C'est la
// même continuité que pour la musique (voir syncMusicChannel),
// GÉNÉRALISÉE par slot au lieu d'un blob de canal entier.
//
// "Effectif" (base/override) : ces deux couches restent mutuellement
// EXCLUSIVES pour la LECTURE (override prime) même si chacune
// garde SA PROPRE déclaration en continu — la base peut rester déclarée
// "trafic" tout du long, son EFFECTIF devient silence dès que override prend
// la main, puis redevient "trafic" (sans re-fondu, puisque son IDENTITY
// PROPRE n'a pas varié) quand override la relâche. La surcouche, elle,
// n'est jamais éclipsée — seulement BORNÉE par la place qui reste sous la
// limite du canal (voir ./channels.js/setAmbienceLimit) une fois la couche
// gagnante posée. base et override ne sont jamais tronquées : à
// l'appelant de ne pas leur déclarer plus de flux que la limite.
const ambienceLayers = {
  base: { identity: null, resolvedPaths: null },
  override: { identity: null, resolvedPaths: null },
};
const overlayLayer = { identity: null, resolvedPaths: null };

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

// Ce qui joue RÉELLEMENT, PAR SLOT (override/base/overlay) — l'identity
// EFFECTIVE actuellement audible sur ce slot et les flux Howl qui la
// portent. SEULE source de vérité pour le diffing (jamais ambienceLayers/
// overlayLayer, qui portent l'INTENTION déclarée, pas ce qui joue
// réellement à cet instant).
const slotPlaying = {
  override: { identity: null, streams: [] },
  base: { identity: null, streams: [] },
  overlay: { identity: null, streams: [] },
};

// Dérive ce que CHAQUE slot DEVRAIT jouer maintenant, à partir des
// déclarations courantes — pure dérivation, ne touche à AUCUN Howl (voir
// syncAmbienceLayers, seul appelant, qui compare ensuite à slotPlaying).
function desiredAmbienceSlots() {
  const overrideWins = ambienceLayers.override.identity !== null;
  const winningPathsLength = overrideWins
    ? ambienceLayers.override.resolvedPaths.length
    : (ambienceLayers.base.resolvedPaths ?? []).length;

  const overrideSlot = overrideWins
    ? { identity: ambienceLayers.override.identity, resolvedPaths: ambienceLayers.override.resolvedPaths }
    : { identity: null, resolvedPaths: null };
  const baseSlot = overrideWins
    ? { identity: null, resolvedPaths: null }
    : { identity: ambienceLayers.base.identity, resolvedPaths: ambienceLayers.base.resolvedPaths };

  const { limit } = channelPolicy("ambience");
  const room = Math.max(0, limit - winningPathsLength);
  const overlayIdentity = overlayLayer.identity;
  let overlaySlot = { identity: null, resolvedPaths: null };
  if (overlayIdentity) {
    if (room === 0) {
      console.warn(`audio: canal "ambience" déjà à sa limite (${limit}), surcouche ignorée.`);
    } else {
      if (overlayIdentity.length > room) {
        console.warn(`audio: canal "ambience" déjà à sa limite (${limit}), ${overlayIdentity.length - room} flux de surcouche ignoré(s).`);
      }
      overlaySlot = { identity: overlayIdentity.slice(0, room), resolvedPaths: overlayLayer.resolvedPaths.slice(0, room) };
    }
  }

  return { override: overrideSlot, base: baseSlot, overlay: overlaySlot };
}

// Fond UN SLOT de son contenu ACTUEL vers `paths` (peut être vide -> fondu
// de sortie seul) — ENTIÈREMENT AUTONOME (son propre tableau `outgoing`,
// son propre minuteur) : rien ici n'annule le nettoyage d'un AUTRE appel —
// qu'il concerne ce même slot ou un autre. Un minuteur PARTAGÉ par tout le
// canal, annulé à chaque nouvel appel, laisserait un fondu à peine
// commencé, remplacé par le suivant, sans nettoyer ses propres flux : on
// l'entendrait comme une coupure nette. Chaque Howl est un objet FRAIS (jamais repioché
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
  for (const slot of ["override", "base", "overlay"]) {
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

// Déclare ce que la couche `layer` ("base" | "override") veut jouer — `identity` : tableau de
// clés (ou null) ; `resolvedPaths` : les MÊMES clés déjà résolues par
// l'appelant (voir lib/assets.js/resolveAsset — ce module n'en a aucune
// connaissance, voir header du fichier), ignoré si identity est null.
export function setAmbienceLayer(layer, identity, resolvedPaths, fadeMs) {
  ambienceLayers[layer] = { identity: identity ?? null, resolvedPaths };
  syncAmbienceLayers(fadeMs);
}

// Déclare les TROIS composantes du canal "ambience" EN UNE SEULE
// SYNCHRONISATION — typiquement au montage d'une scène de l'appelant, où
// les trois peuvent changer ENSEMBLE. Les déclarer une
// par une synchroniserait le canal TROIS fois de suite sur des cibles
// INTERMÉDIAIRES — inoffensif grâce au diffing PAR SLOT ci-dessus (une
// cible intermédiaire où une seule couche a changé ne touche justement QUE
// cette couche), mais cette fonction reste le point d'entrée du montage :
// un seul appel, une intention complète.
export function declareAmbienceLayers({ base, override, overlay }, fadeMs) {
  ambienceLayers.override = { identity: override.identity ?? null, resolvedPaths: override.resolvedPaths };
  ambienceLayers.base = { identity: base.identity ?? null, resolvedPaths: base.resolvedPaths };
  overlayLayer.identity = overlay.identity ?? null;
  overlayLayer.resolvedPaths = overlay.resolvedPaths;
  syncAmbienceLayers(fadeMs);
}

// Déclare ce que la SURCOUCHE veut jouer EN PLUS de la couche gagnante
// (voir desiredAmbienceSlots ci-dessus) — MÊME contrat que setAmbienceLayer
// (identity/resolvedPaths, null = "rien à superposer"). Persistante au
// niveau MODULE comme ambienceLayers : survit à la destruction/recréation
// d'une scène de l'appelant, c'est CE qui permet à une surcouche de
// continuer SANS COUPURE tant que sa propre identity ne change pas.
export function setAmbienceOverlay(identity, resolvedPaths, fadeMs) {
  overlayLayer.identity = identity ?? null;
  overlayLayer.resolvedPaths = resolvedPaths;
  syncAmbienceLayers(fadeMs);
}

// Voir clearMusicLayers — même principe, mêmes appelants. Vide AUSSI
// la surcouche (silence voulu, jamais un simple changement de scène) : les
// trois couches d'ambiance repartent de zéro.
export function clearAmbienceLayers(fadeMs) {
  ambienceLayers.base = { identity: null, resolvedPaths: null };
  ambienceLayers.override = { identity: null, resolvedPaths: null };
  overlayLayer.identity = null;
  overlayLayer.resolvedPaths = null;
  syncAmbienceLayers(fadeMs);
}
