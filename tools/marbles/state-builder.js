// BOÎTE À OUTILS DES BILLES — un ÉTAT CONSTRUIT À LA MAIN, pour tester un cas
// précis sans jouer la partie jusque-là. Pur, sans Node : les vérifications s'en
// servent aussi. L'état produit est un état ordinaire de core/marbles.js : on lui
// applique ensuite les vraies actions (applyActions).
//
// Description (tout est facultatif ; JSON possible, voir tools/marbles/case.js) :
//   {
//     "seed": 1,                      graine du hasard des régénérations à venir
//     "turn": 3, "stage": "play",     "draw", "play" ou "over"
//     "score": 12, "speed": 0, "mass": 1,
//     "swapUsed": false, "hasPlaced": false,
//     "triangle": { "leftBase": "clay", "rightBase": "giant:0", "apex": null },
//     "hand": ["agate", "shooter"],
//     "bag": ["mica"],                du haut (prochaine pioche) vers le bas
//     "discard": [],
//     "settings": { "maxHandSize": 5, "firstTurnDraw": 5, "drawPerTurn": 1, "turnCount": 9 }
//   }
// Une bille du triangle : "id" (usure 0), "id:usure", ou { marble, wear, bonus? }.
// Défauts : tour 2 en phase de jeu, triangle, main, sac et défausse vides,
// compteurs de début de tour. Une description fausse (champ, bille ou
// emplacement inconnu, usure hors bornes) lève une erreur claire : jamais d'état
// silencieusement faux.

import { SLOTS, createMarblesGame, marblesReduce, maxWearOf } from "../../core/marbles.js";
import { rejectUnknownFields } from "../../lib/validate.js";
import MARBLE_TYPES from "../../marbles/types/index.js";

const FIELDS = ["seed", "turn", "stage", "score", "speed", "mass", "swapUsed", "hasPlaced", "triangle", "hand", "bag", "discard", "settings"];
const SETTINGS = ["maxHandSize", "firstTurnDraw", "drawPerTurn", "turnCount"];
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

function slotContent(value, slot) {
  if (value === null || value === undefined) return null;
  const placed = typeof value === "string" ? { marble: value.split(":")[0], wear: Number(value.split(":")[1] ?? 0) } : value;
  rejectUnknownFields(placed, ["marble", "wear", "bonus"], `emplacement ${slot}`, fail);
  checkMarble(placed.marble, slot);
  const wear = placed.wear ?? 0;
  // Une bille à son usure maximale a déjà quitté le triangle à la résolution.
  if (!Number.isInteger(wear) || wear < 0 || wear >= maxWearOf(placed.marble, MARBLE_TYPES)) {
    fail(`usure ${placed.wear} impossible pour ${placed.marble} en ${slot} (0 à ${maxWearOf(placed.marble, MARBLE_TYPES) - 1}).`);
  }
  return placed.bonus ? { marble: placed.marble, wear, bonus: { speed: 0, mass: 0, ...placed.bonus } } : { marble: placed.marble, wear };
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
  const base = createMarblesGame(description.seed ?? 0, { ...settings, bag: [] }, MARBLE_TYPES);
  const stage = description.stage ?? "play";
  if (!STAGES.includes(stage)) fail(`étape inconnue "${stage}".`);
  const turn = checkInteger(description.turn ?? 2, "turn", 1);
  if (turn > base.turnCount) fail(`tour ${turn} au-delà des ${base.turnCount} tours de la partie.`);
  const hand = marbleList(description.hand, "hand");
  if (hand.length > base.maxHandSize) fail(`main de ${hand.length} billes, plus que maxHandSize (${base.maxHandSize}).`);

  return {
    ...base,
    turn,
    stage,
    endReason: stage === "over" ? "turnsCompleted" : null,
    score: checkInteger(description.score ?? 0, "score", 0),
    speed: Number.isInteger(description.speed ?? 0) ? description.speed ?? 0 : fail("speed doit être un entier."),
    mass: Number.isInteger(description.mass ?? 1) ? description.mass ?? 1 : fail("mass doit être un entier."),
    swapUsed: description.swapUsed ?? false,
    hasPlaced: description.hasPlaced ?? false,
    triangle: Object.fromEntries(SLOTS.map((slot) => [slot, slotContent(triangle[slot], slot)])),
    hand,
    bag: marbleList(description.bag, "bag"),
    discard: marbleList(description.discard, "discard"),
  };
}

// Applique des actions dans l'ordre. -> { state, steps: [{ action, ok, error,
// events }] } : chaque action avec son journal, ou son refus (l'état reste alors
// celui d'avant, comme dans le réducteur).
export function applyActions(state, actions) {
  const steps = [];
  let current = state;
  for (const action of actions) {
    const result = marblesReduce(current, action, MARBLE_TYPES);
    steps.push({ action, ok: result.ok, error: result.error, events: result.events });
    current = result.state;
  }
  return { state: current, steps };
}
