// JEU DES BILLES — le RÉDUCTEUR : l'état, la mise en place, les refus et les
// actions (marblesReduce). Simulation pure : aucun DOM, aucun son, aucun aléa non
// seedé. Règles, format des billes et interface : doc/marbles.md.
// LES MODULES DU CORE, du plus fondamental au réducteur (doc/marbles.md, la carte) :
//   zones.js       les zones : le triangle et son ordre horaire, les zones de la
//                  partie, celles d'un choix, celles de la bille qui joue un effet ;
//   definitions.js les définitions de partie : départ, sac, tours, objectif, règles ;
//   statuses.js    les statuts : caractéristiques, modificateurs, cumuls, durées ;
//   effects.js     le modèle d'effet : clauses, actions, conditions, montants ;
//   counters.js, tally.js  les valeurs de partie : leurs compteurs, leur registre ;
//   content.js     le catalogue : le journal, les valeurs de partie, les mots-clés ;
//   validation.js  la validation des tables injectées (billes, statuts, définitions) ;
//   bus.js         le bus d'évènements d'une action ;
//   path.js, choices.js  le chemin des billes, les cibles au choix ;
//   run.js         le déroulé d'une action : écouteurs, effets, réactions, pioche ;
//   marbles.js     ce fichier : l'état, les refus, les actions ;
//   forecast.js    la prévision, le vrai moteur sur une copie à l'aveugle ;
//   rules.js       les règles liées aux tables, le point d'entrée hors du core.
//
// ÉTAT sérialisable, à part entière (jamais lié à la session du jeu principal,
// aucune persistance aujourd'hui) :
//   { rngState, definition, bagOrigin, turn, score, speed, mass, stage, bag, hand,
//     discard, triangle, pot, lost, swapUsed, throwsUsed, tally, statuses,
//     pendingChoice, result }
// LA COPIE DE PARTIE : la partie reçoit un SAC (marbles/core/bags.js) et en déroule
// les exemplaires, mélangés, dans `bag` (startMarblesGame). Chaque exemplaire n'est
// ensuite qu'un id dans une zone (sac de pioche, main, triangle, défausse, pot,
// billes perdues) : son état propre (usure, bonus, tours en main) vit dans la zone
// qui le porte et disparaît par construction quand il en sort. Aucun identifiant
// d'exemplaire : aucune règle ne suit un exemplaire d'une zone à l'autre (il viendra
// avec la première qui le demande). Le sac reçu n'est jamais référencé : rien de ce
// qui arrive en partie ne le modifie. Le NOMBRE d'exemplaires, toutes zones réunies,
// ne change jamais (une bille perdue reste dans `lost`) : il vaut `bagOrigin.size`.
// `bagOrigin` : { id, size }, l'id du sac reçu (null pour un sac généré) et son
// nombre de billes, que rend le résultat pour l'hôte (marbles/core/outcome.js).
// `definition` : la COPIE de la définition de la partie (marbles/core/definitions.js) :
// ses valeurs de départ (pioches, et celles des CARACTÉRISTIQUES, jamais lues
// directement par une règle : l'accès unique, marbles/core/statuses.js/characteristic,
// y ajoute les statuts), son nombre de tours, son objectif, ses règles. Jamais
// modifiée. `result` : null pendant la partie ; à sa fin, son RÉSULTAT selon son
// objectif (marbles/core/definitions.js/gameResult), que porte aussi `gameOver`.
// `statuses` : les INSTANCES DE STATUT de la partie, dans l'ordre d'acquisition
// (marbles/core/statuses.js, en-tête), [] au départ.
// `pot` : les billes EN POCHE, des ids dans l'ordre d'arrivée, au plus sa capacité en
// vigueur à l'arrivée (une capacité réduite ensuite n'en fait sortir aucune) ; `lost` : les billes PERDUES, envoyées au pot plein. Ni l'une ni
// l'autre ne revient jamais dans le sac, ni ne quitte sa zone.
// `tally` : les VALEURS DE PARTIE, { <id>: { turn, game } } (marbles/core/tally.js, le
// seul à les écrire ; les compteurs : marbles/core/counters.js, TALLY_COUNTERS), tenues
// à l'émission de chaque évènement du journal (marbles/core/run.js/transact). Une
// bille du pot peut réagir à chaque incrément d'un compteur ÉCOUTABLE (En poche, à
// chaque (occurrence) : marbles/core/run.js/reactionsOf).
// `throwsUsed` : les LANCERS joués ce tour (une pose depuis la main en est un,
// l'échange non) ; la caractéristique « lancers » (statuts compris) les borne.
// `pendingChoice` : null, ou le CHOIX EN ATTENTE d'une cible au choix
// (marbles/core/effects.js, en-tête), qui a SUSPENDU l'action en cours :
//   { action, amount?, zones, pick, count, mode, by, eligible, chosen, remaining,
//     inTransit, resume: { from, action, answers, seen, eventLimit? } }
// `action`, `amount` : l'action à appliquer aux cibles ; `by` : l'effet qui la
// produit ({ trigger, slot, marble }) ; `eligible` : les cibles valides maintenant,
// déjà choisies exclues ; `chosen` : celles déjà choisies, dans l'ordre ; une cible
// est { zone: "hand", index, marble } ou { zone: "triangle", slot, marble }.
// `inTransit` : les billes EN TRANSIT à l'instant du choix, sorties d'une zone et
// pas encore arrivées ({ kind, marble, slot } : "thrown", en cours de lancer, vers
// l'emplacement `slot` ; "leaving", en partance pendant son Final ou son Éjection,
// depuis l'emplacement `slot`, ou null hors du triangle) ; souvent vide. Une
// information pour l'interface, jamais une cible : elles n'appartiennent à aucune
// zone. Elles n'existent que dans un choix en attente, l'état n'en a pas d'autre
// trace.
// REPRISE PAR REJEU : `resume.from` est l'état d'AVANT l'action suspendue,
// `resume.action` cette action (pioche, pose, résolution), `resume.answers` les
// réponses déjà données, dans l'ordre (answerOf : une cible avec sa bille, ou
// Terminer), `resume.seen` le nombre d'évènements du
// journal déjà rendus. L'action « choisir » rejoue l'action depuis `from` avec une
// réponse de plus : la simulation étant déterministe (hasard dans l'état), le rejeu
// refait exactement le même chemin, file du bus comprise, jusqu'au choix, consomme
// les réponses et continue ; seuls les évènements d'après `seen` sont rendus. Une
// pile d'appels ne se sérialise pas : l'état d'avant et les réponses, si. L'état
// suspendu (`state` rendu avec le choix) est celui du déroulé à l'instant du choix :
// il se lit, il ne se rejoue jamais. Tant qu'un choix attend, toute autre action est
// refusée (`choicePending`).
// bag et discard sont des listes d'ids de billes (doublons permis). Une bille
// n'a d'usure que SUR le triangle, { marble, wear, bonus? } : une bille qui en
// sort perd donc son usure et son bonus par construction. `bonus`
// ({ speed, mass }), présent seulement si une autre bille lui en a donné un, va
// avec la bille dans un échange et disparaît à la fin de la résolution.
// De même, une bille n'a de compteur de tours en main que DANS la main,
// { marble, turnsInHand } : +1 au début de chaque tour pour les billes déjà en main
// avant sa pioche (une bille piochée ce tour reste à 0) ; une bille qui quitte la
// main (pose ou tout autre départ) le perd par construction. Lu par les montants
// calculés (marbles/core/effects.js/AMOUNT_SOURCES).
// Le sommet du sac est bag[0].
//
// `speed` et `mass` sont les compteurs du tour : les effets joués pendant la phase de
// jeu (Chiquenaude, Tic, Éjection, réactions…) les modifient avant la résolution, qui
// part de ces valeurs. Ils reviennent à 0 et 1 à la fin
// de chaque résolution.
//
// `stage` découpe le tour : "draw" (la pioche reste à faire), "play" (échange
// et pose, jusqu'à la résolution), "over" (partie finie : une CONDITION DE FIN
// atteinte, marbles/core/definitions.js/END_CONDITIONS, après l'Impact d'une
// résolution ou à la pioche du début de tour). À la fin d'une résolution, `turn`
// passe au tour suivant, sauf si la partie s'arrête : il reste alors sur le
// dernier tour joué, jamais « 11 sur 10 ».
//
// ACTIONS — marblesReduce(state, action, types) :
//   { type: "draw" }                            pioche du tour
//   { type: "swap", a, b }                      échange deux emplacements
//   { type: "place", handIndex, slot }          pose une bille de la main
//   { type: "resolve" }                         résout le tour, retrait, rotation
//   { type: "choose", target }                  répond au choix en attente : une
//                                               cible, { zone: "hand", index } ou
//                                               { zone: "triangle", slot }
//   { type: "choose", done: true }              termine un choix facultatif (rien
//                                               choisi : l'action est ignorée)
// Résultat, toujours la même forme : { ok, state, events, error }. Refus :
// ok false, `state` inchangé, `events` vide, `error` un code de MARBLE_ERRORS
// (son texte : `marbles.error.<code>`), et, pour un VERROU, `lockedBy`, le statut en
// cause ({ status, rule } : lockReason). Rien n'est jamais levé pour une action
// interdite.
//
// JOURNAL — `events`, dans l'ordre où ça se passe : ses évènements sont décrits dans
// l'en-tête de marbles/core/content.js (JOURNAL_EVENTS).
//
// `types` (paramètre OBLIGATOIRE des fonctions qui lisent une bille) : la table
// des billes, un registre de contenu (marbles/content/types/index.js) que ce module
// n'importe jamais (CLAUDE.md) : la vue, les outils et les vérifications le lui
// passent. Les vérifications y passent aussi des tables fabriquées, qui testent
// ce qu'aucune bille actuelle ne produit (une Masse négative).
// `statuses` (dernier paramètre des lectures qui dépendent des caractéristiques, et
// `options.statuses` du réducteur) : la table des statuts, de même un registre de
// contenu (marbles/content/statuses/index.js) ; absente, aucune (NO_STATUSES).
// Les règles (marbles/core/rules.js) lient les deux tables une fois pour toutes.

