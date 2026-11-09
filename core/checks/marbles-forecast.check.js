// Vérifications du core — domaine « marbles-forecast ». La prévision du jeu des
// billes (core/marbles-forecast.js) : les cas nécessaires, ses garde-fous, et la
// propriété clé : sur des centaines d'états aléatoires à graine, la prévision de
// chaque action envisagée correspond exactement au résultat réel de cette action
// suivie de la résolution. Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js marbles-forecast`).

import { nextRandom } from "../rng.js";
import { SLOTS, createMarblesGame, marblesReduce } from "../marbles.js";
import { forecast, readForecast } from "../marbles-forecast.js";
import MARBLE_TYPES from "../../marbles/types/index.js";
import { createMarblesRules } from "../marbles-rules.js";

// Les règles du jeu, liées à la vraie table (core/marbles-rules.js).
const rules = createMarblesRules(MARBLE_TYPES);

const placed = (marble, wear = 0) => ({ marble, wear });

function playState(over = {}) {
  return { ...rules.createGame(1, { bag: [] }), turn: 2, stage: "play", ...over };
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export default function checkMarblesForecast(run) {
  checkCases(run);
  checkGuards(run);
  checkMatchesReality(run);
}

function checkCases(run) {
  // Bille active, sur le triangle actuel : bonus reçu annoncé chez elle.
  const triangle = { leftBase: placed("magnifier"), rightBase: placed("glass"), apex: placed("shooter") };
  const current = rules.forecast(playState({ triangle, hand: ["clay", "agate"] }));
  run.same("triangle actuel : le calot, bonus compris", { marble: "shooter", speed: 12, mass: 0, given: [] }, current.phases.apex);
  run.same(
    "triangle actuel : la loupe dit ce qu'elle donne",
    { marble: "magnifier", speed: 0, mass: 0, given: [{ slot: "apex", marble: "shooter", speed: 4, mass: 0 }] },
    current.phases.leftBase
  );
  run.same("triangle actuel : le verre", { marble: "glass", speed: 0, mass: 1, given: [] }, current.phases.rightBase);
  run("triangle actuel : ni Éjection", null, current.knockout);
  run("triangle actuel : ni Tic", null, current.hit);
  run("triangle actuel : Impact du tour", 24, current.impact);
  const holes = rules.forecast(playState({ triangle: { leftBase: null, rightBase: null, apex: placed("clay") } }));
  run("triangle actuel : emplacement vide", null, holes.phases.leftBase);

  // Bille de la main, posée : triangle simulé, Éjection et Tic compris.
  const state = playState({ triangle, hand: ["clay", "agate"] });
  const replacing = rules.forecast(state, { type: "place", handIndex: 0, slot: "apex" });
  run.same("pose : effet de phase sur le triangle simulé", { marble: "clay", speed: 8, mass: 0, given: [] }, replacing.phases.apex);
  run.same("pose : Éjection de la bille remplacée", { marble: "shooter", speed: 3, mass: 0, given: [] }, replacing.knockout);
  run.same("pose : Tic de la bille posée", { marble: "clay", speed: 2, mass: 0, given: [] }, replacing.hit);
  run("pose : Vitesse totale, Éjection et Tic compris", 13, replacing.speed);

  const noBonus = rules.forecast(state, { type: "place", handIndex: 1, slot: "apex" });
  run.same("pose : une agate ne reçoit rien de la loupe", { marble: "agate", speed: 0, mass: 2, given: [] }, noBonus.phases.apex);
  run.same("pose : la loupe ne donne plus rien", [], noBonus.phases.leftBase.given);
  run.same("pose : Tic de l'agate", { marble: "agate", speed: 0, mass: 1, given: [] }, noBonus.hit);

  const withLens = rules.forecast(playState({ hand: ["magnifier"], triangle: { leftBase: null, rightBase: null, apex: placed("clay") } }), { type: "place", handIndex: 0, slot: "leftBase" });
  run("pose sur vide : le bonus s'annonce chez la bille qui le reçoit", 8, withLens.phases.apex.speed);
  run("pose sur vide : ni Éjection", null, withLens.knockout);
  run("pose sur vide : ni Tic", null, withLens.hit);

  const plain = rules.forecast(playState({ hand: ["glass"], triangle: { leftBase: null, rightBase: null, apex: placed("mica") } }), { type: "place", handIndex: 0, slot: "apex" });
  run("sans Éjection imprimée : rien à prévoir", null, plain.knockout);
  run("sans Tic imprimé : rien à prévoir", null, plain.hit);

  // Échange : le moteur le prend comme le reste, sans Tic ni Éjection.
  const swapped = rules.forecast(state, { type: "swap", a: "leftBase", b: "rightBase" });
  run("échange : la loupe en base droite, Vitesse +1", 1, swapped.phases.rightBase.speed);
  run("échange : plus de bonus sur le calot", 8, swapped.phases.apex.speed);
  run("échange : ni Éjection", null, swapped.knockout);

  // Compteurs déjà modifiés : la résolution en part.
  const counters = rules.forecast(playState({ speed: 5, mass: 2, triangle: { leftBase: null, rightBase: null, apex: placed("clay") } }));
  run("compteurs : la prévision en part", 18, counters.impact);

  // Tour 1 : le triangle incomplet ne se résout pas encore, mais se prévoit.
  const firstTurn = apply(rules.createGame(42), { type: "draw" });
  const partial = rules.forecast(firstTurn, { type: "place", handIndex: 0, slot: "apex" });
  run("tour 1 : la prévision passe sur un triangle incomplet", true, partial.ok);
  run("tour 1 : le triangle réel est refusé, lui", "triangleIncomplete", rules.reduce(firstTurn, { type: "resolve" }).error);
}

function apply(state, action) {
  const result = rules.reduce(state, action);
  if (!result.ok) throw new Error(`action refusée (${result.error}) : ${JSON.stringify(action)}`);
  return result.state;
}

function checkGuards(run) {
  // Jamais de modification : ni l'état réel, ni le générateur, ni le sac.
  const game = apply(rules.createGame(77), { type: "draw" });
  const state = deepFreeze({
    ...game,
    turn: 2,
    triangle: { leftBase: placed("magnifier"), rightBase: placed("giant", 0), apex: placed("shooter", 2) },
  });
  const before = JSON.stringify(state);
  rules.forecast(state);
  rules.forecast(state, { type: "place", handIndex: 0, slot: "apex" });
  rules.forecast(state, { type: "swap", a: "leftBase", b: "apex" });
  run("garde-fou : état réel intact, sur un état figé", before, JSON.stringify(state));

  // Rien de caché n'influe : même prévision quel que soit le sac ou le hasard.
  const action = { type: "place", handIndex: 0, slot: "apex" };
  const reference = rules.forecast(state, action);
  run.same("garde-fou : le sac n'influe pas", reference, rules.forecast({ ...state, bag: ["giant", "giant"] }, action));
  run.same("garde-fou : l'état du hasard n'influe pas", reference, rules.forecast({ ...state, rngState: state.rngState + 1 }, action));
  run.same("garde-fou : la défausse et l'ordre de pioche n'influent pas sur l'avenir", reference, rules.forecast({ ...state, bag: [...state.bag].reverse() }, action));

  // Le réel se joue ensuite exactement comme sans prévision.
  const untouched = apply(rules.createGame(77), { type: "draw" });
  const looked = apply(rules.createGame(77), { type: "draw" });
  rules.forecast(looked, { type: "place", handIndex: 0, slot: "apex" });
  run.same("garde-fou : prévoir ne change rien au réel", rules.reduce(untouched, { type: "place", handIndex: 0, slot: "apex" }), rules.reduce(looked, { type: "place", handIndex: 0, slot: "apex" }));

  // Refus : mêmes codes que le réducteur, jamais de pioche envisagée.
  const before1 = rules.createGame(77);
  run("refus : avant la pioche", "mustDraw", rules.forecast(before1).error);
  run("refus : une pioche ne s'envisage pas", "unknownAction", rules.forecast(state, { type: "draw" }).error);
  run("refus : une résolution ne s'envisage pas", "unknownAction", rules.forecast(state, { type: "resolve" }).error);
  run("refus : pose impossible, code du réducteur", "invalidHandIndex", rules.forecast(state, { type: "place", handIndex: 9, slot: "apex" }).error);
  run("refus : échange impossible, code du réducteur", "swapSameSlot", rules.forecast(state, { type: "swap", a: "apex", b: "apex" }).error);
  run("refus : partie finie", "gameOver", rules.forecast({ ...state, stage: "over" }).error);
}

// Des billes fictives qui mêlent cibles, conditions et valeurs négatives : ce que
// la table du jeu ne fait pas encore.
const MIXED_TYPES = {
  plain: { base: [{ action: "speed", amount: 1 }], apex: [{ action: "speed", amount: 3 }] },
  heavy: { base: [{ action: "mass", amount: 2 }], apex: [{ action: "mass", amount: -1 }], maxWear: 2 },
  giver: {
    base: [{ action: "speed", amount: 2, target: "apex" }, { action: "mass", amount: 1, target: "rightBase" }],
    hit: [{ action: "speed", amount: 2, target: "apex" }, { action: "speed", amount: 1 }],
    knockout: [{ action: "speed", amount: 3, target: "leftBase" }],
  },
  lens: {
    baseVariant: { leftBase: [{ action: "speed", amount: 4, target: "apex", when: { type: "printedStat", slot: "apex", stat: "speed", atLeast: 1 } }] },
    apex: [{ action: "speed", amount: 2, when: { type: "printedStat", slot: "leftBase", stat: "mass", atLeast: 1 } }],
    hit: [{ action: "mass", amount: 1, when: { type: "printedStat", slot: "rightBase", stat: "speed", atLeast: 1 } }],
  },
  thief: { knockout: [{ action: "speed", amount: -4 }, { action: "mass", amount: -2 }], apex: [{ action: "speed", amount: -2 }], maxWear: 1 },
};
const mixedRules = createMarblesRules(MIXED_TYPES);

function candidateActions(state) {
  const actions = [null];
  state.hand.forEach((_, handIndex) => {
    for (const slot of SLOTS) actions.push({ type: "place", handIndex, slot });
  });
  for (let i = 0; i < SLOTS.length; i++) {
    for (let j = i + 1; j < SLOTS.length; j++) actions.push({ type: "swap", a: SLOTS[i], b: SLOTS[j] });
  }
  return actions;
}

// Compare la prévision de chaque action au réel. `compared` : les comparaisons
// faites (une action refusée ou un triangle du tour 1 incomplet n'a pas de réel
// à quoi se comparer, la prévision doit alors dire le même refus).
function compareState(state, marbles, faults, tally) {
  tally.states += 1;
  for (const action of candidateActions(state)) {
    const predicted = marbles.forecast(state, action);
    const real = action === null ? { ok: true, state, events: [] } : marbles.reduce(state, action);
    if (!real.ok) {
      if (predicted.error !== real.error) faults.push(`refus différent : ${predicted.error} au lieu de ${real.error}`);
      continue;
    }
    const resolved = marbles.reduce(real.state, { type: "resolve" });
    if (!resolved.ok) {
      if (!predicted.ok) faults.push(`prévision refusée sur un tour 1 : ${predicted.error}`);
      continue;
    }
    tally.actions += 1;
    const actual = readForecast(real.events, resolved.events);
    if (JSON.stringify(predicted) !== JSON.stringify(actual)) {
      faults.push(`écart sur ${JSON.stringify(action)} : ${JSON.stringify(predicted)} au lieu de ${JSON.stringify(actual)}`);
    }
    if (resolved.state.score - state.score !== predicted.impact) {
      faults.push(`Impact prévu ${predicted.impact}, réel ${resolved.state.score - state.score}`);
    }
    // Les comptes tombent juste, lus indépendamment du journal d'Impact.
    const parts = [predicted.knockout, predicted.hit, ...SLOTS.map((slot) => predicted.phases[slot])].filter((part) => part !== null);
    const speed = parts.reduce((total, part) => total + part.speed, state.speed);
    if (speed !== predicted.speed) faults.push(`Vitesse prévue ${predicted.speed}, somme des effets ${speed}`);
  }
}

// Joue une partie au hasard, à graine (un PRNG de test, jamais celui de la
// partie), en comparant à chaque état de jeu.
function walkGame(seed, options, marbles, faults, tally) {
  let rngState = seed >>> 0;
  const pick = (count) => {
    const { value, state: next } = nextRandom(rngState);
    rngState = next;
    return Math.floor(value * count);
  };
  let state = marbles.createGame(seed, options);
  let guard = 0;
  while (state.stage !== "over" && guard < 400) {
    guard += 1;
    if (state.stage === "draw") {
      state = marbles.reduce(state, { type: "draw" }).state;
      continue;
    }
    compareState(state, marbles, faults, tally);
    const roll = pick(5);
    if (roll === 0) state = marbles.reduce(state, { type: "swap", a: SLOTS[pick(3)], b: SLOTS[pick(3)] }).state;
    else if (roll <= 2) state = marbles.reduce(state, { type: "place", handIndex: pick(state.maxHandSize), slot: SLOTS[pick(3)] }).state;
    else state = marbles.reduce(state, { type: "resolve" }).state;
  }
}

function checkMatchesReality(run) {
  const faults = [];
  const tally = { states: 0, actions: 0 };
  const mixedBag = ["plain", "plain", "heavy", "giver", "giver", "lens", "lens", "thief", "thief", "plain"];
  for (let seed = 1; seed <= 60; seed++) {
    walkGame(seed, {}, rules, faults, tally);
    walkGame(seed + 1000, { bag: mixedBag }, mixedRules, faults, tally);
  }
  run.same("propriété : la prévision correspond au résultat réel", [], faults.slice(0, 3));
  run("propriété : plusieurs centaines d'états", true, tally.states >= 300);
  run("propriété : des milliers d'actions comparées", true, tally.actions >= 2000);
}
