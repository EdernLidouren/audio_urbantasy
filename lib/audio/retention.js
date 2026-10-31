// RÉTENTION des sons décodés d'une PORTÉE à l'autre. Un son ponctuel ou une
// balise continue est décodé en entier en mémoire (environ 21 Mo par minute
// de stéréo) et mis en cache pour être rejoué sans redécodage (voir
// ./oneshots.js, ./positioned.js). Sans purge, ces caches grandiraient avec
// tout ce que le joueur a jamais entendu.
//
// Une PORTÉE est une clé opaque fournie par l'appelant (pour un jeu : le
// lieu où se trouve le joueur, ex. un id de monde). Chaque son mis en cache
// note la dernière portée où il a servi (créé, préchargé ou joué). On garde
// les `retainedCount` portées les plus récentes ; à la purge, tout son dont
// la dernière portée n'en fait plus partie est déchargé (Howl.unload). Un
// aller-retour entre deux lieux reste ainsi instantané, et la mémoire est
// bornée par ce que ces derniers lieux font entendre.
//
// Howler partage le tampon décodé d'un fichier entre tous les Howl qui le
// lisent, et ne le libère qu'au déchargement du DERNIER d'entre eux : un
// fichier encore lu ailleurs (par un Howl gardé) reste décodé.
//
// Un son PERMANENT (ex. les sons d'interface, entendus partout) échappe à
// la purge : voir l'option `permanent` de ./oneshots.js/playOneShot.
//
// Deux temps, jamais un seul : enterAudioScope AVANT de monter le lieu
// (ses sons sont alors marqués à mesure qu'ils sont créés ou préchargés),
// releaseStaleAudio APRÈS. Purger dès l'entrée déchargerait puis
// redécoderait aussitôt un fichier que l'ancien et le nouveau lieu ont en
// commun.
//
// Ce module ne touche jamais Howler lui-même : chaque cache inscrit sa
// propre purge (registerAudioReleaser). La mécanique est une FABRIQUE
// (createAudioRetention), vérifiable au terminal (lib/checks/
// audio-retention.check.js) ; le jeu se sert de l'instance partagée
// exportée plus bas.

export function createAudioRetention() {
  // Portées récentes, la plus récente en tête. Vide tant qu'aucune portée
  // n'est ouverte : un son marqué hors de toute portée (`null`) n'est
  // jamais purgé.
  let recentScopes = [];
  // Purges des caches, appelées avec le prédicat "portée périmée ?".
  const releasers = [];

  const isStaleScope = (scope) => scope !== null && !recentScopes.includes(scope);

  return {
    // Ouvre la portée `key`, gardée avec les `retainedCount - 1`
    // précédentes. Rouvrir une portée déjà récente la remet en tête
    // (bascule recto/verso, retour par une porte) sans rien oublier d'autre.
    enterScope(key, retainedCount) {
      recentScopes = [key, ...recentScopes.filter((scope) => scope !== key)].slice(0, retainedCount);
    },
    // Portée courante, à noter sur un son au moment où il sert.
    currentScope() {
      return recentScopes.length > 0 ? recentScopes[0] : null;
    },
    registerReleaser(release) {
      releasers.push(release);
    },
    // Décharge tout son dont la dernière portée n'est plus gardée.
    releaseStale() {
      for (const release of releasers) release(isStaleScope);
    },
  };
}

// Instance partagée par les caches de lib/audio/ et par le jeu.
const shared = createAudioRetention();

export const enterAudioScope = shared.enterScope;
export const currentAudioScope = shared.currentScope;
export const registerAudioReleaser = shared.registerReleaser;
export const releaseStaleAudio = shared.releaseStale;
