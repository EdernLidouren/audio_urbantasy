// BOÎTE À OUTILS DES BILLES — le SIMULATEUR : des parties entières jouées par un
// joueur automatique (marbles/tools/players.js), et ce qu'on en retient. Pur, sans
// Node : le lanceur (marbles/tools/simulate.js) lit les options et les fichiers,
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

import { STARTING_BAG } from "../config/values.js";
import { createSeed, nextRandom } from "../../lib/rng.js";
import { PLAYERS, publicView } from "./players.js";
import { GAME_RULES } from "./game-rules.js";
import { TRIGGER_IDS } from "./format.js";

export const MARBLE_IDS = Object.keys(GAME_RULES.types);
export const SETTING_NAMES = ["maxHandSize", "throwsPerTurn", "potCapacity", "firstTurnDraw", "drawPerTurn", "turnCount"];

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

function validateBagMode(mode) {
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

// Les chiffres d'une bille : ses gestes, puis Vitesse et Masse produites par chaque
// déclencheur (`<déclencheur>Speed`, `<déclencheur>Mass`), la phase en tête.
export const MARBLE_STAT_FIELDS = [
  "drawn",
  "placed",
  "placedReplacing",
  "knockedOut",
  "worn",
  ...TRIGGER_IDS.flatMap((trigger) => [`${trigger}Speed`, `${trigger}Mass`]),
];

function emptyMarbleStats() {
  return Object.fromEntries(MARBLE_STAT_FIELDS.map((field) => [field, 0]));
}

// Ce que chaque déclencheur (hors phase) a apporté aux compteurs dans la partie.
function emptyTriggerTotals() {
  return Object.fromEntries(TRIGGER_IDS.filter((trigger) => trigger !== "phase").map((trigger) => [trigger, { speed: 0, mass: 0 }]));
}

// Ce que le journal d'une action ajoute au relevé de la partie. `actionType` : la
// pioche du tour ("draw") pioche pour elle-même ; ailleurs, une régénération a lieu
// en cours de tour.
// Une pioche d'effet revient à l'effet qui l'a demandée, et non au dernier effet
// dit : une réaction au mélange peut se glisser entre une Pioche et ses billes.
// `drawers` : la pile des effets à Pioche (`draw > 0`) qui attendent encore des
// billes, gardée d'une action à l'autre (un choix peut suspendre une pioche). Une
// pioche revient au plus récent d'entre eux : un Éveil qui pioche pendant la pioche
// d'une autre bille prend ses billes, puis la pioche de l'autre reprend à son compte.
// Une pioche arrêtée (main pleine) laisse son entrée dans la pile : elle n'y sert
// plus, chaque Pioche à venir s'empilant au-dessus avant ses billes.
export function recordEvents(record, events, actionType, drawers) {
  const stats = (id) => (record.marbles[id] ??= emptyMarbleStats());
  const byEffect = actionType !== "draw";
  for (const event of events) {
    switch (event.type) {
      case "draw":
        // La cause dit d'où vient la pioche, même quand une réponse à un choix
        // reprend la pioche du tour.
        if (event.cause === "effect") {
          record.effectDraws += 1;
          const drawer = drawers.findLast((entry) => entry.remaining > 0);
          if (drawer !== undefined) {
            drawer.remaining -= 1;
            // Une pioche d'un statut (aucune bille) ne compte chez aucune bille.
            if (drawer.marble !== null) stats(drawer.marble).drawn += 1;
          }
          while (drawers.length > 0 && drawers.at(-1).remaining === 0) drawers.pop();
        }
        break;
      case "bagRegenerated":
        record.regenerations += 1;
        if (byEffect) record.midTurnRegenerations += 1;
        break;
      case "placed":
        stats(event.marble).placed += 1;
        record.throws += 1;
        break;
      case "hit":
        // Un Tic n'a lieu que sur un emplacement occupé : c'est un remplacement.
        stats(event.marble).placedReplacing += 1;
        record.replacements += 1;
        break;
      case "removed":
        // Chassée par une pose ou par l'action Éjecter ; usée, au départ, quelle que
        // soit sa destination (une redirection l'envoie ailleurs qu'à la défausse).
        if (event.cause === "replacement" || event.cause === "eject") stats(event.marble).knockedOut += 1;
        if (event.cause === "wear") stats(event.marble).worn += 1;
        break;
      case "effect": {
        // speedDelta et massDelta comptent le bonus reçu : un bonus se compte chez
        // la bille qui le reçoit, comme dans la vue d'ensemble (touche R).
        if (event.draw > 0) drawers.push({ marble: event.marble, remaining: event.draw });
        // La réaction d'un statut n'est l'effet d'aucune bille : ses valeurs comptent
        // dans l'Impact, dans aucune colonne de bille (ses pioches, chez aucune).
        if (event.trigger === "statusReaction") break;
        const marble = stats(event.marble);
        marble[`${event.trigger}Speed`] += event.speedDelta;
        marble[`${event.trigger}Mass`] += event.massDelta;
        if (event.trigger !== "phase") {
          record[event.trigger].speed += event.speedDelta;
          record[event.trigger].mass += event.massDelta;
        }
        break;
      }
      case "impact":
        record.impacts.push(event.impact);
        break;
      case "chainInterrupted":
        record.interruptions += 1;
        break;
      default:
    }
  }
}

// Une partie jouée de bout en bout. -> son relevé :
//   { index, seed, bag, score, turns, impacts, replacements,
//     <déclencheur>: { speed, mass } (hit, knockout…), effectDraws, regenerations,
//     midTurnRegenerations, throws, refusals, interruptions, marbles: { id: stats } }
// `interruptions` : les enchaînements arrêtés par la limite de sécurité du bus
// (chainInterrupted), une anomalie.
// `effectDraws` : les billes piochées par des effets ; `throws` : les lancers joués.
// `turns` : les tours résolus ; `impacts[k]` : l'Impact du tour k + 1.
export function playGame({ index, seed, player, playerOptions = {}, bagMode, settings = {} }) {
  const bag = bagFor(bagMode, seed, index);
  const gameSeed = deriveSeed(seed, index, "game");
  let state = GAME_RULES.createGame(gameSeed, { ...settings, bag });
  const session = PLAYERS[player].startGame({ seed: deriveSeed(seed, index, "player"), options: playerOptions });
  const record = {
    index,
    seed: gameSeed,
    bag,
    score: 0,
    turns: 0,
    impacts: [],
    replacements: 0,
    ...emptyTriggerTotals(),
    effectDraws: 0,
    regenerations: 0,
    midTurnRegenerations: 0,
    throws: 0,
    refusals: [],
    interruptions: 0,
    marbles: {},
  };
  // Les effets à Pioche en attente de leurs billes (recordEvents), hors du relevé.
  const drawers = [];

  for (let count = 0; state.stage !== "over"; count++) {
    if (count >= MAX_ACTIONS_PER_GAME) throw new Error(`simulation : partie ${index} sans fin (joueur ${player}).`);
    // Un choix en attente revient au joueur, même au milieu de la pioche du tour.
    let action = state.pendingChoice === null && state.stage === "draw" ? { type: "draw" } : session.next(publicView(state));
    let result = GAME_RULES.reduce(state, action);
    if (!result.ok) {
      record.refusals.push({ turn: state.turn, action, error: result.error });
      action = GAME_RULES.legalActions(state).find((legal) => legal.type !== "draw") ?? GAME_RULES.legalActions(state)[0];
      result = GAME_RULES.reduce(state, action);
    }
    recordEvents(record, result.events, action.type, drawers);
    state = result.state;
  }

  record.score = state.score;
  record.turns = record.impacts.length;
  return record;
}

// --- Une série ---

// Les paramètres complétés et validés : une erreur claire avant la première partie.
function normalizeParams(params) {
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
  GAME_RULES.createGame(0, { ...normalized.settings, bag: bagFor(normalized.bagMode, normalized.seed, 0) });
  return normalized;
}

// -> { params, games: [relevé de chaque partie] }
export function simulate(params) {
  const normalized = normalizeParams(params);
  const games = [];
  for (let index = 0; index < normalized.games; index++) games.push(playGame({ ...normalized, index }));
  return { params: normalized, games };
}
