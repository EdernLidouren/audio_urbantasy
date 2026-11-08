// BOÎTE À OUTILS DES BILLES — le SIMULATEUR : des parties entières jouées par un
// joueur automatique (tools/marbles/players.js), et ce qu'on en retient. Pur, sans
// Node : le lanceur (tools/marbles/simulate.js) lit les options et les fichiers,
// les vérifications l'appellent directement.
//
// DÉTERMINISME : chaque partie i reçoit des graines DÉRIVÉES de la graine de départ
// (deriveSeed) : celle de la partie (mélange du sac, régénérations), celle du
// joueur, celle du sac aléatoire. Mêmes paramètres, mêmes parties, au caractère
// près. Aucune de ces graines ne dépend d'une autre partie.
//
// Le simulateur pioche lui-même, donne au joueur la VUE PUBLIQUE de l'état
// (publicView) et passe chacune de ses actions au vrai réducteur, avec les mêmes
// validations que pour un humain. Une action refusée est comptée (refusals) et
// remplacée par la première action légale, pour que la partie aille au bout :
// c'est une faute du joueur, que le rapport signale.
//
// Ne change aucune règle ni aucun réglage : les surcharges (`settings`) passent par
// les options de createMarblesGame, celles d'une partie.

import { STARTING_BAG } from "../../config/marbles-values.js";
import { createMarblesGame, legalActions, marblesReduce } from "../../core/marbles.js";
import { createSeed, nextRandom } from "../../core/rng.js";
import { PLAYERS, publicView } from "./players.js";
import MARBLE_TYPES from "../../marbles/types/index.js";

export const MARBLE_IDS = Object.keys(MARBLE_TYPES);
export const SETTING_NAMES = ["maxHandSize", "firstTurnDraw", "drawPerTurn", "turnCount"];

// Au-delà, une partie ne finit pas : une faute de programmation, pas une partie.
const MAX_ACTIONS_PER_GAME = 10_000;

export function deriveSeed(seed, index, label) {
  return createSeed(`${seed}/${index}/${label}`);
}

// --- Sacs ---
// Un mode de sac : { kind: "test" } (le sac de test), { kind: "list", marbles,
// source } (un sac décrit, dans un fichier), { kind: "random", size, maxCopies }
// (tiré dans la table des billes, doublons permis jusqu'à maxCopies exemplaires,
// null : sans limite).

export function validateBagMode(mode) {
  if (mode.kind === "test") return;
  if (mode.kind === "list") {
    for (const id of mode.marbles) if (!MARBLE_IDS.includes(id)) throw new Error(`sac : bille inconnue "${id}".`);
    return;
  }
  if (mode.kind !== "random") throw new Error(`sac : mode inconnu "${mode.kind}".`);
  if (!Number.isInteger(mode.size) || mode.size < 1) throw new Error("sac aléatoire : la taille doit être un entier >= 1.");
  if (mode.maxCopies !== null && (!Number.isInteger(mode.maxCopies) || mode.maxCopies < 1)) {
    throw new Error("sac aléatoire : la limite d'exemplaires doit être un entier >= 1.");
  }
  if (mode.maxCopies !== null && mode.size > mode.maxCopies * MARBLE_IDS.length) {
    throw new Error(`sac aléatoire : ${mode.size} billes impossibles avec ${mode.maxCopies} exemplaire(s) au plus de ${MARBLE_IDS.length} billes.`);
  }
}

// Un sac tiré : chaque bille uniformément parmi celles qui n'ont pas atteint leur
// limite, par son propre générateur.
function randomBag({ size, maxCopies }, seed) {
  let rngState = seed;
  const counts = {};
  const bag = [];
  while (bag.length < size) {
    const open = MARBLE_IDS.filter((id) => maxCopies === null || (counts[id] ?? 0) < maxCopies);
    const draw = nextRandom(rngState);
    rngState = draw.state;
    const id = open[Math.floor(draw.value * open.length)];
    counts[id] = (counts[id] ?? 0) + 1;
    bag.push(id);
  }
  return bag;
}

function bagFor(mode, seed, index) {
  if (mode.kind === "test") return [...STARTING_BAG];
  if (mode.kind === "list") return [...mode.marbles];
  return randomBag(mode, deriveSeed(seed, index, "bag"));
}

