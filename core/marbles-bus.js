// Jeu des billes : le BUS D'ÉVÈNEMENTS interne à la simulation. Aucun lien avec
// le DOM ni avec la vue : un bus vit le temps d'UNE action du réducteur
// (core/marbles.js), et le journal qu'il alimente reste la seule interface vers
// l'écran et le son.
//
// Synchrone : `emit` traite l'évènement et tout ce qui en découle avant de rendre
// la main. Un évènement émis PENDANT un traitement attend son tour dans une file
// (premier entré, premier sorti), sans récursion.
//
// Une seule exception, `settle` : une INTERRUPTION, réglée jusqu'au bout tout de
// suite, même au milieu d'un traitement. Son évènement et tout ce qui en découle
// passent dans une file à part, vidée avant que `settle` ne rende la main ; la file
// en attente reprend ensuite. Sert à la régénération du sac : ses Trouvailles se
// jouent avant que la pioche interrompue ne reprenne (core/marbles.js/regenerateBag).
//
// La limite borne le nombre d'évènements traités d'une action, interruptions
// comprises : une boucle lève une erreur explicite au lieu de geler le jeu.

export const MAX_EVENTS_PER_ACTION = 200;

export class MarbleEventLimitError extends Error {
  constructor(limit) {
    super(`marbles : plus de ${limit} évènements pour une seule action, boucle d'évènements probable.`);
    this.name = "MarbleEventLimitError";
  }
}

// `handle(event)` : le traitement d'un évènement, qui peut rappeler `emit` ou
// `settle`.
export function createEventBus(handle, limit = MAX_EVENTS_PER_ACTION) {
  // Les files en cours, la plus récente en dernier : ce qu'un traitement émet va
  // dans la file de l'interruption en cours, ou dans la file principale.
  const queues = [];
  let processed = 0;

  function drain(queue) {
    while (queue.length > 0) {
      processed += 1;
      if (processed > limit) throw new MarbleEventLimitError(limit);
      handle(queue.shift());
    }
  }

  // Traite `event` et tout ce qui en découle, dans une file à part, avant de rendre
  // la main.
  function settle(event) {
    const queue = [event];
    queues.push(queue);
    try {
      drain(queue);
    } finally {
      queues.pop();
    }
  }

  // Hors de tout traitement, `emit` règle l'évènement tout de suite ; pendant un
  // traitement, il attend dans la file en cours.
  function emit(event) {
    if (queues.length === 0) settle(event);
    else queues[queues.length - 1].push(event);
  }

  return { emit, settle };
}