import { createSeed } from "../../lib/rng.js";
import { UNKNOWN_MARBLE, isOptionalChoice } from "./effects.js";
import { SLOTS, nextSlot, previousSlot } from "./zones.js";
import { emptyTally } from "./tally.js";
import { TALLY_COUNTERS, maxWearOf } from "./content.js";
import { validateGameDefinition } from "./validation.js";
import { buildRulesOf, endReached, gameResult, startValue, startingList, tierOf, turnLimit } from "./definitions.js";
import { NO_BAGS, bagProblems, describeProblem, validateBagFormat } from "./bags.js";
import { BAG_BUILD_RULES } from "../config/values.js";
import { drawMarbles, holdReactions, intercept, noteModification, shuffled, sourceOf, transact } from "./run.js";
import { answerOf, chooseRefusal, targetRef } from "./choices.js";
import { retireMarble, travel } from "./path.js";
import { LOCKS, NO_STATUSES, activatePending, characteristic, endTurn, isLocked, lockingInstance, modifyQuantity, ruleInstance } from "./statuses.js";

export { SLOTS, nextSlot, previousSlot };

// Codes de refus (voir l'en-tête). Une liste pour que chaque code ait son
// texte, vérifié par les vérifications (domaine marbles-view).
export const MARBLE_ERRORS = [
  "gameOver",
  "mustDraw",
  "alreadyDrawn",
  "unknownAction",
  "invalidSlot",
  "invalidHandIndex",
  "swapAlreadyUsed",
  "swapAfterPlacement",
  "swapSameSlot",
  "swapBothEmpty",
  "noThrowsLeft",
  "choicePending",
  "noChoicePending",
  "invalidChoice",
  "choiceRequired",
  // Les VERROUS d'action (marbles/core/statuses.js/LOCKS) : le refus porte le statut en
  // cause (`lockedBy`).
  "swapLocked",
  "replacementLocked",
];

