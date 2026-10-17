// warning-log.js — journal d'avertissements en mémoire, générique.
//
// Garde la liste des avertissements remontés pendant la session de page,
// pour qu'un écran puisse les présenter un par un (voir
// view/menus/debug-warnings-menu.js pour l'usage dans Templeton). Ne sait
// rien de leur contenu : une entrée est une donnée opaque fournie par
// l'appelant (dans Templeton, une clé i18n et ses paramètres, traduits à
// l'affichage). Pas de persistance : le journal décrit ce qui s'est passé
// depuis le chargement de la page, pas l'état d'une partie.
//
// "Vu" : un compteur d'entrées déjà consultées. Les entrées ajoutées après
// la dernière consultation sont "non vues" (unseenCount), ce qui permet
// d'ouvrir le journal seulement quand il y a du nouveau.

/**
 * @template T
 * @param {{ limit?: number }} [options] - nombre maximal d'entrées gardées,
 *   les plus anciennes sont retirées au-delà
 */
export function createWarningLog({ limit = 200 } = {}) {
  /** @type {T[]} */
  let entries = [];
  let seenCount = 0;

  return {
    /** @param {T} entry */
    add(entry) {
      entries.push(entry);
      if (entries.length > limit) {
        const overflow = entries.length - limit;
        entries.splice(0, overflow);
        seenCount = Math.max(0, seenCount - overflow);
      }
    },
    /** Copie des entrées, de la plus ancienne à la plus récente. */
    entries: () => entries.slice(),
    count: () => entries.length,
    unseenCount: () => entries.length - seenCount,
    markAllSeen() {
      seenCount = entries.length;
    },
    clear() {
      entries = [];
      seenCount = 0;
    },
  };
}
