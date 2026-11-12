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
// en attente reprend ensuite. Sert à ce qui doit se régler avant la suite
// (core/marbles.js) : les Trouvailles puis les réactions du pot au mélange, avant
// que la pioche interrompue ne reprenne (regenerateBag) ; l'Éveil d'une bille
// piochée, avant la suivante ; l'entrée au pot ; l'Éjection d'une bille chassée par
// l'action Éjecter, avant qu'elle ne quitte son emplacement.
//
// Une CHAÎNE : ce qu'un évènement émis hors de tout traitement déclenche, de proche
// en proche, interruptions comprises, jusqu'à ce que tout soit réglé.
//
// La LIMITE borne le nombre d'évènements traités d'une chaîne : une boucle (deux
// billes du pot qui se répondent) ne gèle jamais le jeu. Atteinte, la chaîne est
// COUPÉE : ce qui en restait à traiter est abandonné, `onLimit` est appelé une fois,
// et ce que la chaîne émet encore n'est plus traité. La chaîne suivante repart de
// zéro : celui qui appelle reprend normalement (une résolution joue ses phases
// suivantes). Rien n'est levé. Dans les vérifications et le simulateur, l'atteindre
// est une anomalie (un enchaînement de billes sans fin).

export const MAX_EVENTS_PER_CHAIN = 200;

// `handle(event)` : le traitement d'un évènement, qui peut rappeler `emit` ou
// `settle`. `onLimit()` (facultatif) : appelé une fois par chaîne coupée.
// `interruptions()` : le nombre de chaînes coupées.
export function createEventBus(handle, limit = MAX_EVENTS_PER_CHAIN, onLimit = () => {}) {
  // Les files en cours, la plus récente en dernier : ce qu'un traitement émet va
  // dans la file de l'interruption en cours, ou dans la file principale.
  const queues = [];
  // La chaîne en cours : ses évènements traités, et si elle a été coupée.
  let processed = 0;
  let cut = false;
  let interruptions = 0;

  function cutChain() {
    cut = true;
    interruptions += 1;
    for (const queue of queues) queue.length = 0;
    onLimit();
  }

  function drain(queue) {
    while (!cut && queue.length > 0) {
      processed += 1;
      if (processed > limit) {
        cutChain();
        return;
      }
      handle(queue.shift());
    }
  }

  // Traite `event` et tout ce qui en découle, dans une file à part, avant de rendre
  // la main. Hors de tout traitement, il ouvre une nouvelle chaîne.
  function settle(event) {
    const opensChain = queues.length === 0;
    if (opensChain) {
      processed = 0;
      cut = false;
    }
    if (cut) return;
    const queue = [event];
    queues.push(queue);
    try {
      drain(queue);
    } finally {
      queues.pop();
      // La chaîne finie, coupée ou non : la suivante repart de zéro.
      if (opensChain) cut = false;
    }
  }

  // Hors de tout traitement, `emit` règle l'évènement tout de suite ; pendant un
  // traitement, il attend dans la file en cours (sauf dans une chaîne coupée).
  function emit(event) {
    if (queues.length === 0) settle(event);
    else if (!cut) queues[queues.length - 1].push(event);
  }

  return { emit, settle, interruptions: () => interruptions };
}