// Un sac décrit en texte : ids séparés par des espaces, virgules ou retours à la
// ligne, ou une liste JSON ; « # » commente la fin d'une ligne. Une bille inconnue
// lève.
export function parseBagText(text) {
  const trimmed = text.trim();
  const ids = trimmed.startsWith("[")
    ? JSON.parse(trimmed)
    : text
        .split("\n")
        .map((line) => line.replace(/#.*/, ""))
        .join(" ")
        .split(/[\s,]+/)
        .filter((id) => id !== "");
  validateBagMode({ kind: "list", marbles: ids });
  return ids;
}

// --- Une partie ---

function emptyMarbleStats() {
  return {
    placed: 0,
    placedReplacing: 0,
    knockedOut: 0,
    worn: 0,
    phaseSpeed: 0,
    phaseMass: 0,
    hitSpeed: 0,
    hitMass: 0,
    knockoutSpeed: 0,
    knockoutMass: 0,
  };
}

// Ce que le journal d'une action ajoute au relevé de la partie.
function recordEvents(record, events) {
  const stats = (id) => (record.marbles[id] ??= emptyMarbleStats());
  for (const event of events) {
    switch (event.type) {
      case "placed":
        stats(event.marble).placed += 1;
        break;
      case "hit":
        // Un Tic n'a lieu que sur un emplacement occupé : c'est un remplacement.
        stats(event.marble).placedReplacing += 1;
        record.replacements += 1;
        break;
      case "removed":
        if (event.cause === "replacement") stats(event.marble).knockedOut += 1;
        break;
      case "discarded":
        if (event.cause === "wear") stats(event.marble).worn += 1;
        break;
      case "effect": {
        // speedDelta et massDelta comptent le bonus reçu : un bonus se compte chez
        // la bille qui le reçoit, comme dans la vue d'ensemble (touche R).
        const marble = stats(event.marble);
        marble[`${event.trigger}Speed`] += event.speedDelta;
        marble[`${event.trigger}Mass`] += event.massDelta;
        if (event.trigger === "hit" || event.trigger === "knockout") {
          record[event.trigger].speed += event.speedDelta;
          record[event.trigger].mass += event.massDelta;
        }
        break;
      }
      case "impact":
        record.impacts.push(event.impact);
        break;
      case "gameOver":
        record.endReason = event.reason;
        break;
      default:
    }
  }
}

// Une partie jouée de bout en bout. -> son relevé :
//   { index, seed, bag, score, endReason, turns, impacts, replacements,
//     hit: { speed, mass }, knockout: { speed, mass }, refusals, marbles: { id: stats } }
// `turns` : les tours résolus ; `impacts[k]` : l'Impact du tour k + 1.
export function playGame({ index, seed, player, playerOptions = {}, bagMode, settings = {} }) {
  const bag = bagFor(bagMode, seed, index);
  const gameSeed = deriveSeed(seed, index, "game");
  let state = createMarblesGame(gameSeed, { ...settings, bag }, MARBLE_TYPES);
  const session = PLAYERS[player].startGame({ seed: deriveSeed(seed, index, "player"), options: playerOptions });
  const record = {
    index,
    seed: gameSeed,
    bag,
    score: 0,
    endReason: null,
    turns: 0,
    impacts: [],
    replacements: 0,
    hit: { speed: 0, mass: 0 },
    knockout: { speed: 0, mass: 0 },
    refusals: [],
    marbles: {},
  };

  for (let count = 0; state.stage !== "over"; count++) {
    if (count >= MAX_ACTIONS_PER_GAME) throw new Error(`simulation : partie ${index} sans fin (joueur ${player}).`);
    let action = state.stage === "draw" ? { type: "draw" } : session.next(publicView(state));
    let result = marblesReduce(state, action, MARBLE_TYPES);
    if (!result.ok) {
      record.refusals.push({ turn: state.turn, action, error: result.error });
      action = legalActions(state).find((legal) => legal.type !== "draw") ?? legalActions(state)[0];
      result = marblesReduce(state, action, MARBLE_TYPES);
    }
    recordEvents(record, result.events);
    state = result.state;
  }

  record.score = state.score;
  record.turns = record.impacts.length;
  return record;
}

// --- Une série ---

// Les paramètres complétés et validés : une erreur claire avant la première partie.
export function normalizeParams(params) {
  const normalized = {
    games: params.games ?? 1000,
    seed: params.seed ?? 1,
    player: params.player ?? "greedy",
    playerOptions: params.playerOptions ?? {},
    bagMode: params.bagMode ?? { kind: "test" },
    settings: params.settings ?? {},
  };
  if (!Number.isInteger(normalized.games) || normalized.games < 1) throw new Error("simulation : le nombre de parties doit être un entier >= 1.");
  if (!Object.hasOwn(PLAYERS, normalized.player)) {
    throw new Error(`simulation : joueur inconnu "${normalized.player}" (connus : ${Object.keys(PLAYERS).join(", ")}).`);
  }
  for (const name of Object.keys(normalized.settings)) {
    if (!SETTING_NAMES.includes(name)) throw new Error(`simulation : réglage inconnu "${name}".`);
  }
  validateBagMode(normalized.bagMode);
  // Les surcharges passent par la validation de la simulation elle-même.
  createMarblesGame(0, { ...normalized.settings, bag: bagFor(normalized.bagMode, normalized.seed, 0) }, MARBLE_TYPES);
  return normalized;
}

// -> { params, games: [relevé de chaque partie] }
export function simulate(params) {
  const normalized = normalizeParams(params);
  const games = [];
  for (let index = 0; index < normalized.games; index++) games.push(playGame({ ...normalized, index }));
  return { params: normalized, games };
}
