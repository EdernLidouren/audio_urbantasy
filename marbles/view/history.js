// Jeu des billes : l'HISTORIQUE, les messages de jeu du tour précédent (touche L).
// Pur : aucune annonce ni écran ; l'écran (marbles/view/screen.js) lui passe les
// étapes qu'il fait dire (marbles/view/narration/journal.js/buildSteps, resolutionSteps)
// et ouvre le menu de ce qu'il rend.
//
// Ne sont retenus que les MESSAGES DE JEU, ceux des étapes : pose, échange, effets,
// phases, résultat, retraits, rotation, pioche, début de tour, fin de partie. Les
// annonces de navigation (curseur, zone, fiche, R, S, D, I), les sélections et les
// refus ne passent jamais par une étape, et n'y entrent donc pas.
//
// Portée : un tour complet, de l'annonce « Début du tour n−1… » à « Début du tour
// n… » incluse ; rien d'avant. La pioche du tour 1, dite avant le premier début de
// tour, n'appartient à aucun tour. La fin de partie ferme le dernier tour comme le
// ferait un début de tour : l'historique d'une partie finie est celui de son
// dernier tour.
//
// Les étapes d'une résolution entrent toutes dès qu'elle commence : l'historique est
// complet même si le joueur la passe.
//
// État : { current, currentTurn, previous }. `current` : les messages du tour en
// cours depuis son début (null avant le premier début de tour, ou une fois la
// partie finie) ; `previous` : { turn, messages }, le dernier tour complet, ou null.

export const EMPTY_HISTORY = { current: null, currentTurn: null, previous: null };

// L'historique après que `steps` ont été dites (ou passées), dans leur ordre.
export function recordSteps(history, steps) {
  let { current, currentTurn, previous } = history;
  for (const step of steps) {
    const closes = step.startsTurn !== undefined || step.endsGame === true;
    if (closes && current !== null) previous = { turn: currentTurn, messages: [...current, ...step.messages] };
    if (step.startsTurn !== undefined) {
      current = [...step.messages];
      currentTurn = step.startsTurn;
    } else if (step.endsGame === true) {
      current = null;
    } else if (current !== null) {
      current = [...current, ...step.messages];
    }
  }
  return { current, currentTurn, previous };
}
