// JEU DES BILLES — simulation pure : aucun DOM, aucun son, aucun aléa non
// seedé. Règles, format des billes et interface : doc/marbles.md.
//
// ÉTAT sérialisable, à part entière (jamais lié à la session du jeu principal,
// aucune persistance aujourd'hui) :
//   { rngState, handSize, turnCount, turn, score, stage, endReason,
//     bag, hand, discard, triangle, swapUsed, hasPlaced }
// bag, hand et discard sont des listes d'ids de billes (doublons permis). Une
// bille n'a d'usure que SUR le triangle, { marble, wear } : une bille qui en
// sort perd donc son usure par construction, et repart à zéro quand elle
// revient. Le sommet du sac est bag[0].
//
// `stage` découpe le tour : "draw" (la pioche reste à faire), "play" (échange
// et pose, jusqu'à la résolution), "over" (partie finie, endReason dit
// pourquoi : "turnsCompleted" ou "bagExhausted"). À la fin d'une résolution,
// `turn` passe au tour suivant, sauf si la partie s'arrête : il reste alors
// sur le dernier tour joué, jamais « 10 sur 9 ».
//
// ACTIONS — marblesReduce(state, action) :
//   { type: "draw" }                            pioche du tour
//   { type: "swap", a, b }                      échange deux emplacements
//   { type: "place", handIndex, slot }          pose une bille de la main
//   { type: "resolve" }                         résout le tour, retrait, rotation
// Résultat, toujours la même forme : { ok, state, events, error }. Refus :
// ok false, `state` inchangé, `events` vide, `error` un code de MARBLE_ERRORS
// (son texte : `marbles.error.<code>`). Rien n'est jamais levé pour une
// action interdite.
//
// JOURNAL — `events`, dans l'ordre où ça se passe. Interface et son s'appuient
// sur lui seul (view/marbles/narration.js, view/marbles/sounds.js) :
//   turnStarted { turn, turnCount }, draw { marble }, bagRegenerated { size },
//   swapped { a, b }, replaced { slot, marble }, placed { slot, marble },
//   phase { slot, marble }, phaseSkipped { slot },
//   effect { slot, marble, speedDelta, massDelta, speed, mass },
//   wear { slot, marble, wear, maxWear },
//   impact { speed, mass, impact, score },
//   retired { slot, marble }, rotation { triangle },
//   gameOver { reason, score }.
//
// `types` (dernier paramètre des fonctions qui lisent une bille) : la table des
// billes, par défaut celle du jeu. Injectable pour les vérifications, qui
// testent ainsi ce qu'aucune bille actuelle ne produit (une Masse négative).

import { MARBLES_SETTINGS, MARBLE_TYPES, STARTING_BAG } from "../config/marbles-values.js";
import { createSeed, nextRandom } from "./rng.js";
import { rejectUnknownFields } from "../lib/validate.js";

// Emplacements, dans l'ordre de RÉSOLUTION (phases de base gauche, de base
// droite, de pointe).
export const SLOTS = ["leftBase", "rightBase", "apex"];

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
  "triangleIncomplete",
];

// --- Table des billes ---

function validateEffect(effect, describe, fail) {
  if (!effect || typeof effect !== "object" || Array.isArray(effect)) fail(`${describe} : effet absent ({} : aucun effet).`);
  rejectUnknownFields(effect, ["speed", "mass"], describe, fail);
  for (const [field, value] of Object.entries(effect)) {
    if (!Number.isInteger(value)) fail(`${describe} : ${field} doit être un entier.`);
  }
}

