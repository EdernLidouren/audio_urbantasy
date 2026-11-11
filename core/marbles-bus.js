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
// La LIMITE borne le nombre d'évènements traités d'une action, interruptions
// comprises : une boucle (deux billes du pot qui se répondent) ne gèle jamais le jeu.
// Atteinte, la CHAÎNE S'ARRÊTE proprement : les files en attente sont vidées,
// `onLimit` est appelé une fois, et plus rien n'est traité jusqu'à la fin de
// l'action ; ce qui est émis ensuite n'est plus traité. Rien n'est levé : celui qui
// appelle finit son action. Dans les vérifications et le simulateur, l'atteindre est
// une anomalie (un enchaînement de billes sans fin).

export const MAX_EVENTS_PER_ACTION = 200;

// `handle(event)` : le traitement d'un évènement, qui peut rappeler `emit` ou
// `settle`. `onLimit()` (facultatif) : appelé une fois, quand la limite arrête la
// chaîne. `stopped()` dit si elle l'a fait.
export function createEventBus(handle, limit = MAX_EVENTS_PER_ACTION, onLimit = () => {}) {
  // Les files en cours, la plus récente en dernier : ce qu'un traitement émet va
  // dans la file de l'interruption en cours, ou dans la file principale.
  const queues = [];
  let processed = 0;
  let halted = false;

  function halt() {
    halted = true;
    for (const queue of queues) queue.length = 0;
    onLimit();
  }

  function drain(queue) {
    while (!halted && queue.length > 0) {
      processed += 1;
      if (processed > limit) {
        halt();
        return;
      }
      handle(queue.shift());
    }
  }

  // Traite `event` et tout ce qui en découle, dans une file à part, avant de rendre
  // la main.
  function settle(event) {
    if (halted) return;
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
    if (halted) return;
    if (queues.length === 0) settle(event);
    else queues[queues.length - 1].push(event);
  }

  return { emit, settle, stopped: () => halted };
}
