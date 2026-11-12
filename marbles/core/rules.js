// Jeu des billes : les RÈGLES liées à une table de billes. Le point d'entrée de la
// simulation pour tout ce qui est hors du core (la vue, les outils, les
// vérifications) : on compose une fois, puis on joue.
//
//   const marbles = createMarblesRules(MARBLE_TYPES, MARBLE_STATUSES);   // main.js, une seule fois
//   let game = marbles.createGame(seed);
//   const { ok, state, events } = marbles.reduce(game, { type: "draw" });
//   marbles.forecast(state);
//
// Pourquoi une fabrique : la table des billes est un CONTENU
// (marbles/content/types/index.js), que le core n'importe jamais (CLAUDE.md). Plutôt que de
// la passer à chaque appel, on la lie une fois aux fonctions qui la lisent. Une
// table fabriquée se teste de la même façon, sans risque de retomber en silence
// sur celle du jeu : createMarblesRules(maTable). La table des STATUTS
// (marbles/content/statuses/index.js) est un contenu aussi, liée de même ; aucune par
// défaut.
//
// Les fonctions de marbles/core/marbles.js, marbles/core/content.js, marbles/core/run.js,
// marbles/core/effects.js et marbles/core/forecast.js qui prennent `types` restent la plomberie interne du
// core ; hors du core, on passe par ces règles. Ce qui ne lit aucune bille ni aucun
// statut (swapRefusal, impactOf, SLOTS...) s'importe directement ; ce qui dépend des
// caractéristiques (lancers restants, refus de lancer et de pose, actions légales)
// passe par les règles, qui y lient les statuts.

import { createMarblesGame, legalActions, marblesReduce, placeRefusal, throwRefusal, throwsLeft } from "./marbles.js";
import { appliedStatusesOf, keywordsOf, maxWearOf, validateMarbleStatuses, validateMarbleTypes } from "./content.js";
import { NO_STATUSES, characteristic } from "./statuses.js";
import { effectAt } from "./effects.js";
import { forecast } from "./forecast.js";

// Les règles de `types` et de `statuses`, validées ici : une table mal formée échoue
// à la composition, jamais en pleine partie.
export function createMarblesRules(types, statuses = NO_STATUSES) {
  validateMarbleStatuses(statuses);
  validateMarbleTypes(types, statuses);
  return Object.freeze({
    // Les tables elles-mêmes, pour qui lit les champs d'une bille (la fiche) ou d'un
    // statut.
    types,
    statuses,
    // Une partie neuve. `options` : bag et réglages propres à cette partie.
    createGame: (seed, options = {}) => createMarblesGame(seed, options, types),
    // Le réducteur. `options` : { eventLimit, blind } (marbles/core/marbles.js/marblesReduce).
    reduce: (state, action, options = {}) => marblesReduce(state, action, types, { ...options, statuses }),
    // La prévision du tour, `action` envisagée ou non.
    forecast: (state, action = null) => forecast(state, action, types, statuses),
    // Une CARACTÉRISTIQUE de la partie en vigueur, statuts compris ("throws",
    // "handSize", "potCapacity" : marbles/core/statuses.js/characteristic).
    characteristic: (state, key) => characteristic(state, key, statuses),
    // Les lancers restants, les refus de lancer et de pose, les actions légales.
    throwsLeft: (state) => throwsLeft(state, statuses),
    throwRefusal: (state) => throwRefusal(state, statuses),
    placeRefusal: (state, handIndex, slot) => placeRefusal(state, handIndex, slot, statuses),
    legalActions: (state) => legalActions(state, statuses),
    maxWearOf: (marble) => maxWearOf(marble, types),
    // Les mots-clés présents sur une bille, dans l'ordre de l'aide (touches E, Maj+E).
    keywordsOf: (marble) => keywordsOf(marble, types),
    // Les statuts qu'une bille peut appliquer, dans l'ordre de ses clauses.
    appliedStatusesOf: (marble) => appliedStatusesOf(marble, types),
    // L'effet de phase imprimé d'une bille à un emplacement, variante comprise.
    effectAt: (marble, slot) => effectAt(marble, slot, types),
  });
}
