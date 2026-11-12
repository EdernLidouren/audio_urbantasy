// Jeu des billes : la PRÉSENTATION DE LA RÉSOLUTION, sortie de l'écran
// (view/marbles/screen.js). La simulation résout tout d'un coup ; ce module ne fait
// que la DIRE, en séquence (view/marbles/sequence.js) : une étape après l'autre,
// chacune avec ses sons et une pause, avancée par le temps réel de l'écran.
//
// Il possède l'état de cette présentation, le temps d'un écran :
//   - la SÉQUENCE en cours (null : aucune) ;
//   - la RÉSOLUTION en cours tant qu'un choix peut l'interrompre ({ turn }, ou
//     null) : le choix fait, la suite se dit aussi en séquence (resume) ;
//   - la GARDE après un saut : un second Entrée trop proche du saut est ignoré
//     (MARBLES_SETTINGS.skipGuardMs), la dernière étape n'ayant pas pu être entendue.
// L'écran garde le curseur, la parole, les sons et l'historique : il les prête par
// les fonctions reçues (createResolutionPresenter). Aucune règle ici : la pioche du
// tour suivant passe par le réducteur, par l'écran (`draw`).

import { MARBLES_SETTINGS } from "../../config/marbles-values.js";
import { buildSteps, describeChoicePrompt, resolutionSteps } from "./narration.js";
import { handSizeChange } from "./sounds.js";
import { advanceSequence, restartPause, skipSequence, startSequence } from "./sequence.js";

// La question d'un choix, en étape : dite et retenue dans l'historique comme un
// message de jeu (le jeu demande quelque chose), sans évènement ni son.
export function choicePromptStep(pending, t) {
  const text = describeChoicePrompt(pending, t);
  return { text, events: [], messages: [text] };
}

// Chaque étape avec la taille de la main juste après elle, en remontant depuis la
// main finale : une bille piochée au milieu de la résolution se place (et
// s'entend) dans la main de ce moment, pas dans celle de la fin de la séquence.
export function withHandSizes(steps, finalHandSize) {
  let size = finalHandSize;
  const sized = [];
  for (let index = steps.length - 1; index >= 0; index--) {
    sized.unshift({ ...steps[index], handSize: size });
    size -= handSizeChange(steps[index].events);
  }
  return sized;
}

// Ce que l'écran prête à la présentation :
//   getGame()        la partie, déjà résolue ;
//   draw()           la pioche du tour suivant par le réducteur : ses évènements
//                    (vide si refusée) ;
//   t, now           les textes et l'horloge de l'écran (son `io`) ;
//   recorded(steps)  fait entrer des étapes dans l'historique, et les rend ;
//   onStep(step)     une étape commence : ses sons, son texte (la séquence est
//                    déjà à jour : à la dernière étape, l'écran peut dire comment
//                    sortir d'une partie finie) ;
//   onChoice(pending) un choix suspend la résolution : le curseur s'y place ;
//   onDone()         la résolution est finie : le curseur revient dans la main ;
//   silence()        coupe les sons encore à venir (un saut).
export function createResolutionPresenter({ getGame, draw, t, now, recorded, onStep, onChoice, onDone, silence }) {
  let sequence = null;
  let resolving = null;
  let skipGuardUntil = -Infinity;

  // Une étape de la file commence, ou aucune.
  function follow({ sequence: next, step }) {
    sequence = next;
    if (step !== null) onStep(step);
  }

  // Une part de la résolution (`first` : son début, avec l'ouverture) : si elle est
  // finie, la pioche du tour suivant s'y ajoute ; si un choix l'a suspendue, sa
  // question devient la dernière étape de la séquence, où s'arrête aussi le geste qui
  // la passe ; le choix fait, la suite reprend ici (resume). La pioche elle-même peut
  // attendre un choix (un Éveil) : même chemin.
  function present(events, first) {
    let all = events;
    if (getGame().pendingChoice === null && getGame().stage === "draw") all = [...all, ...draw()];
    const { turn } = resolving;
    // La première fois, comment la passer.
    const steps = recorded(first ? resolutionSteps(turn, all, t, { hint: turn === 1 }) : buildSteps(all, t));
    const pending = getGame().pendingChoice;
    if (pending === null) {
      resolving = null;
      onDone();
    } else {
      onChoice(pending);
      steps.push(recorded([choicePromptStep(pending, t)])[0]);
    }
    follow(startSequence(withHandSizes(steps, getGame().hand.length)));
  }

  return {
    // Une séquence se dit : l'état est déjà celui d'après, rien ne doit le dévoiler.
    isNarrating: () => sequence !== null,
    // Une résolution attend la fin d'un choix pour se dire jusqu'au bout.
    isResolving: () => resolving !== null,
    // La résolution du tour `turn` vient d'avoir lieu (ses évènements) : elle se dit.
    start(turn, events) {
      resolving = { turn };
      present(events, true);
    },
    // Un choix qui la suspendait vient d'être fait (les évènements de la reprise).
    resume(events) {
      present(events, false);
    },
    // Un état construit, ouvert sur un choix qui suspend la résolution du tour `turn` :
    // la suite se dira en séquence, puis le tour suivant se piochera, comme si
    // l'écran l'avait lancée.
    adopt(turn) {
      resolving = { turn };
    },
    // Entrée pendant la séquence : la passer, sons à venir compris, jusqu'à sa
    // dernière étape ; la garde commence.
    skip() {
      silence();
      follow(skipSequence(sequence));
      skipGuardUntil = now() + MARBLES_SETTINGS.skipGuardMs;
    },
    // Un Entrée tombe-t-il dans la garde d'un saut ?
    isSkipGuarded: () => now() < skipGuardUntil,
    // Le temps réel : une étape au plus.
    advance(deltaMs) {
      if (sequence !== null) follow(advanceSequence(sequence, deltaMs));
    },
    // Retour arrière : l'étape se redit, sa pause repart.
    restartPause() {
      if (sequence !== null) sequence = restartPause(sequence);
    },
  };
}
