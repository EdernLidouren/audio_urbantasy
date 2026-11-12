// BOÎTE À OUTILS DES BILLES — un ÉTAT CONSTRUIT À LA MAIN, pour tester un cas
// précis sans jouer la partie jusque-là. Pur, sans Node : les vérifications s'en
// servent aussi. L'état produit est un état ordinaire de marbles/core/marbles.js : on lui
// applique ensuite les vraies actions (applyActions).
//
// Description (tout est facultatif ; JSON possible, voir marbles/tools/case.js) :
//   {
//     "seed": 1,                      graine du hasard des régénérations à venir
//     "turn": 3, "stage": "play",     "draw", "play" ou "over"
//     "score": 12, "speed": 0, "mass": 1,
//     "swapUsed": false, "throwsUsed": 0,  lancers déjà joués ce tour
//     "triangle": { "leftBase": "clay", "rightBase": "giant:0", "apex": null },
//     "hand": ["agate", "gorilla:2"],     "id:tours en main"
//     "bag": ["mica"],                du haut (prochaine pioche) vers le bas
//     "discard": [],
//     "pot": ["agate"], "lost": [],  le pot dans l'ordre d'arrivée, les billes perdues
//     "tally": { "flick": { "turn": 1, "game": 3 } },   valeurs de partie, le reste à 0
//     "settings": { "maxHandSize": 5, "throwsPerTurn": 5, "potCapacity": 3, "firstTurnDraw": 5, "drawPerTurn": 1, "turnCount": 10 }
//   }
// Une bille du triangle : "id" (usure 0), "id:usure", ou { marble, wear, bonus? }.
// Une bille de la main : "id" (0 tour en main), "id:tours", ou { marble, turnsInHand }.
// Défauts : tour 2 en phase de jeu, triangle, main, sac et défausse vides,
// compteurs de début de tour. Une description fausse (champ, bille ou
// emplacement inconnu, usure hors bornes) lève une erreur claire : jamais d'état
// silencieusement faux.

import { createSeed } from "../../lib/rng.js";
import { SLOTS } from "../core/marbles.js";
import { rejectUnknownFields } from "../../lib/validate.js";
import MARBLE_TYPES from "../content/types/index.js";
import { GAME_RULES } from "./game-rules.js";

const FIELDS = ["seed", "turn", "stage", "score", "speed", "mass", "swapUsed", "throwsUsed", "triangle", "hand", "bag", "discard", "pot", "lost", "tally", "settings"];
const SETTINGS = ["maxHandSize", "throwsPerTurn", "potCapacity", "firstTurnDraw", "drawPerTurn", "turnCount"];
const STAGES = ["draw", "play", "over"];

function fail(message) {
  throw new Error(`état construit : ${message}`);
}

function checkMarble(id, where) {
  if (!Object.hasOwn(MARBLE_TYPES, id)) fail(`bille inconnue "${id}" (${where}).`);
  return id;
}

function checkInteger(value, name, min) {
  if (!Number.isInteger(value) || value < min) fail(`${name} doit être un entier >= ${min}.`);
  return value;
}

// Une bille de la main, avec son compteur de tours en main.
function handContent(value) {
  const held = typeof value === "string" ? { marble: value.split(":")[0], turnsInHand: Number(value.split(":")[1] ?? 0) } : value;
  rejectUnknownFields(held, ["marble", "turnsInHand"], "main", fail);
  checkMarble(held.marble, "hand");
  return { marble: held.marble, turnsInHand: checkInteger(held.turnsInHand ?? 0, `tours en main de ${held.marble}`, 0) };
}

function slotContent(value, slot) {
  if (value === null || value === undefined) return null;
  const placed = typeof value === "string" ? { marble: value.split(":")[0], wear: Number(value.split(":")[1] ?? 0) } : value;
  rejectUnknownFields(placed, ["marble", "wear", "bonus"], `emplacement ${slot}`, fail);
  checkMarble(placed.marble, slot);
  const wear = placed.wear ?? 0;
  // Une bille à son usure maximale a déjà quitté le triangle à la résolution.
  if (!Number.isInteger(wear) || wear < 0 || wear >= GAME_RULES.maxWearOf(placed.marble)) {
    fail(`usure ${placed.wear} impossible pour ${placed.marble} en ${slot} (0 à ${GAME_RULES.maxWearOf(placed.marble) - 1}).`);
  }
  return placed.bonus ? { marble: placed.marble, wear, bonus: { speed: 0, mass: 0, ...placed.bonus } } : { marble: placed.marble, wear };
}

