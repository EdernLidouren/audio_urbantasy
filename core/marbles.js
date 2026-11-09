// JEU DES BILLES — simulation pure : aucun DOM, aucun son, aucun aléa non
// seedé. Règles, format des billes et interface : doc/marbles.md.
//
// ÉTAT sérialisable, à part entière (jamais lié à la session du jeu principal,
// aucune persistance aujourd'hui) :
//   { rngState, maxHandSize, throwsPerTurn, firstTurnDraw, drawPerTurn, turnCount,
//     turn, score, speed, mass, stage, endReason, bag, hand, discard, triangle,
//     swapUsed, throwsUsed }
// `throwsUsed` : les LANCERS joués ce tour (une pose depuis la main en est un,
// l'échange non), jamais plus que `throwsPerTurn`.
// bag, hand et discard sont des listes d'ids de billes (doublons permis). Une
// bille n'a d'usure que SUR le triangle, { marble, wear, bonus? } : une bille
// qui en sort perd donc son usure et son bonus par construction. `bonus`
// ({ speed, mass }), présent seulement si une autre bille lui en a donné un, va
// avec la bille dans un échange et disparaît à la fin de la résolution.
// Le sommet du sac est bag[0].
//
// `speed` et `mass` sont les compteurs du tour : Tic et Éjection les modifient
// avant la résolution, qui part de ces valeurs. Ils reviennent à 0 et 1 à la fin
// de chaque résolution.
//
// `stage` découpe le tour : "draw" (la pioche reste à faire), "play" (échange
// et pose, jusqu'à la résolution), "over" (partie finie, endReason dit
// pourquoi : une raison de END_CONDITIONS). À la fin d'une résolution, `turn`
// passe au tour suivant, sauf si la partie s'arrête : il reste alors sur le
// dernier tour joué, jamais « 10 sur 9 ».
//
// ACTIONS — marblesReduce(state, action, types) :
//   { type: "draw" }                            pioche du tour
//   { type: "swap", a, b }                      échange deux emplacements
//   { type: "place", handIndex, slot }          pose une bille de la main
//   { type: "resolve" }                         résout le tour, retrait, rotation
// Résultat, toujours la même forme : { ok, state, events, error }. Refus :
// ok false, `state` inchangé, `events` vide, `error` un code de MARBLE_ERRORS
// (son texte : `marbles.error.<code>`). Rien n'est jamais levé pour une
// action interdite.
//
// BUS ET ÉCOUTEURS — chaque action passe ses évènements par un bus
// (core/marbles-bus.js) : chacun entre au journal, puis les billes l'écoutent,
// toujours dans cet ordre : base gauche, base droite, pointe, puis la main de
// la première à la dernière (marbleListeners). EVENT_TRIGGERS dit quels
// évènements déclenchent un effet de bille ; les autres passent au journal sans
// effet associé, prêts à servir.
//
// JOURNAL — `events`, dans l'ordre où ça se passe. Interface et son s'appuient
// sur lui seul (view/marbles/narration.js, view/marbles/sounds.js) :
//   turnStarted { turn, turnCount }, draw { marble }, drawSkipped { reason },
//   bagRegenerated { size }, swapped { a, b },
//   knockout { slot, marble }, removed { slot, marble, cause },
//   discarded { slot, marble, cause }, placed { slot, marble },
//   hit { slot, marble },
//   phase { slot, marble }, phaseSkipped { slot },
//   effect { trigger, slot, marble, speedDelta, massDelta, draw, given, speed, mass },
//   wear { slot, marble, wear, maxWear },
//   impact { speed, mass, impact, score },
//   rotation { triangle }, turnEnded { turn }, gameOver { reason, score }.
// `cause` : "replacement" ou "wear". `trigger` : "phase", "hit" ou "knockout".
// drawSkipped `reason` : "handFull" (la bille reste au sac) ou "noMarbles" (sac
// et défausse vides). Une pioche, une régénération ou un arrêt de pioche peuvent
// avoir lieu à tout moment : début de tour, pose (un Tic qui pioche), résolution.
// À l'aveugle (prévision), `draw` a pour bille UNKNOWN_MARBLE.
// `given` : ce que l'effet a donné aux autres emplacements occupés,
// [{ slot, marble, speed, mass }]. `speedDelta` et `massDelta` comptent le bonus
// reçu : c'est le total effectif de la bille, tel qu'il s'annonce. `draw` : les
// billes que l'effet demande à piocher (Pioche), dont les `draw` qui le suivent
// disent combien l'ont vraiment été.
//
// `types` (paramètre OBLIGATOIRE des fonctions qui lisent une bille) : la table
// des billes, un registre de contenu (marbles/types/index.js) que ce module
// n'importe jamais (CLAUDE.md) : la vue, les outils et les vérifications le lui
// passent. Les vérifications y passent aussi des tables fabriquées, qui testent
// ce qu'aucune bille actuelle ne produit (une Masse négative).

