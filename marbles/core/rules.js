// Jeu des billes : les RÈGLES liées à une table de billes. Le point d'entrée de la
// simulation pour tout ce qui est hors du core (la vue, les outils, les
// vérifications) : on compose une fois, puis on joue.
//
//   const marbles = createMarblesRules(MARBLE_TYPES, MARBLE_STATUSES, GAME_DEFINITIONS, PRESET_BAGS);   // main.js
//   const start = marbles.startGame(seed, marbles.definitions[DEFAULT_DEFINITION], { bag, unlocked });
//   if (!start.ok) dire(start.problems);
//   let game = start.state;
//   const { ok, state, events } = marbles.reduce(game, { type: "draw" });
//   marbles.forecast(state);
//
// Pourquoi une fabrique : la table des billes est un CONTENU
// (marbles/content/types/index.js), que le core n'importe jamais (CLAUDE.md). Plutôt que de
// la passer à chaque appel, on la lie une fois aux fonctions qui la lisent. Une
// table fabriquée se teste de la même façon, sans risque de retomber en silence
// sur celle du jeu : createMarblesRules(maTable). La table des STATUTS
// (marbles/content/statuses/index.js) est un contenu aussi, liée de même ; aucune par
// défaut. Les DÉFINITIONS DE PARTIE (marbles/content/definitions/index.js) de même,
// validées à la composition ; une partie se crée d'après l'une d'elles, ou d'après une
// définition venue d'ailleurs (un fichier des outils), validée à sa création. Les SACS
// PRÉFAITS (marbles/content/bags/index.js) aussi : une définition peut en imposer un.
//
// Les fonctions de marbles/core/marbles.js, marbles/core/content.js, marbles/core/run.js,
// marbles/core/effects.js et marbles/core/forecast.js qui prennent `types` restent la plomberie interne du
// core ; hors du core, on passe par ces règles. Ce qui ne lit aucune bille ni aucun
// statut (impactOf, SLOTS...) s'importe directement ; ce qui dépend des
// caractéristiques ou des verrous (lancers restants, refus d'échange, de lancer et de
// pose, actions légales) passe par les règles, qui y lient les statuts.

import { createMarblesGame, startMarblesGame, legalActions, lockReason, marblesReduce, nextTurnDraw, placeRefusal, swapRefusal, throwRefusal, throwsLeft } from "./marbles.js";
import { appliedStatusesOf, keywordsOf, maxWearOf } from "./content.js";
import { validateGameDefinitions, validateMarbleStatuses, validateMarbleTypes } from "./validation.js";
import { NO_DEFINITIONS, buildRulesOf, swapEnabled } from "./definitions.js";
import { NO_BAGS, bagProblems, validatePresetBags } from "./bags.js";
import { BAG_BUILD_RULES } from "../config/values.js";
import { NO_STATUSES, characteristic } from "./statuses.js";
import { effectAt } from "./effects.js";
import { forecast } from "./forecast.js";

// Les règles de `types`, de `statuses`, des définitions de partie et des sacs
// préfaits (`bags`), validées ici : une table mal formée échoue à la composition,
// jamais en pleine partie.
export function createMarblesRules(types, statuses = NO_STATUSES, definitions = NO_DEFINITIONS, bags = NO_BAGS) {
  validateMarbleStatuses(statuses);
  validateMarbleTypes(types, statuses);
  validatePresetBags(bags, types, BAG_BUILD_RULES);
  validateGameDefinitions(definitions, types, statuses, bags);
  return Object.freeze({
    // Les tables elles-mêmes, pour qui lit les champs d'une bille (la fiche) ou d'un
    // statut.
    types,
    statuses,
    // Le registre des définitions de partie, { id: définition }.
    definitions,
    // Le registre des sacs préfaits, { id: sac }.
    bags,
    // Le DÉPART d'une partie, d'après sa définition (du registre, ou d'ailleurs) et,
    // pour un sac du joueur, le sac fourni : { ok, state, problems }, la partie refusée
    // pour un sac invalide (marbles/core/marbles.js/startMarblesGame). `options` :
    // { bag, unlocked, unchecked }.
    startGame: (seed, definition, options = {}) => startMarblesGame(seed, definition, types, statuses, { ...options, presets: bags }),
    // Une partie neuve, ou une erreur qui liste les problèmes du sac (les outils, les
    // vérifications).
    createGame: (seed, definition, options = {}) => createMarblesGame(seed, definition, types, statuses, { ...options, presets: bags }),
    // Les règles de construction d'un sac du joueur pour cette définition (celles par
    // défaut, complétées ou remplacées par les siennes).
    buildRulesOf: (definition) => buildRulesOf(definition, BAG_BUILD_RULES),
    // Les problèmes d'un sac pour cette définition, [] s'il est valide
    // (marbles/core/bags.js/bagProblems) ; `unlocked` : les billes débloquées, ou null.
    bagProblems: (bag, definition, unlocked = null) => bagProblems(bag, buildRulesOf(definition, BAG_BUILD_RULES), { types, unlocked }),
    // Le réducteur. `options` : { eventLimit, blind } (marbles/core/marbles.js/marblesReduce).
    reduce: (state, action, options = {}) => marblesReduce(state, action, types, { ...options, statuses }),
    // La prévision du tour, `action` envisagée ou non.
    forecast: (state, action = null) => forecast(state, action, types, statuses),
    // Une CARACTÉRISTIQUE de la partie en vigueur, statuts compris ("throws",
    // "handSize", "potCapacity" : marbles/core/statuses.js/characteristic).
    characteristic: (state, key) => characteristic(state, key, statuses),
    // Les lancers restants, les refus de lancer et de pose, les actions légales.
    throwsLeft: (state) => throwsLeft(state, statuses),
    swapRefusal: (state) => swapRefusal(state, statuses),
    // L'échange fait-il partie de cette partie (sa définition) ? Faux : l'écran ne le
    // propose pas, sans rien dire.
    swapEnabled: (state) => swapEnabled(state),
    throwRefusal: (state) => throwRefusal(state, statuses),
    placeRefusal: (state, handIndex, slot) => placeRefusal(state, handIndex, slot, statuses),
    legalActions: (state) => legalActions(state, statuses),
    // Le statut qui verrouille une action refusée (`code`), { status, rule }, ou null.
    lockReason: (state, code) => lockReason(state, code, statuses),
    // La pioche du prochain début de tour, statuts compris, sans rien consommer.
    nextTurnDraw: (state) => nextTurnDraw(state, statuses),
    maxWearOf: (marble) => maxWearOf(marble, types),
    // Les mots-clés présents sur une bille, dans l'ordre de l'aide (touches E, Maj+E).
    keywordsOf: (marble) => keywordsOf(marble, types),
    // Les statuts qu'une bille peut appliquer, dans l'ordre de ses clauses.
    appliedStatusesOf: (marble) => appliedStatusesOf(marble, types),
    // L'effet de phase imprimé d'une bille à un emplacement, variante comprise.
    effectAt: (marble, slot) => effectAt(marble, slot, types),
  });
}