// Les valeurs de partie : celles décrites, par compteur et par portée ("turn",
// "game"), le reste à zéro (celles d'une partie neuve, `base`). Un compteur ou une
// portée inconnus, ou une valeur négative, lèvent une erreur.
function tallyContent(values = {}, base) {
  rejectUnknownFields(values, Object.keys(base), "tally", fail);
  const described = Object.entries(values).map(([id, scopes]) => {
    rejectUnknownFields(scopes, ["turn", "game"], `tally.${id}`, fail);
    const checked = Object.fromEntries(Object.entries(scopes).map(([scope, value]) => [scope, checkInteger(value, `valeur de partie ${id} (${scope})`, 0)]));
    return [id, { ...base[id], ...checked }];
  });
  return { ...base, ...Object.fromEntries(described) };
}

// Le pot : dans l'ordre d'arrivée, jamais plus que sa capacité.
function potContent(list, capacity) {
  const pot = marbleList(list, "pot");
  if (pot.length > capacity) fail(`pot de ${pot.length} billes, plus que potCapacity (${capacity}).`);
  return pot;
}

function marbleList(list = [], where) {
  if (!Array.isArray(list)) fail(`${where} doit être une liste d'ids.`);
  return list.map((id) => checkMarble(id, where));
}

export function buildState(description = {}) {
  rejectUnknownFields(description, FIELDS, "description", fail);
  const settings = description.settings ?? {};
  rejectUnknownFields(settings, SETTINGS, "settings", fail);
  const triangle = description.triangle ?? {};
  rejectUnknownFields(triangle, SLOTS, "triangle", fail);

  // La partie de départ porte les réglages validés et l'état du hasard ; le sac
  // est ensuite posé tel quel, sans mélange, dans l'ordre décrit.
  // Une partie exige un sac d'au moins 3 billes : elle naît d'un sac minimal, et
  // garde le hasard d'une partie sans mélange, celui de la graine.
  const seed = description.seed ?? 0;
  const [first] = Object.keys(GAME_RULES.types);
  const base = { ...GAME_RULES.createGame(seed, { ...settings, bag: [first, first, first] }), rngState: createSeed(seed) };
  const stage = description.stage ?? "play";
  if (!STAGES.includes(stage)) fail(`étape inconnue "${stage}".`);
  const turn = checkInteger(description.turn ?? 2, "turn", 1);
  if (turn > base.turnCount) fail(`tour ${turn} au-delà des ${base.turnCount} tours de la partie.`);
  if (description.hand !== undefined && !Array.isArray(description.hand)) fail("hand doit être une liste.");
  const hand = (description.hand ?? []).map(handContent);
  if (hand.length > base.maxHandSize) fail(`main de ${hand.length} billes, plus que maxHandSize (${base.maxHandSize}).`);

  return {
    ...base,
    turn,
    stage,
    score: checkInteger(description.score ?? 0, "score", 0),
    speed: Number.isInteger(description.speed ?? 0) ? description.speed ?? 0 : fail("speed doit être un entier."),
    mass: Number.isInteger(description.mass ?? 1) ? description.mass ?? 1 : fail("mass doit être un entier."),
    swapUsed: description.swapUsed ?? false,
    throwsUsed: checkThrowsUsed(description.throwsUsed ?? 0, base.throwsPerTurn),
    triangle: Object.fromEntries(SLOTS.map((slot) => [slot, slotContent(triangle[slot], slot)])),
    hand,
    bag: marbleList(description.bag, "bag"),
    discard: marbleList(description.discard, "discard"),
    pot: potContent(description.pot, base.potCapacity),
    lost: marbleList(description.lost, "lost"),
    tally: tallyContent(description.tally, base.tally),
  };
}

// Les lancers déjà joués : entre 0 et la limite du tour.
function checkThrowsUsed(value, throwsPerTurn) {
  if (!Number.isInteger(value) || value < 0 || value > throwsPerTurn) fail(`throwsUsed doit être un entier entre 0 et ${throwsPerTurn}.`);
  return value;
}

// Applique des actions dans l'ordre. -> { state, steps: [{ action, ok, error,
// events }] } : chaque action avec son journal, ou son refus (l'état reste alors
// celui d'avant, comme dans le réducteur).
export function applyActions(state, actions) {
  const steps = [];
  let current = state;
  for (const action of actions) {
    const result = GAME_RULES.reduce(current, action);
    steps.push({ action, ok: result.ok, error: result.error, events: result.events });
    current = result.state;
  }
  return { state: current, steps };
}