// Vitesse × Masse d'un tour. Les planchers valent pour ce calcul final, jamais
// pendant l'accumulation : une Vitesse à -3 que la phase suivante remonte de 4
// finit à 1.
export function impactOf(speed, mass) {
  return Math.max(0, speed) * Math.max(1, mass);
}

// --- Mise en place ---

// LE DÉPART D'UNE PARTIE, d'après sa définition et, pour un sac du joueur, le sac
// fourni. `seed` : nombre ou chaîne (lib/rng.js/createSeed). `definition` : la
// définition de la partie (marbles/core/definitions.js), validée ici, puis copiée dans
// l'état ; son sac (en-tête, « la copie de partie »), mélangé par le hasard de la
// partie ; ses règles, des statuts verrouillés posés dès le départ, en silence
// (marbles/core/statuses.js/ruleInstance). -> { ok: true, state, problems: [] }, ou { ok: false, state: null, problems }
// pour un sac du joueur invalide (marbles/core/bags.js/bagProblems) : la partie refuse
// de démarrer. Une définition mal formée, un sac mal formé, un sac fourni à une
// définition qui impose ou génère le sien, ou aucun sac pour un sac du joueur LÈVENT :
// des fautes de programmation ou de données, pas un choix du joueur.
// `options` :
//   bag        le sac du joueur (source "player"), null sinon ;
//   unlocked   les ids des billes débloquées (la collection, par son fournisseur), ou
//              null pour ne pas la consulter ;
//   presets    le registre des sacs préfaits, que cite un sac imposé ;
//   unchecked  vrai : les règles de construction ne s'appliquent pas (les outils, pour
//              essayer un sac hors règles) ; une bille inconnue reste refusée.
export function startMarblesGame(seed, definition, types, statuses = NO_STATUSES, { bag = null, unlocked = null, presets = NO_BAGS, unchecked = false } = {}) {
  validateGameDefinition(definition, types, statuses, presets);
  const source = definition.bag.kind;
  if (source !== "player" && bag !== null) {
    throw new Error(`marbles, définition "${definition.id}" : elle ${source === "preset" ? "impose" : "génère"} son sac, aucun sac à fournir.`);
  }
  if (source === "player") {
    if (bag === null) throw new Error(`marbles, définition "${definition.id}" : un sac du joueur est attendu.`);
    validateBagFormat(bag);
    const problems = bagProblems(bag, unchecked ? {} : buildRulesOf(definition, BAG_BUILD_RULES), { types, unlocked: unchecked ? null : unlocked });
    if (problems.length > 0) return { ok: false, state: null, problems };
  }
  const received = source === "player" ? bag : source === "preset" ? presets[definition.bag.bag] : null;
  const list = startingList(definition, seed, types, received);
  const shuffle = shuffled(list, createSeed(seed));
  return {
    ok: true,
    problems: [],
    state: {
      rngState: shuffle.rngState,
      definition: structuredClone(definition),
      bagOrigin: { id: received?.id ?? null, size: list.length },
      turn: 1,
      score: 0,
      speed: 0,
      mass: 1,
      stage: "draw",
      bag: shuffle.list,
      hand: [],
      discard: [],
      triangle: { leftBase: null, rightBase: null, apex: null },
      pot: [],
      lost: [],
      swapUsed: false,
      throwsUsed: 0,
      // Les valeurs de partie, à zéro : la portée « cette partie » ne revient à zéro
      // qu'ici.
      tally: emptyTally(TALLY_COUNTERS),
      // Les règles de la partie, en tête des statuts ; aucun autre.
      statuses: definition.rules.map(ruleInstance),
      // Aucun choix en attente.
      pendingChoice: null,
      // Pas encore de résultat.
      result: null,
    },
  };
}

