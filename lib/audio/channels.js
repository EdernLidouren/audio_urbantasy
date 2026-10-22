// CANAUX GLOBAUX (musique, ambiance) : streaming, limite de flux, volume par
// canal ; volume principal.

// Canaux globaux non spatialisés (stéréo à plat, aucun pan/filtre/réverb —
// jamais createPositionedSound, jamais sendToReverb) : musique et ambiance
// partagent CE mécanisme commun, identifiés par un nom de canal plutôt que
// par du code dupliqué par usage. Jamais des sons d'entité, donc jamais mis
// en pause par la pause sélective des balises (voir pause()/resume() dans
// ./positioned.js, qui n'agissent que sur LEUR propre voix).
//
// Politique par canal, déclarée en UN SEUL point : `limit` (flux simultanés
// max, lu par la synchronisation d'ambiance PAR SLOT (./ambience.js) — voir
// "Ambiance : DIFFING PAR COUCHE"/desiredAmbienceSlots, seule à l'appliquer)
// et `html5` (streaming, voir plus bas). Le dépassement est géré par chaque
// canal : musique, un seul flux par construction, jamais deux ; ambiance,
// troncature de la surcouche (voir ./ambience.js/desiredAmbienceSlots). La
// limite d'ambiance est une capacité du JEU, fournie par l'appelant (voir
// setAmbienceLimit) : un seul flux tant qu'elle n'est pas fournie, la
// politique la plus prudente.
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
  music: { limit: 1, html5: true },
  ambience: { limit: 1, html5: true },
};

// Nombre maximum de flux d'ambiance simultanés. Appelée une fois par le jeu
// au chargement de sa vue audio, avec la même valeur que celle qui valide
// ses contenus. Une limite invalide est une erreur de programmation : elle
// lève, jamais une correction silencieuse.
export function setAmbienceLimit(limit) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`setAmbienceLimit : limite invalide (${limit}), entier >= 1 attendu.`);
  }
  GLOBAL_CHANNELS.ambience = { ...GLOBAL_CHANNELS.ambience, limit };
}

// nom de canal -> Howl[] en cours sur ce canal.
const globalChannels = new Map();

export function channelStreams(channel) {
  if (!globalChannels.has(channel)) globalChannels.set(channel, []);
  return globalChannels.get(channel);
}

// Repli pour un canal non déclaré dans GLOBAL_CHANNELS : un seul flux, la
// politique la plus prudente pour un canal dont on ne sait rien.
export function channelPolicy(channel) {
  return GLOBAL_CHANNELS[channel] ?? { limit: 1 };
}

// Dernier facteur appliqué à un canal — mémorisé EN PLUS de l'application
// immédiate ci-dessous (jamais à sa place) : un flux qui naît PLUS TARD sur
// ce canal (ex. le morceau suivant d'une séquence musicale, voir
// ./music.js/startMusicSequence ; ou une couche d'ambiance qui apparaît en
// cours de scène, voir "Ambiance : DIFFING PAR COUCHE", ./ambience.js) doit
// démarrer à ce même niveau, sans attendre un futur appel explicite.
const channelVolumes = new Map();

export function channelVolume(channel) {
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
// gain de couche entités (voir "Gain de couche ENTITÉS", ./context.js, lui-même
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
