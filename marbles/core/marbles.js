// JEU DES BILLES — le RÉDUCTEUR : l'état, la mise en place, les refus et les
// actions (marblesReduce). Simulation pure : aucun DOM, aucun son, aucun aléa non
// seedé. Règles, format des billes et interface : doc/marbles.md.
// TROIS MODULES, du plus fondamental au réducteur :
//   marbles/core/content.js  le contenu : validation des déclarations et d'une table
//                            de billes, valeurs de partie, mots-clés, et le JOURNAL
//                            (ses évènements, décrits dans son en-tête) ;
//   marbles/core/run.js      le déroulé d'une action : bus et écouteurs, effets,
//                            choix, actions sur une bille, pioche, retraits ;
//   marbles/core/marbles.js          ce fichier : l'état, les refus, les actions.
//
// ÉTAT sérialisable, à part entière (jamais lié à la session du jeu principal,
// aucune persistance aujourd'hui) :
//   { rngState, maxHandSize, throwsPerTurn, potCapacity, firstTurnDraw, drawPerTurn,
//     turnCount, turn, score, speed, mass, stage, bag, hand, discard,
//     triangle, pot, lost, swapUsed, throwsUsed, tally, pendingChoice }
// `pot` : les billes EN POCHE, des ids dans l'ordre d'arrivée, au plus
// `potCapacity` ; `lost` : les billes PERDUES, envoyées au pot plein. Ni l'une ni
// l'autre ne revient jamais dans le sac, ni ne quitte sa zone.
// `tally` : les VALEURS DE PARTIE, { <id>: { turn, game } } (marbles/core/tally.js, le
// seul à les écrire ; les compteurs : marbles/core/counters.js, TALLY_COUNTERS), tenues
// à l'émission de chaque évènement du journal (marbles/core/run.js/transact). Une
// bille du pot peut réagir à chaque incrément d'un compteur ÉCOUTABLE (En poche, à
// chaque (occurrence) : marbles/core/run.js/pocketReactionsOf).
// `throwsUsed` : les LANCERS joués ce tour (une pose depuis la main en est un,
// l'échange non), jamais plus que `throwsPerTurn`.
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
// `speed` et `mass` sont les compteurs du tour : Tic et Éjection les modifient
// avant la résolution, qui part de ces valeurs. Ils reviennent à 0 et 1 à la fin
// de chaque résolution.
//
// `stage` découpe le tour : "draw" (la pioche reste à faire), "play" (échange
// et pose, jusqu'à la résolution), "over" (partie finie, après la résolution du
// tour `turnCount`, la seule fin de partie). À la fin d'une résolution, `turn`
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
//   { type: "choose", done: true }              termine un choix « jusqu'à N »
// Résultat, toujours la même forme : { ok, state, events, error }. Refus :
// ok false, `state` inchangé, `events` vide, `error` un code de MARBLE_ERRORS
// (son texte : `marbles.error.<code>`). Rien n'est jamais levé pour une
// action interdite.
//
// JOURNAL — `events`, dans l'ordre où ça se passe : ses évènements sont décrits dans
// l'en-tête de marbles/core/content.js (JOURNAL_EVENTS).
//
// `types` (paramètre OBLIGATOIRE des fonctions qui lisent une bille) : la table
// des billes, un registre de contenu (marbles/content/types/index.js) que ce module
// n'importe jamais (CLAUDE.md) : la vue, les outils et les vérifications le lui
// passent. Les vérifications y passent aussi des tables fabriquées, qui testent
// ce qu'aucune bille actuelle ne produit (une Masse négative).

import { MARBLES_SETTINGS, STARTING_BAG } from "../config/values.js";
import { createSeed } from "../../lib/rng.js";
import { SLOTS, effectAt, isOptionalChoice, nextSlot, previousSlot } from "./effects.js";
import { emptyTally } from "./tally.js";
import { TALLY_COUNTERS, maxWearOf, validateGameSettings } from "./content.js";
import { UNKNOWN_MARBLE, answerOf, chooseRefusal, drawMarbles, retireMarble, shuffled, targetRef, transact, travel, update } from "./run.js";