// Une partie neuve, ou une erreur qui liste les problèmes du sac : startMarblesGame
// pour qui n'a pas de joueur à qui les dire (les outils, les vérifications).
export function createMarblesGame(seed, definition, types, statuses = NO_STATUSES, options = {}) {
  const start = startMarblesGame(seed, definition, types, statuses, options);
  if (!start.ok) throw new Error(`marbles, définition "${definition.id}" : sac "${options.bag?.id}" refusé (${start.problems.map(describeProblem).join(" ; ")}).`);
  return start.state;
}

// --- Refus ---

// Exportée pour la prévision, qui suit la même règle. Un choix en attente bloque
// tout le reste : il faut d'abord y répondre.
export function stageRefusal(state, expected) {
  if (state.pendingChoice) return "choicePending";
  if (state.stage === "over") return "gameOver";
  if (state.stage === expected) return null;
  return expected === "draw" ? "alreadyDrawn" : "mustDraw";
}

function isSlot(slot) {
  return SLOTS.includes(slot);
}

// Peut-on encore lancer un échange ce tour-ci, avant même de choisir les
// emplacements ? Le code du refus, ou null. Exportée pour que l'interface
// refuse dès la prise, avec la règle du core au lieu d'une copie. Un échange
// VERROUILLÉ (marbles/core/statuses.js/LOCKS) l'est avant tout le reste du tour.
export function swapRefusal(state, statuses = NO_STATUSES) {
  const refusal = stageRefusal(state, "play");
  if (refusal) return refusal;
  if (isLocked(state.statuses, statuses, "swap")) return LOCKS.swap.refusal;
  if (state.swapUsed) return "swapAlreadyUsed";
  if (state.throwsUsed > 0) return "swapAfterPlacement"; // l'échange précède la pose
  return null;
}

// Les lancers qui restent ce tour : la caractéristique « lancers » en vigueur
// (statuts compris : un lancer de plus reçu pendant le tour s'ajoute aussitôt), moins
// ceux déjà joués ; jamais moins de zéro.
export function throwsLeft(state, statuses = NO_STATUSES) {
  return Math.max(0, characteristic(state, "throws", statuses) - state.throwsUsed);
}

// La PIOCHE DU PROCHAIN DÉBUT DE TOUR, telle qu'elle se ferait, sans rien consommer
// (une charge reste) : avant la pioche du tour, celle de ce tour ; sinon celle du
// tour suivant, les statuts comme ils seront alors (la fin de ce tour, puis
// l'activation de ceux en attente). Lue par l'annonce du sac (touche S).
export function nextTurnDraw(state, statuses = NO_STATUSES) {
  if (state.stage === "draw") return modifyQuantity(state.statuses, statuses, "turnDraw", turnDrawOf(state)).value;
  const ended = isLastTurn(state) ? state.statuses : endTurn(state.statuses, statuses).instances;
  return modifyQuantity(activatePending(ended).instances, statuses, "turnDraw", startValue(state, "drawPerTurn")).value;
}

// Peut-on encore lancer une bille ce tour-ci, avant même de la choisir ? Le code
// du refus, ou null. Exportée pour que l'interface refuse dès la prise.
export function throwRefusal(state, statuses = NO_STATUSES) {
  const refusal = stageRefusal(state, "play");
  if (refusal) return refusal;
  if (throwsLeft(state, statuses) <= 0) return "noThrowsLeft";
  return null;
}

