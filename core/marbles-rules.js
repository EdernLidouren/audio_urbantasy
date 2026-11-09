// Jeu des billes : les RÈGLES liées à une table de billes. Le point d'entrée de la
// simulation pour tout ce qui est hors du core (la vue, les outils, les
// vérifications) : on compose une fois, puis on joue.
//
//   const marbles = createMarblesRules(MARBLE_TYPES);   // main.js, une seule fois
//   let game = marbles.createGame(seed);
//   const { ok, state, events } = marbles.reduce(game, { type: "draw" });
//   marbles.forecast(state);
//
// Pourquoi une fabrique : la table des billes est un CONTENU
// (marbles/types/index.js), que le core n'importe jamais (CLAUDE.md). Plutôt que de
// la passer à chaque appel, on la lie une fois aux fonctions qui la lisent. Une
// table fabriquée se teste de la même façon, sans risque de retomber en silence
// sur celle du jeu : createMarblesRules(maTable).
//
// Les fonctions de core/marbles.js, core/marbles-effects.js et
// core/marbles-forecast.js qui prennent `types` restent la plomberie interne du
// core ; hors du core, on passe par ces règles. Ce qui ne lit aucune bille
// (legalActions, les refus, impactOf, SLOTS...) s'importe directement.

import { createMarblesGame, marblesReduce, maxWearOf, validateMarbleTypes } from "./marbles.js";
import { effectAt } from "./marbles-effects.js";
import { forecast } from "./marbles-forecast.js";

// Les règles de `types`, validée ici : une table mal formée échoue à la
// composition, jamais en pleine partie.
export function createMarblesRules(types) {
  validateMarbleTypes(types);
  return Object.freeze({
    // La table elle-même, pour qui lit les champs d'une bille (la fiche).
    types,
    // Une partie neuve. `options` : bag et réglages propres à cette partie.
    createGame: (seed, options = {}) => createMarblesGame(seed, options, types),
    // Le réducteur. `options` : { eventLimit, blind } (core/marbles.js/marblesReduce).
    reduce: (state, action, options) => marblesReduce(state, action, types, options),
    // La prévision du tour, `action` envisagée ou non.
    forecast: (state, action = null) => forecast(state, action, types),
    maxWearOf: (marble) => maxWearOf(marble, types),
    // L'effet de phase imprimé d'une bille à un emplacement, variante comprise.
    effectAt: (marble, slot) => effectAt(marble, slot, types),
  });
}