// Échoue au chargement sur une table mal formée. Exportée pour vérifier le
// rejet sur des tables fabriquées ; ce module valide la vraie plus bas.
export function validateMarbleTypes(types) {
  const fail = (message) => {
    throw new Error(`marbles : ${message}`);
  };
  if (Object.keys(types).length === 0) fail("table des billes vide.");
  for (const [id, type] of Object.entries(types)) {
    rejectUnknownFields(type, ["base", "apex", "baseVariant", "maxWear"], `bille "${id}"`, fail);
    validateEffect(type.base, `bille "${id}", base`, fail);
    validateEffect(type.apex, `bille "${id}", apex`, fail);
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

// Une partie à trois emplacements ne se joue pas sans au moins une bille en
// main et un tour : la valeur fausse échouerait sinon en pleine partie.
function validateGameSettings({ handSize, turnCount, bag }, types) {
  if (!Number.isInteger(handSize) || handSize < 1) throw new Error("marbles : handSize doit être un entier >= 1.");
  if (!Number.isInteger(turnCount) || turnCount < 1) throw new Error("marbles : turnCount doit être un entier >= 1.");
  for (const id of bag) {
    if (!Object.hasOwn(types, id)) throw new Error(`marbles : bille inconnue "${id}" dans le sac.`);
  }
}

validateMarbleTypes(MARBLE_TYPES);
validateGameSettings({ ...MARBLES_SETTINGS, bag: STARTING_BAG }, MARBLE_TYPES);

export function maxWearOf(marble, types = MARBLE_TYPES) {
  return types[marble].maxWear ?? MARBLES_SETTINGS.defaultMaxWear;
}

// L'effet d'une bille à un emplacement, variante de base comprise.
export function effectAt(marble, slot, types = MARBLE_TYPES) {
  const type = types[marble];
  if (slot === "apex") return type.apex;
  return type.baseVariant?.[slot] ?? type.base;
}

// Vitesse × Masse d'un tour. Les planchers valent pour ce calcul final, jamais
// pendant l'accumulation : une Vitesse à -3 que la phase suivante remonte de 4
// finit à 1.
export function impactOf(speed, mass) {
  return Math.max(0, speed) * Math.max(1, mass);
}

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

// `seed` : nombre ou chaîne (core/rng.js/createSeed). `options` (facultatif) :
// bag, handSize, turnCount, sinon les réglages du prototype.
export function createMarblesGame(seed, options = {}, types = MARBLE_TYPES) {
  const { bag = STARTING_BAG, handSize = MARBLES_SETTINGS.handSize, turnCount = MARBLES_SETTINGS.turnCount } = options;
  validateGameSettings({ handSize, turnCount, bag }, types);
  const shuffle = shuffled(bag, createSeed(seed));
  return {
    rngState: shuffle.rngState,
    handSize,
    turnCount,
    turn: 1,
    score: 0,
    stage: "draw",
    endReason: null,
    bag: shuffle.list,
    hand: [],
    discard: [],
    triangle: { leftBase: null, rightBase: null, apex: null },
    swapUsed: false,
    hasPlaced: false,
  };
}

// --- Refus ---

function stageRefusal(state, expected) {
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
  if (state.hasPlaced) return "swapAfterPlacement"; // l'échange précède la pose
  return null;
}

// Cette pose est-elle permise ? Le code du refus, ou null. Exportée pour que
// l'interface ne demande pas de confirmer un remplacement qui serait refusé.
//
// Au premier tour, le triangle doit être plein pour résoudre, et la main ne se
// recomplète qu'au tour suivant : remplacer trop de billes laisserait la
// partie sans issue. Une pose qui ne laisse plus assez de billes en main pour
// remplir les emplacements vides est donc refusée.
export function placeRefusal(state, handIndex, slot) {
  const refusal = stageRefusal(state, "play");
  if (refusal) return refusal;
  if (!isSlot(slot)) return "invalidSlot";
  if (!Number.isInteger(handIndex) || handIndex < 0 || handIndex >= state.hand.length) return "invalidHandIndex";
  if (state.turn === 1) {
    const emptyAfter = emptySlotCount(state.triangle) - (state.triangle[slot] === null ? 1 : 0);
    if (state.hand.length - 1 < emptyAfter) return "placementBlocksTriangle";
  }
  return null;
}

// --- Actions ---

function refused(state, error) {
  return { ok: false, state, events: [], error };
}

function accepted(state, events) {
  return { ok: true, state, events, error: null };
}

// Pioche : compléter la main. Sac vide alors qu'il manque encore une bille :
// la défausse, mélangée, devient le sac, et la partie s'arrête s'il compte
// moins de billes que le triangle n'a d'emplacements. Ce test n'a lieu qu'à
// une régénération : un sac qui se vide juste quand la main est complète ne
// régénère rien tant qu'aucune bille n'est demandée.
function draw(state) {
  const refusal = stageRefusal(state, "draw");
  if (refusal) return refused(state, refusal);

  const events = [{ type: "turnStarted", turn: state.turn, turnCount: state.turnCount }];
  let { rngState, bag, discard } = state;
  const hand = [...state.hand];
  bag = [...bag];

  while (hand.length < state.handSize) {
    if (bag.length === 0) {
      const shuffle = shuffled(discard, rngState);
      rngState = shuffle.rngState;
      bag = shuffle.list;
      discard = [];
      events.push({ type: "bagRegenerated", size: bag.length });
      if (bag.length < SLOTS.length) {
        events.push({ type: "gameOver", reason: "bagExhausted", score: state.score });
        return accepted({ ...state, rngState, bag, discard, hand, stage: "over", endReason: "bagExhausted" }, events);
      }
    }
    const marble = bag.shift();
    hand.push(marble);
    events.push({ type: "draw", marble });
  }

  return accepted({ ...state, rngState, bag, discard, hand, stage: "play", swapUsed: false, hasPlaced: false }, events);
}

// Échange : le contenu de deux emplacements, usure comprise. Un emplacement
// vide fait de l'échange un simple déplacement ; deux vides n'échangeraient
// rien et gâcheraient l'échange du tour, c'est refusé.
function swap(state, { a, b }) {
  const refusal = swapRefusal(state);
  if (refusal) return refused(state, refusal);
  if (!isSlot(a) || !isSlot(b)) return refused(state, "invalidSlot");
  if (a === b) return refused(state, "swapSameSlot");
  if (state.triangle[a] === null && state.triangle[b] === null) return refused(state, "swapBothEmpty");

  const triangle = { ...state.triangle, [a]: state.triangle[b], [b]: state.triangle[a] };
  return accepted({ ...state, triangle, swapUsed: true }, [{ type: "swapped", a, b }]);
}

// Pose : la bille quitte la main ; une bille déjà là part à la défausse (la
// confirmation est l'affaire de l'interface).
function place(state, { handIndex, slot }) {
  const refusal = placeRefusal(state, handIndex, slot);
  if (refusal) return refused(state, refusal);

  const marble = state.hand[handIndex];
  const hand = state.hand.filter((_, index) => index !== handIndex);
  const previous = state.triangle[slot];
  const events = [];
  let { discard } = state;
  if (previous !== null) {
    discard = [...discard, previous.marble];
    events.push({ type: "replaced", slot, marble: previous.marble });
  }
  events.push({ type: "placed", slot, marble });

  const triangle = { ...state.triangle, [slot]: { marble, wear: 0 } };
  return accepted({ ...state, hand, discard, triangle, hasPlaced: true }, events);
}

// Base gauche -> pointe, pointe -> base droite, base droite -> base gauche ;
// les emplacements vides tournent aussi.
function rotated(triangle) {
  return { apex: triangle.leftBase, rightBase: triangle.apex, leftBase: triangle.rightBase };
}

// Résolution, retrait, rotation : tout s'enchaîne d'un bloc, le journal garde
// le détail pour le dire étape par étape.
function resolve(state, types) {
  const refusal = stageRefusal(state, "play");
  if (refusal) return refused(state, refusal);
  if (state.turn === 1 && emptySlotCount(state.triangle) > 0) return refused(state, "triangleIncomplete");

  const events = [];
  const triangle = { ...state.triangle };
  let speed = 0;
  let mass = 1;

  for (const slot of SLOTS) {
    const placed = triangle[slot];
    if (placed === null) {
      events.push({ type: "phaseSkipped", slot });
      continue;
    }
    const { marble } = placed;
    events.push({ type: "phase", slot, marble });

    const effect = effectAt(marble, slot, types);
    const speedDelta = effect.speed ?? 0;
    const massDelta = effect.mass ?? 0;
    speed += speedDelta;
    mass += massDelta;
    events.push({ type: "effect", slot, marble, speedDelta, massDelta, speed, mass });

    // Une bille joue son effet même si cette usure l'amène à son maximum.
    const wear = placed.wear + 1;
    triangle[slot] = { marble, wear };
    events.push({ type: "wear", slot, marble, wear, maxWear: maxWearOf(marble, types) });
  }

  const impact = impactOf(speed, mass);
  const score = state.score + impact;
  events.push({ type: "impact", speed, mass, impact, score });

  const discard = [...state.discard];
  for (const slot of SLOTS) {
    const placed = triangle[slot];
    if (placed !== null && placed.wear >= maxWearOf(placed.marble, types)) {
      discard.push(placed.marble);
      triangle[slot] = null;
      events.push({ type: "retired", slot, marble: placed.marble });
    }
  }

  const nextTriangle = rotated(triangle);
  events.push({ type: "rotation", triangle: nextTriangle });

  const after = { ...state, score, discard, triangle: nextTriangle };
  if (state.turn >= state.turnCount) {
    events.push({ type: "gameOver", reason: "turnsCompleted", score });
    return accepted({ ...after, stage: "over", endReason: "turnsCompleted" }, events);
  }
  return accepted({ ...after, turn: state.turn + 1, stage: "draw" }, events);
}

// Le réducteur : pur, ne modifie jamais `state`. Même état + même action =
// même résultat.
export function marblesReduce(state, action, types = MARBLE_TYPES) {
  switch (action?.type) {
    case "draw":
      return draw(state);
    case "swap":
      return swap(state, action);
    case "place":
      return place(state, action);
    case "resolve":
      return resolve(state, types);
    default:
      return refused(state, "unknownAction");
  }
}