// Cette pose est-elle permise ? Le code du refus, ou null. Exportée pour que
// l'interface ne demande pas de confirmer une pose qui serait refusée. Le joueur
// est seul responsable de ses poses : rien ne le protège d'un triangle qu'il ne
// pourrait plus remplir, au premier tour comme ensuite.
export function placeRefusal(state, handIndex, slot, statuses = NO_STATUSES) {
  const refusal = throwRefusal(state, statuses);
  if (refusal) return refusal;
  if (!isSlot(slot)) return "invalidSlot";
  if (!Number.isInteger(handIndex) || handIndex < 0 || handIndex >= state.hand.length) return "invalidHandIndex";
  // Une bille piochée à l'aveugle n'a pas d'identité : rien à poser.
  if (state.hand[handIndex].marble === UNKNOWN_MARBLE) return "invalidHandIndex";
  // Un remplacement verrouillé : la pose sur un emplacement occupé seulement.
  if (state.triangle[slot] !== null && isLocked(state.statuses, statuses, "replacement")) return LOCKS.replacement.refusal;
  return null;
}

// LA RAISON d'un refus de VERROU (`code`, un code de LOCKS) : le statut qui verrouille,
// { status, rule } (`rule`, vrai pour une règle de la partie), ou null pour un autre
// refus. Portée par le résultat du réducteur (`lockedBy`) ; l'interface la dit.
export function lockReason(state, code, statuses = NO_STATUSES) {
  const lock = Object.keys(LOCKS).find((id) => LOCKS[id].refusal === code);
  if (lock === undefined) return null;
  const instance = lockingInstance(state.statuses, statuses, lock);
  return instance === null ? null : { status: instance.status, rule: instance.locked === true };
}

// Peut-on résoudre le tour ? Le code du refus, ou null : à tout moment de la phase
// de jeu, quel que soit l'état du triangle (plein, partiel ou vide), premier tour
// compris. Un emplacement vide saute sa phase.
function resolveRefusal(state) {
  return stageRefusal(state, "play");
}

// LECTURE PURE, sans effet sur les règles : toutes les actions que le réducteur
// accepterait maintenant, dans un ordre fixe (pioche ; échanges, chaque paire une
// fois, dans l'ordre des emplacements ; poses, bille de la main puis emplacement ;
// résolution). Elle passe par les mêmes refus que le réducteur, sans en recopier
// aucun. Sert aux joueurs automatiques des outils (marbles/tools/players.js).
export function legalActions(state, statuses = NO_STATUSES) {
  // Un choix en attente : ses cibles, puis Terminer s'il est permis.
  if (state.pendingChoice) {
    const { eligible } = state.pendingChoice;
    const finish = isOptionalChoice(state.pendingChoice) ? [{ type: "choose", done: true }] : [];
    return [...eligible.map((target) => ({ type: "choose", target: targetRef(target) })), ...finish];
  }
  if (stageRefusal(state, "draw") === null) return [{ type: "draw" }];
  const actions = [];
  SLOTS.forEach((a, index) => {
    for (const b of SLOTS.slice(index + 1)) if (swapRefused(state, { a, b }, statuses) === null) actions.push({ type: "swap", a, b });
  });
  state.hand.forEach((_, handIndex) => {
    for (const slot of SLOTS) if (placeRefusal(state, handIndex, slot, statuses) === null) actions.push({ type: "place", handIndex, slot });
  });
  if (resolveRefusal(state) === null) actions.push({ type: "resolve" });
  return actions;
}

function refused(state, error, statuses = NO_STATUSES) {
  const lockedBy = lockReason(state, error, statuses);
  return { ok: false, state, events: [], error, ...(lockedBy === null ? {} : { lockedBy }) };
}

// --- Fin de partie ---

// LA FIN DE PARTIE : une condition de fin atteinte (marbles/core/definitions.js/
// END_CONDITIONS), vérifiée à ses moments fixes : après l'Impact d'une résolution
// (cible atteinte, tour d'endurance raté, dernier tour), et à la pioche du début de
// tour (plus aucune bille à jouer). Une pioche seulement partielle, ou vide alors qu'il
// reste des billes en jeu, se dit (drawSkipped) et le tour se joue avec ce qu'on a.
// Le dernier tour de la définition, s'il en a un : lu par la fin des statuts et la
// pioche du prochain tour (nextTurnDraw).
function isLastTurn(state) {
  const limit = turnLimit(state);
  return limit !== null && state.turn >= limit;
}

// La pioche du début du tour en cours, avant ses modificateurs : celle du premier tour,
// ou celle des suivants (les valeurs de départ de la définition).
function turnDrawOf(state) {
  return startValue(state, state.turn === 1 ? "firstTurnDraw" : "drawPerTurn");
}

// La partie s'arrête par la condition `end` : son résultat selon son objectif, dans
// l'état et dans l'évènement.
function endGame(run, end) {
  const result = gameResult(run.state, end);
  run.update({ stage: "over", result });
  run.emit({ type: "gameOver", score: run.state.score, result });
}