import { MARBLES_SETTINGS, STARTING_BAG } from "../config/marbles-values.js";
import { createSeed, nextRandom } from "./rng.js";
import { rejectUnknownFields } from "../lib/validate.js";
import { MarbleEventLimitError, createEventBus } from "./marbles-bus.js";
import { SLOTS, addValues, effectAt, evaluateEffect, validateEffect } from "./marbles-effects.js";

export { SLOTS, effectAt };

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
  "placementBlocksTriangle",
  "noThrowsLeft",
  "triangleIncomplete",
  "eventLimit",
];

// --- Table des billes ---

// Échoue sur une table mal formée. La vraie est validée au démarrage
// (validateMarblesContent) ; exportée aussi pour vérifier le rejet sur des tables
// fabriquées.
export function validateMarbleTypes(types) {
  const fail = (message) => {
    throw new Error(`marbles : ${message}`);
  };
  if (Object.keys(types).length === 0) fail("table des billes vide.");
  for (const [id, type] of Object.entries(types)) {
    // `size` et `sound` : la taille et le profil sonore, présentation seulement,
    // jamais lus ici (validés par la vue, view/marbles/sounds.js).
    rejectUnknownFields(type, ["base", "baseVariant", "apex", "hit", "knockout", "maxWear", "size", "sound"], `bille "${id}"`, fail);
    for (const field of ["base", "apex", "hit", "knockout"]) {
      if (type[field] !== undefined) validateEffect(type[field], `bille "${id}", ${field}`, fail);
    }
    if (type.baseVariant !== undefined) {
      rejectUnknownFields(type.baseVariant, ["leftBase", "rightBase"], `bille "${id}", baseVariant`, fail);
      for (const [slot, effect] of Object.entries(type.baseVariant)) {
        validateEffect(effect, `bille "${id}", baseVariant.${slot}`, fail);
      }
    }
    if (type.maxWear !== undefined && (!Number.isInteger(type.maxWear) || type.maxWear < 1)) {
      fail(`bille "${id}" : maxWear doit être un entier >= 1.`);
    }
  }
}

// La valeur fausse échouerait sinon en pleine partie. Le premier tour exige un
// triangle plein et la main ne se recomplète qu'au tour suivant : une première
// pioche plus petite que le triangle laisserait la partie sans issue.
function validateGameSettings({ maxHandSize, throwsPerTurn, firstTurnDraw, drawPerTurn, turnCount, bag }, types) {
  const positive = { maxHandSize, throwsPerTurn, firstTurnDraw, drawPerTurn, turnCount };
  for (const [name, value] of Object.entries(positive)) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`marbles : ${name} doit être un entier >= 1.`);
  }
  if (firstTurnDraw < SLOTS.length) throw new Error(`marbles : firstTurnDraw doit valoir au moins ${SLOTS.length}.`);
  // Les poses obligatoires du premier tour sont des lancers.
  if (throwsPerTurn < SLOTS.length) throw new Error(`marbles : throwsPerTurn doit valoir au moins ${SLOTS.length}.`);
  if (maxHandSize < firstTurnDraw) throw new Error("marbles : maxHandSize doit valoir au moins firstTurnDraw.");
  for (const id of bag) {
    if (!Object.hasOwn(types, id)) throw new Error(`marbles : bille inconnue "${id}" dans le sac.`);
  }
  // Le premier tour exige un triangle plein : un sac plus petit le bloquerait.
  if (bag.length < SLOTS.length) throw new Error(`marbles : le sac doit compter au moins ${SLOTS.length} billes.`);
}

