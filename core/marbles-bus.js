// Jeu des billes : le BUS D'ÉVÈNEMENTS interne à la simulation. Aucun lien avec
// le DOM ni avec la vue : un bus vit le temps d'UNE action du réducteur
// (core/marbles.js), et le journal qu'il alimente reste la seule interface vers
// l'écran et le son.
//
// Synchrone et sans récursion : `emit` traite l'évènement et tout ce qui en
// découle avant de rendre la main. Un évènement émis PENDANT un traitement
// attend son tour dans une file (premier entré, premier sorti). La limite borne
// le nombre d'évènements d'une action : une boucle lève une erreur explicite au
// lieu de geler le jeu.

export const MAX_EVENTS_PER_ACTION = 200;

export class MarbleEventLimitError extends Error {
  constructor(limit) {
    super(`marbles : plus de ${limit} évènements pour une seule action, boucle d'évènements probable.`);
    this.name = "MarbleEventLimitError";
  }
}

// `handle(event)` : le traitement d'un évènement, qui peut rappeler `emit`.
export function createEventBus(handle, limit = MAX_EVENTS_PER_ACTION) {
  const queue = [];
  let draining = false;
  let processed = 0;

  function emit(event) {
    queue.push(event);
    if (draining) return;
    draining = true;
    try {
      while (queue.length > 0) {
        processed += 1;
        if (processed > limit) throw new MarbleEventLimitError(limit);
        handle(queue.shift());
      }
    } finally {
      draining = false;
    }
  }

  return { emit };
}