// Début de tour : les billes déjà en main y passent un tour de plus, puis la pioche,
// `firstTurnDraw` billes au premier tour, `drawPerTurn` ensuite (les valeurs de départ
// de la définition) ; une bille piochée
// maintenant reste donc à 0. Une pioche impossible ne finit jamais la partie : le
// tour se joue avec la main qu'on a.
function drawTurn(run) {
  run.emit({ type: "turnStarted", turn: run.state.turn, turnCount: turnLimit(run.state) });
  // Les statuts « le prochain tour » s'activent, en silence, avant la pioche : une
  // main agrandie compte dès elle.
  const { instances, activated } = activatePending(run.state.statuses);
  if (activated.length > 0) {
    run.update({ statuses: instances });
    for (const status of activated) run.emit({ type: "statusActivated", status });
  }
  run.update({ hand: run.state.hand.map((held) => ({ ...held, turnsInHand: held.turnsInHand + 1 })) });
  // Le nombre à piocher passe par ses modificateurs (turnDraw) ; la pioche s'arrête
  // ensuite à ses limites habituelles (main pleine, plus de billes).
  const drawChange = intercept(run, modifyQuantity, "turnDraw", turnDrawOf(run.state));
  noteModification(run, drawChange, null);
  drawMarbles(run, drawChange.value, "turn");
  run.update({ stage: "play", swapUsed: false, throwsUsed: 0 });
  // Les conditions de fin de la pioche : plus rien à jouer, le tour n'a pas lieu.
  const end = endReached(run.state, "turnDraw");
  if (end !== null) endGame(run, end);
}

// Échange : le contenu de deux emplacements, usure comprise. Un emplacement
// vide fait de l'échange un simple déplacement ; deux vides n'échangeraient
// rien et gâcheraient l'échange du tour, c'est refusé. Ni Tic ni Éjection.
function swapRefused(state, { a, b }, statuses = NO_STATUSES) {
  const refusal = swapRefusal(state, statuses);
  if (refusal) return refusal;
  if (!isSlot(a) || !isSlot(b)) return "invalidSlot";
  if (a === b) return "swapSameSlot";
  if (state.triangle[a] === null && state.triangle[b] === null) return "swapBothEmpty";
  return null;
}

function swapSlots(run, { a, b }) {
  const { triangle } = run.state;
  run.update({ triangle: { ...triangle, [a]: triangle[b], [b]: triangle[a] }, swapUsed: true });
  run.emit({ type: "swapped", a, b });
}

// Pose, un LANCER (la confirmation est l'affaire de l'interface). D'abord, toujours,
// la bille quitte la main (son compteur avec elle) et sa Chiquenaude joue : en cours
// de lancer, elle n'est ni en main ni sur le triangle. Puis, sur un emplacement
// occupé, le trajet de l'occupante (marbles/core/path.js/travel, cause
// "replacement") : son départ, elle en partance ; la nouvelle bille rejoint
// l'emplacement et son Tic joue (`meanwhile`), l'occupante toujours en partance,
// que le Tic peut rediriger ; puis l'Éjection de l'occupante et son arrivée (la
// défausse sauf redirection). L'ordre que voit le joueur : la bille posée frappe,
// puis la délogée réagit en partant. Sur un emplacement vide, la bille le rejoint
// seulement. L'emplacement se lit APRÈS la Chiquenaude : si elle l'a vidé (une
// Fêlure qui retire l'occupante, Final compris), la pose se poursuit comme sur un
// vide, sans Éjection ni Tic.
function placeMarble(run, { handIndex, slot }) {
  const { marble, turnsInHand } = run.state.hand[handIndex];
  run.update({ hand: run.state.hand.filter((_, index) => index !== handIndex), throwsUsed: run.state.throwsUsed + 1 });
  // En transit de sa sortie de la main à son arrivée sur l'emplacement : dans aucune
  // zone, mais un choix ouvert entre-temps la connaît (transact, inTransit). Une
  // action ne pose qu'une bille : la liste n'en a jamais qu'une.
  const thrown = { kind: "thrown", marble, slot };
  run.inTransit = [...run.inTransit, thrown];
  run.emit({ type: "flick", slot, marble, turnsInHand });

  const previous = run.state.triangle[slot];
  // Le remplacement en cours, que Tic et Éjection portent (conditions de calibre).
  const replacement = previous === null ? null : { placed: marble, ejected: previous.marble };
  // L'arrivée de la bille lancée : son emplacement, puis, sur un remplacement, son Tic,
  // réglé jusqu'au bout (run.settle) avant l'Éjection de la délogée.
  const arrive = () => {
    run.update({ triangle: { ...run.state.triangle, [slot]: { marble, wear: 0 } } });
    run.inTransit = run.inTransit.filter((other) => other !== thrown);
    run.settle({ type: "placed", slot, marble });
    if (replacement !== null) run.settle({ type: "hit", slot, marble, replacement });
  };
  if (previous === null) {
    arrive();
    return;
  }
  const exit = { type: "knockout", slot, marble: previous.marble, replacement };
  travel(run, { marble: previous.marble, from: { zone: "triangle", slot }, cause: "replacement", exit, meanwhile: arrive });
}

// Les crans de la rotation de fin de tour, portés par l'évènement `rotation` : la vue
// les lit là (narration, roulements), sans les supposer.
const ROTATION_NOTCHES = 1;