// Le contenu du jeu des billes, au démarrage (main.js, l'audit du contenu) : la
// table, et les réglages avec le sac de test, qui ne doit citer que des billes
// connues. Une erreur ici échouerait sinon en pleine partie.
export function validateMarblesContent(types) {
  validateMarbleTypes(types);
  validateGameSettings({ ...MARBLES_SETTINGS, bag: STARTING_BAG }, types);
}

export function maxWearOf(marble, types) {
  return types[marble].maxWear ?? MARBLES_SETTINGS.defaultMaxWear;
}

// Vitesse × Masse d'un tour. Les planchers valent pour ce calcul final, jamais
// pendant l'accumulation : une Vitesse à -3 que la phase suivante remonte de 4
// finit à 1.
export function impactOf(speed, mass) {
  return Math.max(0, speed) * Math.max(1, mass);
}

// Une bille dont l'identité est cachée : au sac ou en défausse dans la copie de la
// prévision, ou piochée à l'aveugle (drawOne). Jamais dans une vraie partie.
export const UNKNOWN_MARBLE = null;

// --- Hasard ---

// Fisher-Yates sur une copie : toujours length - 1 pas de PRNG.
function shuffled(list, rngState) {
  const result = [...list];
  let state = rngState;
  for (let i = result.length - 1; i > 0; i--) {
    const draw = nextRandom(state);
    state = draw.state;
    const j = Math.floor(draw.value * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return { list: result, rngState: state };
}

// --- Mise en place ---

// `seed` : nombre ou chaîne (core/rng.js/createSeed). `options` ({} pour aucune) :
// bag et les réglages de MARBLES_SETTINGS propres à une partie.
export function createMarblesGame(seed, options = {}, types) {
  const {
    bag = STARTING_BAG,
    maxHandSize = MARBLES_SETTINGS.maxHandSize,
    throwsPerTurn = MARBLES_SETTINGS.throwsPerTurn,
    firstTurnDraw = MARBLES_SETTINGS.firstTurnDraw,
    drawPerTurn = MARBLES_SETTINGS.drawPerTurn,
    turnCount = MARBLES_SETTINGS.turnCount,
  } = options;
  validateGameSettings({ maxHandSize, throwsPerTurn, firstTurnDraw, drawPerTurn, turnCount, bag }, types);
  const shuffle = shuffled(bag, createSeed(seed));
  return {
    rngState: shuffle.rngState,
    maxHandSize,
    throwsPerTurn,
    firstTurnDraw,
    drawPerTurn,
    turnCount,
    turn: 1,
    score: 0,
    speed: 0,
    mass: 1,
    stage: "draw",
    endReason: null,
    bag: shuffle.list,
    hand: [],
    discard: [],
    triangle: { leftBase: null, rightBase: null, apex: null },
    swapUsed: false,
    throwsUsed: 0,
  };
}

// --- Refus ---

// Exportée pour la prévision, qui suit la même règle.
export function stageRefusal(state, expected) {
  if (state.stage === "over") return "gameOver";
  if (state.stage === expected) return null;
  return expected === "draw" ? "alreadyDrawn" : "mustDraw";
}

function isSlot(slot) {
  return SLOTS.includes(slot);
}

function emptySlotCount(triangle) {
  return SLOTS.filter((slot) => triangle[slot] === null).length;
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
// l'interface ne demande pas de confirmer une pose qui serait refusée.
//
// Au premier tour, le triangle doit être plein pour résoudre, et la main ne se
// recomplète qu'au tour suivant : remplacer trop de billes laisserait la
// partie sans issue. Une pose qui ne laisse plus assez de billes en main, ou
// plus assez de lancers, pour remplir les emplacements vides est donc refusée.
export function placeRefusal(state, handIndex, slot) {
  const refusal = throwRefusal(state);
  if (refusal) return refusal;
  if (!isSlot(slot)) return "invalidSlot";
  if (!Number.isInteger(handIndex) || handIndex < 0 || handIndex >= state.hand.length) return "invalidHandIndex";
  // Une bille piochée à l'aveugle n'a pas d'identité : rien à poser.
  if (state.hand[handIndex] === UNKNOWN_MARBLE) return "invalidHandIndex";
  if (state.turn === 1) {
    const emptyAfter = emptySlotCount(state.triangle) - (state.triangle[slot] === null ? 1 : 0);
    if (Math.min(state.hand.length, throwsLeft(state)) - 1 < emptyAfter) return "placementBlocksTriangle";
  }
  return null;
}

// Peut-on résoudre le tour ? Le code du refus, ou null : au premier tour, le
// triangle doit être plein.
function resolveRefusal(state) {
  const refusal = stageRefusal(state, "play");
  if (refusal) return refusal;
  if (state.turn === 1 && emptySlotCount(state.triangle) > 0) return "triangleIncomplete";
  return null;
}

// LECTURE PURE, sans effet sur les règles : toutes les actions que le réducteur
// accepterait maintenant, dans un ordre fixe (pioche ; échanges, chaque paire une
// fois, dans l'ordre des emplacements ; poses, bille de la main puis emplacement ;
// résolution). Elle passe par les mêmes refus que le réducteur, sans en recopier
// aucun. Sert aux joueurs automatiques des outils (tools/marbles/players.js).
export function legalActions(state) {
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

// TOUTES les conditions de fin de partie, ici et nulle part ailleurs. Chacune est
// consultée à un MOMENT du tour :
//   "turnDraw"  après la pioche du début de tour ; `context` : { drawn, stopped },
//               les billes piochées et ce qui a arrêté la pioche (drawMarbles) ;
//   "turnEnd"   après la rotation, en fin de résolution.
// La première qui répond l'emporte, sa `reason` devient endReason et a son texte,
// `marbles.event.game_over.<reason>`. Un futur mode (un Impact minimal à
// atteindre…) branche ici les siennes. Une main pleine n'arrête jamais la partie.
const END_CONDITIONS = [
  // La pioche du tour n'a pu donner aucune bille, faute de billes.
  { reason: "outOfMarbles", moment: "turnDraw", test: (state, { drawn, stopped }) => drawn === 0 && stopped === "noMarbles" },
  { reason: "turnsCompleted", moment: "turnEnd", test: (state) => state.turn >= state.turnCount },
];

export const END_REASONS = END_CONDITIONS.map((condition) => condition.reason);

// La raison de finir à ce moment, ou null.
function endReasonAt(moment, state, context = {}) {
  return END_CONDITIONS.find((condition) => condition.moment === moment && condition.test(state, context))?.reason ?? null;
}

function endGame(run, reason) {
  update(run, { stage: "over", endReason: reason });
  run.emit({ type: "gameOver", reason, score: run.state.score });
}

// --- Écouteurs ---

// Les billes qui écoutent le bus, dans leur ordre fixe : base gauche, base
// droite, pointe, puis la main de la première à la dernière. Une liste relue à
// chaque évènement : elle suit le triangle tel qu'il est à cet instant.
export function marbleListeners(state) {
  const onTriangle = SLOTS.filter((slot) => state.triangle[slot] !== null).map((slot) => ({
    zone: "triangle",
    slot,
    marble: state.triangle[slot].marble,
  }));
  const inHand = state.hand.map((marble, index) => ({ zone: "hand", index, marble }));
  return [...onTriangle, ...inHand];
}

function isOnEventSlot(event, listener) {
  return listener.zone === "triangle" && listener.slot === event.slot;
}

// Quels évènements déclenchent un effet, et chez quelle bille : les clauses à
// jouer, ou null. La bille concernée est chaque fois celle de l'emplacement de
// l'évènement : l'occupante avant son retrait (Éjection), la nouvelle venue
// après sa pose (Tic). Une bille sans Tic ni Éjection ne réagit pas du tout :
// pas d'évènement `effect`, à la différence d'une phase, qui en a toujours un.
// Un déclencheur : `zones`, où sont les billes qu'il peut concerner ("triangle",
// "hand"), et `clauses(event, listener, types)`. Un futur déclencheur est une
// entrée de plus ici ; s'il écoute la main, une bille piochée à l'aveugle y rend
// la prévision incertaine (handleEvent).
const ON_SLOT = ["triangle"];
const EVENT_TRIGGERS = {
  phase: {
    zones: ON_SLOT,
    clauses: (event, listener, types) => (isOnEventSlot(event, listener) ? effectAt(listener.marble, listener.slot, types) : null),
  },
  knockout: {
    zones: ON_SLOT,
    clauses: (event, listener, types) => (isOnEventSlot(event, listener) ? types[listener.marble].knockout ?? null : null),
  },
  hit: {
    zones: ON_SLOT,
    clauses: (event, listener, types) => (isOnEventSlot(event, listener) ? types[listener.marble].hit ?? null : null),
  },
};

// --- Le déroulé d'une action ---

function update(run, changes) {
  run.state = { ...run.state, ...changes };
}

// Joue un effet de bille : les compteurs du tour d'abord, ce qui va aux autres
// emplacements ensuite (un cadeau à un emplacement vide est perdu), le bonus
// reçu compté au moment de la phase de la bille.
function fireEffect(run, event, listener, clauses) {
  const { slot, marble } = listener;
  const { self, gifts } = evaluateEffect(clauses, run.state.triangle, run.types);
  const bonus = event.type === "phase" ? run.state.triangle[slot].bonus : undefined;
  const { speed: speedDelta, mass: massDelta } = bonus ? addValues(self, bonus) : self;

  let { triangle } = run.state;
  const given = [];
  for (const { slot: target, ...gift } of gifts) {
    const placed = triangle[target];
    if (placed === null) continue;
    triangle = { ...triangle, [target]: { ...placed, bonus: placed.bonus ? addValues(placed.bonus, gift) : gift } };
    given.push({ slot: target, marble: placed.marble, ...gift });
  }

  const speed = run.state.speed + speedDelta;
  const mass = run.state.mass + massDelta;
  update(run, { triangle, speed, mass });
  // La Pioche : l'effet s'annonce, puis ses billes se piochent (drawMarbles), à
  // tout moment du tour.
  const { draw } = self;
  run.emit({ type: "effect", trigger: event.type, slot, marble, speedDelta, massDelta, draw, given, speed, mass });
  if (draw > 0) drawMarbles(run, draw);
}

// Le traitement d'un évènement par le bus : le journal, puis les écouteurs.
function handleEvent(run, event) {
  run.journal.push(event);
  const trigger = EVENT_TRIGGERS[event.type];
  if (!trigger) return;
  for (const listener of marbleListeners(run.state)) {
    // Une bille inconnue (piochée à l'aveugle) que ce déclencheur pourrait
    // concerner : sa réaction dépend de son identité, la prévision ne peut pas la
    // dire et se déclare incertaine. Elle ne réagit pas.
    if (listener.marble === UNKNOWN_MARBLE) {
      if (trigger.zones.includes(listener.zone)) run.uncertain = true;
      continue;
    }
    const clauses = trigger.clauses(event, listener, run.types);
    if (clauses !== null) fireEffect(run, event, listener, clauses);
  }
}

// Déroule une action sur un état de travail, avec son bus et son journal. Une
// boucle d'évènements l'annule tout entière : l'état reçu n'a jamais été touché.
// `options` : { eventLimit, blind } (voir marblesReduce). À l'aveugle, le résultat
// porte aussi `uncertain` : une bille inconnue aurait pu réagir (handleEvent).
function transact(state, types, { eventLimit, blind = false } = {}, body) {
  const run = { state, types, blind, uncertain: false, journal: [] };
  run.emit = createEventBus((event) => handleEvent(run, event), eventLimit).emit;
  try {
    body(run);
  } catch (error) {
    if (error instanceof MarbleEventLimitError) return refused(state, "eventLimit");
    throw error;
  }
  const result = { ok: true, state: run.state, events: run.journal, error: null };
  return blind ? { ...result, uncertain: run.uncertain } : result;
}

// Une copie À L'AVEUGLE d'un état, celle de la prévision : le sac et la défausse
// n'y gardent que leur nombre de billes, jamais leur identité ni leur ordre, et le
// hasard de la partie en est retiré (null : un tirage y échouerait). Un déroulé à
// l'aveugle (options.blind) n'en a jamais besoin.
export function blindCopy(state) {
  const hidden = (list) => list.map(() => UNKNOWN_MARBLE);
  return { ...structuredClone(state), bag: hidden(state.bag), discard: hidden(state.discard), rngState: null };
}

// --- Actions ---

// La défausse devient le sac : mélangée par le hasard de la partie, ou, à
// l'aveugle, sans mélange ni hasard, ses billes devenant inconnues (la prévision
// annonce la régénération sans rien en révéler).
function regenerateBag(run) {
  const { discard } = run.state;
  if (run.blind) {
    update(run, { bag: discard.map(() => UNKNOWN_MARBLE), discard: [] });
  } else {
    const shuffle = shuffled(discard, run.state.rngState);
    update(run, { rngState: shuffle.rngState, bag: shuffle.list, discard: [] });
  }
  run.emit({ type: "bagRegenerated", size: run.state.bag.length });
}

// LA pioche d'une bille, la seule : celle du début de tour comme celle d'un effet,
// à tout moment du tour. Dans l'ordre :
//   1. main pleine : la bille reste au sac, sans régénération ;
//   2. sinon, le sac a une bille : on la pioche ;
//   3. sinon, la défausse n'est pas vide : elle devient le sac, puis on pioche ;
//   4. sinon (sac et défausse vides) : rien à piocher.
// À l'aveugle, la bille piochée est inconnue. -> "drawn", ou ce qui arrête la
// pioche : "handFull", "noMarbles". La fin de partie n'est pas son affaire.
function drawOne(run) {
  if (run.state.hand.length >= run.state.maxHandSize) return "handFull";
  if (run.state.bag.length === 0) {
    if (run.state.discard.length === 0) return "noMarbles";
    regenerateBag(run);
  }
  const [top, ...bag] = run.state.bag;
  const marble = run.blind ? UNKNOWN_MARBLE : top;
  update(run, { bag, hand: [...run.state.hand, marble] });
  run.emit({ type: "draw", marble });
  return "drawn";
}

// Pioche `count` billes une par une, jusqu'au premier arrêt, qui se dit
// (drawSkipped) : les billes restantes ne sont pas piochées. -> { drawn, stopped },
// `stopped` null si tout a été pioché.
function drawMarbles(run, count) {
  for (let drawn = 0; drawn < count; drawn++) {
    const outcome = drawOne(run);
    if (outcome !== "drawn") {
      run.emit({ type: "drawSkipped", reason: outcome });
      return { drawn, stopped: outcome };
    }
  }
  return { drawn: count, stopped: null };
}

// Pioche du début de tour : `firstTurnDraw` billes au premier tour, puis
// `drawPerTurn`. Elle peut finir la partie (END_CONDITIONS).
function drawTurn(run) {
  const { state } = run;
  run.emit({ type: "turnStarted", turn: state.turn, turnCount: state.turnCount });
  const result = drawMarbles(run, state.turn === 1 ? state.firstTurnDraw : state.drawPerTurn);
  const reason = endReasonAt("turnDraw", run.state, result);
  if (reason !== null) {
    endGame(run, reason);
    return;
  }
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

// Pose, un LANCER (la confirmation est l'affaire de l'interface). Sur un emplacement
// occupé, dans cet ordre : Éjection de l'occupante, son retrait, son départ à la
// défausse, la nouvelle bille rejoint l'emplacement, son Tic. Sur un emplacement
// vide, la pose seule.
function placeMarble(run, { handIndex, slot }) {
  const marble = run.state.hand[handIndex];
  const previous = run.state.triangle[slot];
  if (previous !== null) {
    const ejected = { slot, marble: previous.marble };
    run.emit({ type: "knockout", ...ejected });
    update(run, { triangle: { ...run.state.triangle, [slot]: null } });
    run.emit({ type: "removed", ...ejected, cause: "replacement" });
    update(run, { discard: [...run.state.discard, previous.marble] });
    run.emit({ type: "discarded", ...ejected, cause: "replacement" });
  }
  update(run, {
    hand: run.state.hand.filter((_, index) => index !== handIndex),
    triangle: { ...run.state.triangle, [slot]: { marble, wear: 0 } },
    throwsUsed: run.state.throwsUsed + 1,
  });
  run.emit({ type: "placed", slot, marble });
  if (previous !== null) run.emit({ type: "hit", slot, marble });
}

// Où va la bille de chaque emplacement à la rotation : base gauche -> pointe,
// pointe -> base droite, base droite -> base gauche. Exporté pour la vue, qui fait
// rouler les billes de place en place (view/marbles/sounds.js) sans recopier la
// règle.
export const ROTATION_NEXT = Object.freeze({ leftBase: "apex", apex: "rightBase", rightBase: "leftBase" });

// Les emplacements vides tournent aussi.
function rotated(triangle) {
  return Object.fromEntries(SLOTS.map((slot) => [ROTATION_NEXT[slot], triangle[slot]]));
}

// Plus de bonus une fois la résolution finie : il ne vaut que pour ce tour.
function withoutBonus(placed) {
  return placed === null ? null : { marble: placed.marble, wear: placed.wear };
}

function resolvePhases(run) {
  for (const slot of SLOTS) {
    const placed = run.state.triangle[slot];
    if (placed === null) {
      run.emit({ type: "phaseSkipped", slot });
      continue;
    }
    const { marble } = placed;
    run.emit({ type: "phase", slot, marble });
    // Une bille joue son effet même si cette usure l'amène à son maximum.
    const wear = placed.wear + 1;
    update(run, { triangle: { ...run.state.triangle, [slot]: { marble, wear } } });
    run.emit({ type: "wear", slot, marble, wear, maxWear: maxWearOf(marble, run.types) });
  }
}

function retireWornMarbles(run) {
  for (const slot of SLOTS) {
    const placed = run.state.triangle[slot];
    if (placed === null || placed.wear < maxWearOf(placed.marble, run.types)) continue;
    const worn = { slot, marble: placed.marble, cause: "wear" };
    update(run, { triangle: { ...run.state.triangle, [slot]: null } });
    run.emit({ type: "removed", ...worn });
    update(run, { discard: [...run.state.discard, placed.marble] });
    run.emit({ type: "discarded", ...worn });
  }
}

// La résolution, sans les refus : phases, Impact, retraits, rotation, fin de
// tour. La vraie, celle de l'action "resolve" comme celle de la prévision
// (core/marbles-forecast.js), qui la lance aussi sur un triangle du premier tour
// encore incomplet. Ne pioche jamais et ne touche pas au hasard.
export function runResolution(state, types, options = {}) {
  return transact(state, types, options, (run) => {
    resolvePhases(run);

    const { speed, mass } = run.state;
    const impact = impactOf(speed, mass);
    const score = run.state.score + impact;
    update(run, { score });
    run.emit({ type: "impact", speed, mass, impact, score });

    retireWornMarbles(run);

    const { leftBase, rightBase, apex } = run.state.triangle;
    const triangle = rotated({ leftBase: withoutBonus(leftBase), rightBase: withoutBonus(rightBase), apex: withoutBonus(apex) });
    update(run, { triangle, speed: 0, mass: 1 });
    run.emit({ type: "rotation", triangle });
    run.emit({ type: "turnEnded", turn: run.state.turn });

    const reason = endReasonAt("turnEnd", run.state);
    if (reason !== null) endGame(run, reason);
    else update(run, { turn: run.state.turn + 1, stage: "draw" });
  });
}

// Le réducteur : pur, ne modifie jamais `state`. Même état + même action =
// même résultat. `options` (facultatif) :
//   eventLimit  la limite du bus pour cette action, abaissée par les vérifications ;
//   blind       le déroulé À L'AVEUGLE, celui de la prévision : aucune pioche n'y lit
//               l'identité d'une bille ni le hasard de la partie (drawOne).
export function marblesReduce(state, action, types, options = {}) {
  let refusal;
  switch (action?.type) {
    case "draw":
      refusal = stageRefusal(state, "draw");
      return refusal ? refused(state, refusal) : transact(state, types, options, drawTurn);
    case "swap":
      refusal = swapRefused(state, action);
      return refusal ? refused(state, refusal) : transact(state, types, options, (run) => swapSlots(run, action));
    case "place":
      refusal = placeRefusal(state, action.handIndex, action.slot);
      return refusal ? refused(state, refusal) : transact(state, types, options, (run) => placeMarble(run, action));
    case "resolve":
      refusal = resolveRefusal(state);
      return refusal ? refused(state, refusal) : runResolution(state, types, options);
    default:
      return refused(state, "unknownAction");
  }
}