export { SLOTS, effectAt, nextSlot, previousSlot };

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
];

// Vitesse × Masse d'un tour. Les planchers valent pour ce calcul final, jamais
// pendant l'accumulation : une Vitesse à -3 que la phase suivante remonte de 4
// finit à 1.
export function impactOf(speed, mass) {
  return Math.max(0, speed) * Math.max(1, mass);
}

// --- Mise en place ---

// `seed` : nombre ou chaîne (lib/rng.js/createSeed). `options` ({} pour aucune) :
// bag et les réglages de MARBLES_SETTINGS propres à une partie.
export function createMarblesGame(seed, options = {}, types) {
  const {
    bag = STARTING_BAG,
    maxHandSize = MARBLES_SETTINGS.maxHandSize,
    throwsPerTurn = MARBLES_SETTINGS.throwsPerTurn,
    potCapacity = MARBLES_SETTINGS.potCapacity,
    firstTurnDraw = MARBLES_SETTINGS.firstTurnDraw,
    drawPerTurn = MARBLES_SETTINGS.drawPerTurn,
    turnCount = MARBLES_SETTINGS.turnCount,
  } = options;
  validateGameSettings({ maxHandSize, throwsPerTurn, potCapacity, firstTurnDraw, drawPerTurn, turnCount, bag }, types);
  const shuffle = shuffled(bag, createSeed(seed));
  return {
    rngState: shuffle.rngState,
    maxHandSize,
    throwsPerTurn,
    potCapacity,
    firstTurnDraw,
    drawPerTurn,
    turnCount,
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
    // Aucun choix en attente.
    pendingChoice: null,
  };
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
// refuse dès la prise, avec la règle du core au lieu d'une copie.
export function swapRefusal(state) {
  const refusal = stageRefusal(state, "play");
  if (refusal) return refusal;
  if (state.swapUsed) return "swapAlreadyUsed";
  if (state.throwsUsed > 0) return "swapAfterPlacement"; // l'échange précède la pose
  return null;
}

// Les lancers qui restent ce tour.
export function throwsLeft(state) {
  return state.throwsPerTurn - state.throwsUsed;
}

// Peut-on encore lancer une bille ce tour-ci, avant même de la choisir ? Le code
// du refus, ou null. Exportée pour que l'interface refuse dès la prise.
export function throwRefusal(state) {
  const refusal = stageRefusal(state, "play");
  if (refusal) return refusal;
  if (throwsLeft(state) <= 0) return "noThrowsLeft";
  return null;
}

// Cette pose est-elle permise ? Le code du refus, ou null. Exportée pour que
// l'interface ne demande pas de confirmer une pose qui serait refusée. Le joueur
// est seul responsable de ses poses : rien ne le protège d'un triangle qu'il ne
// pourrait plus remplir, au premier tour comme ensuite.
export function placeRefusal(state, handIndex, slot) {
  const refusal = throwRefusal(state);
  if (refusal) return refusal;
  if (!isSlot(slot)) return "invalidSlot";
  if (!Number.isInteger(handIndex) || handIndex < 0 || handIndex >= state.hand.length) return "invalidHandIndex";
  // Une bille piochée à l'aveugle n'a pas d'identité : rien à poser.
  if (state.hand[handIndex].marble === UNKNOWN_MARBLE) return "invalidHandIndex";
  return null;
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
export function legalActions(state) {
  // Un choix en attente : ses cibles, puis Terminer s'il est permis.
  if (state.pendingChoice) {
    const { eligible } = state.pendingChoice;
    const finish = isOptionalChoice(state.pendingChoice) ? [{ type: "choose", done: true }] : [];
    return [...eligible.map((target) => ({ type: "choose", target: targetRef(target) })), ...finish];
  }
  if (stageRefusal(state, "draw") === null) return [{ type: "draw" }];
  const actions = [];
  SLOTS.forEach((a, index) => {
    for (const b of SLOTS.slice(index + 1)) if (swapRefused(state, { a, b }) === null) actions.push({ type: "swap", a, b });
  });
  state.hand.forEach((_, handIndex) => {
    for (const slot of SLOTS) if (placeRefusal(state, handIndex, slot) === null) actions.push({ type: "place", handIndex, slot });
  });
  if (resolveRefusal(state) === null) actions.push({ type: "resolve" });
  return actions;
}

function refused(state, error) {
  return { ok: false, state, events: [], error };
}

// --- Fin de partie ---

// LA fin de partie, la seule : la résolution du dernier tour, `turnCount`
// (marbles/config/values.js, MARBLES_SETTINGS). Ni le sac ni la main n'arrêtent la
// partie : une pioche impossible se dit (drawSkipped) et le tour se joue avec ce
// qu'on a, même rien. Des conditions de fin plus riches (modes de partie) seront
// conçues à neuf (doc/marbles-backlog.md).
function isLastTurn(state) {
  return state.turn >= state.turnCount;
}

function endGame(run) {
  update(run, { stage: "over" });
  run.emit({ type: "gameOver", score: run.state.score });
}

// Début de tour : les billes déjà en main y passent un tour de plus, puis la pioche,
// `firstTurnDraw` billes au premier tour, `drawPerTurn` ensuite ; une bille piochée
// maintenant reste donc à 0. Une pioche impossible ne finit jamais la partie : le
// tour se joue avec la main qu'on a.
function drawTurn(run) {
  const { state } = run;
  run.emit({ type: "turnStarted", turn: state.turn, turnCount: state.turnCount });
  update(run, { hand: run.state.hand.map((held) => ({ ...held, turnsInHand: held.turnsInHand + 1 })) });
  drawMarbles(run, state.turn === 1 ? state.firstTurnDraw : state.drawPerTurn, "turn");
  update(run, { stage: "play", swapUsed: false, throwsUsed: 0 });
}

// Échange : le contenu de deux emplacements, usure comprise. Un emplacement
// vide fait de l'échange un simple déplacement ; deux vides n'échangeraient
// rien et gâcheraient l'échange du tour, c'est refusé. Ni Tic ni Éjection.
function swapRefused(state, { a, b }) {
  const refusal = swapRefusal(state);
  if (refusal) return refusal;
  if (!isSlot(a) || !isSlot(b)) return "invalidSlot";
  if (a === b) return "swapSameSlot";
  if (state.triangle[a] === null && state.triangle[b] === null) return "swapBothEmpty";
  return null;
}

function swapSlots(run, { a, b }) {
  const { triangle } = run.state;
  update(run, { triangle: { ...triangle, [a]: triangle[b], [b]: triangle[a] }, swapUsed: true });
  run.emit({ type: "swapped", a, b });
}

// Pose, un LANCER (la confirmation est l'affaire de l'interface). D'abord, toujours,
// la bille quitte la main (son compteur avec elle) et sa Chiquenaude joue : en cours
// de lancer, elle n'est ni en main ni sur le triangle. Puis, sur un emplacement
// occupé, le trajet de l'occupante (marbles/core/run.js/travel, cause
// "replacement") : son départ, son Éjection pendant qu'elle est en partance, son
// arrivée (la défausse sauf redirection) ; puis la nouvelle bille rejoint
// l'emplacement, et son Tic. Sur un emplacement vide, la bille le rejoint
// seulement. L'emplacement se lit APRÈS la Chiquenaude : si elle l'a vidé (une
// Fêlure qui retire l'occupante, Final compris), la pose se poursuit comme sur un
// vide, sans Éjection ni Tic.
function placeMarble(run, { handIndex, slot }) {
  const { marble, turnsInHand } = run.state.hand[handIndex];
  update(run, { hand: run.state.hand.filter((_, index) => index !== handIndex), throwsUsed: run.state.throwsUsed + 1 });
  // En transit de sa sortie de la main à son arrivée sur l'emplacement : dans aucune
  // zone, mais un choix ouvert entre-temps la connaît (transact, inTransit). Une
  // action ne pose qu'une bille : la liste n'en a jamais qu'une.
  const thrown = { kind: "thrown", marble, slot };
  run.inTransit = [...run.inTransit, thrown];
  run.emit({ type: "flick", slot, marble, turnsInHand });

  const previous = run.state.triangle[slot];
  // Le remplacement en cours, que Tic et Éjection portent (conditions de calibre).
  const replacement = previous === null ? null : { placed: marble, ejected: previous.marble };
  if (previous !== null) {
    const exit = { type: "knockout", slot, marble: previous.marble, replacement };
    travel(run, { marble: previous.marble, from: { zone: "triangle", slot }, cause: "replacement", exit });
  }
  update(run, { triangle: { ...run.state.triangle, [slot]: { marble, wear: 0 } } });
  run.inTransit = run.inTransit.filter((other) => other !== thrown);
  run.emit({ type: "placed", slot, marble });
  if (previous !== null) run.emit({ type: "hit", slot, marble, replacement });
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
    const wear = after.wear + 1;
    update(run, { triangle: { ...run.state.triangle, [slot]: { marble, wear } } });
    run.emit({ type: "wear", slot, marble, wear, maxWear: maxWearOf(marble, run.types) });
  }
}

// L'étape du POT, une fois par tour : après les trois phases, avant les retraits par
// usure, chaque bille du pot dans l'ordre d'arrivée, pour son effet En poche à
// chaque résolution. Une bille entrée au pot pendant cette étape a aussi la sienne,
// après les autres ; le pot étant borné, l'étape l'est aussi.
function resolvePot(run) {
  for (let index = 0; index < run.state.pot.length; index++) run.emit({ type: "potResolution", index, marble: run.state.pot[index] });
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

// La résolution, sans les refus, dans cet ordre : phases, pot, retraits par usure (et
// ce qu'ils déclenchent), Impact, rotation, fin de tour. Les retraits passent
// AVANT l'Impact : ce qu'ils déclenchent compte pour le tour en cours. La vraie,
// celle de l'action "resolve" comme celle de la prévision
// (marbles/core/forecast.js). Jamais la pioche du tour : seuls des effets y
// piochent.
export function runResolution(state, types, options = {}) {
  return transact(state, types, options, resolveTurn, RESOLVE);
}

const RESOLVE = Object.freeze({ type: "resolve" });

function resolveTurn(run) {
  resolvePhases(run);
  resolvePot(run);
  retireWornMarbles(run);

  const { speed, mass } = run.state;
  const impact = impactOf(speed, mass);
  const score = run.state.score + impact;
  update(run, { score });
  run.emit({ type: "impact", speed, mass, impact, score });

  const { leftBase, rightBase, apex } = run.state.triangle;
  let triangle = { leftBase: withoutBonus(leftBase), rightBase: withoutBonus(rightBase), apex: withoutBonus(apex) };
  for (let notch = 0; notch < ROTATION_NOTCHES; notch++) triangle = rotated(triangle);
  update(run, { triangle, speed: 0, mass: 1 });
  run.emit({ type: "rotation", triangle, notches: ROTATION_NOTCHES });
  run.emit({ type: "turnEnded", turn: run.state.turn });

  if (isLastTurn(run.state)) endGame(run);
  else update(run, { turn: run.state.turn + 1, stage: "draw" });
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
//               l'identité d'une bille ni le hasard de la partie (drawOne).
export function marblesReduce(state, action, types, options = {}) {
  let refusal;
  switch (action?.type) {
    case "draw":
      refusal = stageRefusal(state, "draw");
      return refusal ? refused(state, refusal) : replayAction(state, { type: "draw" }, types, options);
    case "swap":
      refusal = swapRefused(state, action);
      return refusal ? refused(state, refusal) : replayAction(state, action, types, options);
    case "place":
      refusal = placeRefusal(state, action.handIndex, action.slot);
      return refusal ? refused(state, refusal) : replayAction(state, action, types, options);
    case "resolve":
      refusal = resolveRefusal(state);
      return refusal ? refused(state, refusal) : runResolution(state, types, options);
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