// Un cran de rotation : chaque bille avance vers son emplacement SUIVANT, dans le
// sens horaire (marbles/core/effects.js/nextSlot). Les emplacements vides tournent
// aussi. La vue suit la même règle pour faire rouler les billes (nextSlot).
function rotated(triangle) {
  return Object.fromEntries(SLOTS.map((slot) => [nextSlot(slot), triangle[slot]]));
}

// Plus de bonus une fois la résolution finie : il ne vaut que pour ce tour.
function withoutBonus(placed) {
  return placed === null ? null : { marble: placed.marble, wear: placed.wear };
}

function resolvePhases(run) {
  for (const slot of SLOTS) {
    run.phasesStarted.add(slot);
    const placed = run.state.triangle[slot];
    if (placed === null) {
      run.emit({ type: "phaseSkipped", slot });
      continue;
    }
    const { marble } = placed;
    run.emit({ type: "phase", slot, marble });
    // L'effet d'abord (un Polissage ou une Fêlure sur elle-même compris), puis son
    // +1 d'usure, sur l'usure d'après l'effet. Une bille retirée par sa propre
    // Fêlure ne s'use plus. Elle joue son effet même si cette usure l'amène à son
    // maximum.
    const after = run.state.triangle[slot];
    if (after === null) continue;
    // Le +1 passe par ses modificateurs (phaseWear), puis l'usure se plafonne à son
    // maximum : ramené à 0, la bille ne s'use pas (l'évènement le dit, usure
    // inchangée) ; augmenté jusqu'au maximum, elle part à l'étape des retraits.
    const maxWear = maxWearOf(marble, run.types);
    const added = intercept(run, modifyQuantity, "phaseWear", 1, sourceOf(run, marble));
    const wear = Math.min(maxWear, after.wear + added.value);
    run.update({ triangle: { ...run.state.triangle, [slot]: { marble, wear } } });
    run.emit({ type: "wear", slot, marble, wear, maxWear });
    noteModification(run, added, { trigger: "phase", slot, marble });
  }
}

// L'étape du POT, une fois par tour : après les trois phases, avant les retraits par
// usure, chaque bille du pot dans l'ordre d'arrivée, BILLE PAR BILLE : ses réactions
// retenues pendant les phases (`held.pot`, run.js/holdReactions), dans l'ordre où
// elles sont survenues, puis son effet En poche à chaque résolution. Une bille entrée
// au pot pendant les phases ou pendant cette étape a aussi les siennes, après les
// autres ; le pot étant borné, l'étape l'est aussi. Puis les réactions retenues des
// statuts (`held.statuses`), dans l'ordre où elles sont survenues : le triangle, puis
// le pot, puis les statuts, l'ordre unique des réactions.
// Un POT verrouillé (marbles/core/statuses.js/LOCKS) n'a pas d'étape : aucun
// évènement, ses réactions retenues comprises ; celles des statuts jouent.
function resolvePot(run, held) {
  if (!isLocked(run.state.statuses, run.statuses, "pot")) {
    for (let index = 0; index < run.state.pot.length; index++) {
      for (const reaction of held.pot) if (reaction.index === index) run.emit(reaction);
      run.emit({ type: "potResolution", index, marble: run.state.pot[index] });
    }
  }
  for (const reaction of held.statuses) run.emit(reaction);
}

// Les retraits par usure, dans l'ordre horaire. Pour chaque bille usée : elle
// quitte son emplacement, rejoint la défausse, puis son Final se déclenche (le seul
// retrait qui en ait un : ni l'éjection ni l'échange). Ses valeurs comptent pour le
// tour en cours ; une Pioche y passe par la pioche unifiée.
function retireWornMarbles(run) {
  for (const slot of SLOTS) {
    const placed = run.state.triangle[slot];
    if (placed === null || placed.wear < maxWearOf(placed.marble, run.types)) continue;
    retireMarble(run, slot);
  }
}

const RESOLVE = Object.freeze({ type: "resolve" });

// La résolution, sans les refus, dans cet ordre : phases, pot, retraits par usure (et
// ce qu'ils déclenchent), Impact (passé par les modificateurs des statuts), rotation,
// fin des statuts qui s'arrêtent à ce tour, fin de tour. Les retraits passent
// AVANT l'Impact : ce qu'ils déclenchent compte pour le tour en cours. La vraie,
// celle de l'action "resolve" comme celle de la prévision
// (marbles/core/forecast.js). Jamais la pioche du tour : seuls des effets y
// piochent.
export function runResolution(state, types, options = {}) {
  return replayAction(state, RESOLVE, types, options);
}

