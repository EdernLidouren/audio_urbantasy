// JEU DES BILLES — LE RÉSULTAT RENDU À L'HÔTE : ce que le minijeu renvoie à Templeton
// à la fin d'une partie, ou quand le joueur la quitte (marbles/host/entry.js). Un
// objet sérialisable, sans référence à l'état. Pur.
//
// Le minijeu ne décide d'AUCUNE récompense ni d'aucun déblocage : il dit ce qui s'est
// passé, Templeton en tire les conséquences.
//
//   definition  l'id de la définition de partie ;
//   bag         l'id du sac reçu (null : un sac généré) ;
//   goal        la sorte d'objectif (free, target, endurance) ;
//   end         la condition de fin atteinte (marbles/core/definitions.js,
//               END_CONDITIONS), ou "abandon" : le joueur a quitté avant la fin ;
//   outcome     l'ISSUE : "tier" (partie libre, voir `tier`), "victory" ou "defeat"
//               (cible), "success" ou "ended" (endurance, voir `held`), "abandoned" ;
//   tier        partie libre finie : le palier atteint (bronze, silver, gold, none) ;
//   held        endurance finie : les tours tenus ;
//   score       le score final ;
//   turnsPlayed les tours RÉSOLUS ;
//   bagSize     le nombre de billes du sac reçu ;
//   values      quelques valeurs de partie (marbles/core/tally.js, portée « cette
//               partie ») : billes lancées, piochées, empochées, perdues, éjectées,
//               défaussées.
// Un abandon n'a ni palier, ni victoire, ni tours tenus : rien que Templeton puisse
// récompenser.

// Les valeurs de partie du résultat : son nom -> le compteur du registre.
const OUTCOME_VALUES = Object.freeze({
  thrown: "thrownMarbles",
  drawn: "drawnMarbles",
  pocketed: "pocketedMarbles",
  lost: "lostMarbles",
  ejected: "ejectedMarbles",
  discarded: "discardedMarbles",
});

// L'issue de chaque objectif, d'après le résultat de la partie (state.result).
const GOAL_OUTCOMES = Object.freeze({
  free: (result) => ({ outcome: "tier", tier: result.tier }),
  target: (result) => ({ outcome: result.outcome }),
  endurance: (result) => ({ outcome: result.outcome, held: result.held }),
});

// Les tours résolus : tous ceux d'avant le tour en cours ; à la fin, le dernier aussi,
// sauf si la partie s'est arrêtée à sa pioche (faute de billes), avant de le jouer.
export function turnsPlayed(state) {
  if (state.stage !== "over") return state.turn - 1;
  return state.result.end === "noMarbles" ? state.turn - 1 : state.turn;
}

// LE RÉSULTAT d'une partie (en-tête), finie ou quittée en cours (un abandon).
export function marblesOutcome(state) {
  const over = state.stage === "over";
  const issue = over ? { end: state.result.end, ...GOAL_OUTCOMES[state.definition.goal.kind](state.result) } : { end: "abandon", outcome: "abandoned" };
  return {
    definition: state.definition.id,
    bag: state.bagOrigin.id,
    goal: state.definition.goal.kind,
    ...issue,
    score: state.score,
    turnsPlayed: turnsPlayed(state),
    bagSize: state.bagOrigin.size,
    values: Object.fromEntries(Object.entries(OUTCOME_VALUES).map(([name, counter]) => [name, state.tally[counter].game])),
  };
}