function resolveTurn(run) {
  // Le triangle d'abord, en entier : ce que ses phases font réagir (le pot, les
  // statuts) attend l'étape du pot.
  const held = holdReactions(run, () => resolvePhases(run));
  resolvePot(run, held);
  retireWornMarbles(run);

  const { speed, mass } = run.state;
  // L'Impact habituel, puis ses modificateurs (Coup double), plancher 0 ; l'évènement
  // porte la valeur finale, ce qu'ont fait les statuts se dit après lui.
  const change = intercept(run, modifyQuantity, "impact", impactOf(speed, mass));
  const impact = change.value;
  const before = run.state.score;
  const score = before + impact;
  run.update({ score });
  run.emit({ type: "impact", speed, mass, impact, score });
  noteModification(run, change, null);
  noteTier(run, before);
  // Les conditions de fin d'après l'Impact : la résolution se termine comme au
  // dernier tour, puis la partie s'arrête.
  const end = endReached(run.state, "afterImpact", { impact });

  const { leftBase, rightBase, apex } = run.state.triangle;
  let triangle = { leftBase: withoutBonus(leftBase), rightBase: withoutBonus(rightBase), apex: withoutBonus(apex) };
  for (let notch = 0; notch < ROTATION_NOTCHES; notch++) triangle = rotated(triangle);
  run.update({ triangle, speed: 0, mass: 1 });
  run.emit({ type: "rotation", triangle, notches: ROTATION_NOTCHES });
  // Les statuts comptés en tours en voient un de moins ; à zéro, ils prennent fin,
  // dans l'ordre d'acquisition. Pas au dernier tour : la partie s'arrête là.
  if (end === null) expireStatuses(run);
  run.emit({ type: "turnEnded", turn: run.state.turn });

  if (end !== null) endGame(run, end);
  else run.update({ turn: run.state.turn + 1, stage: "draw" });
}

// PALIER ATTEINT (partie libre) : l'Impact a fait passer le score au palier supérieur
// (le plus haut atteint, s'il en franchit plusieurs d'un coup), dit aussitôt.
function noteTier(run, before) {
  const { goal } = run.state.definition;
  if (goal.kind !== "free") return;
  const tier = tierOf(run.state.score, goal.tiers);
  if (tier !== tierOf(before, goal.tiers)) run.emit({ type: "tierReached", tier, score: run.state.score });
}

// La fin de tour des statuts (marbles/core/statuses.js/endTurn), chaque fin dite.
function expireStatuses(run) {
  const { instances, expired } = endTurn(run.state.statuses, run.statuses);
  run.update({ statuses: instances });
  for (const status of expired) run.emit({ type: "statusExpired", status });
}

// Le déroulé de chaque action qui joue des effets, celui que la reprise rejoue.
const BODIES = {
  draw: drawTurn,
  swap: swapSlots,
  place: placeMarble,
  resolve: resolveTurn,
};

// Rejoue `action` depuis `state` (l'état d'avant elle, ses refus déjà passés), avec
// ces réponses aux choix : la reprise d'une action suspendue. Exportée pour la
// prévision, qui rejoue à l'aveugle pour évaluer une réponse.
export function replayAction(state, action, types, options = {}) {
  return transact(state, types, options, (run) => BODIES[action.type](run, action), action);
}

// Le réducteur : pur, ne modifie jamais `state`. Même état + même action =
// même résultat. `options` (facultatif) :
//   eventLimit  la limite du bus pour chaque chaîne, abaissée par les vérifications
//               (au-delà, la chaîne est coupée : chainInterrupted) ;
//   blind       le déroulé À L'AVEUGLE, celui de la prévision : aucune pioche n'y lit
//               l'identité d'une bille ni le hasard de la partie (drawOne) ;
//   statuses    la table des statuts (en-tête), NO_STATUSES par défaut.
export function marblesReduce(state, action, types, options = {}) {
  let refusal;
  switch (action?.type) {
    case "draw":
      refusal = stageRefusal(state, "draw");
      return refusal ? refused(state, refusal) : replayAction(state, { type: "draw" }, types, options);
    case "swap":
      refusal = swapRefused(state, action, options.statuses);
      return refusal ? refused(state, refusal, options.statuses) : replayAction(state, action, types, options);
    case "place":
      refusal = placeRefusal(state, action.handIndex, action.slot, options.statuses);
      return refusal ? refused(state, refusal, options.statuses) : replayAction(state, action, types, options);
    case "resolve":
      refusal = resolveRefusal(state);
      return refusal ? refused(state, refusal) : replayAction(state, RESOLVE, types, options);
    case "choose": {
      // La réponse au choix en attente : l'action suspendue est rejouée depuis son
      // état de départ, avec une réponse de plus (voir l'en-tête, « reprise par
      // rejeu ») ; seuls les évènements d'après la suspension sont rendus.
      refusal = chooseRefusal(state, action);
      if (refusal) return refused(state, refusal);
      const { from, action: suspended, answers, seen, eventLimit } = state.pendingChoice.resume;
      return replayAction(from, suspended, types, {
        ...options,
        eventLimit: options.eventLimit ?? eventLimit,
        answers: [...answers, answerOf(state.pendingChoice, action)],
        seen,
      });
    }
    default:
      return refused(state, "unknownAction");
  }
}
