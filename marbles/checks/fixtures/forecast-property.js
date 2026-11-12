// La propriété clé de la prévision du jeu des billes (marbles/core/forecast.js) :
// sur des parties jouées au hasard, à graine, la prévision de chaque action
// envisagée correspond exactement au résultat réel de cette action suivie de la
// résolution. Partagée par deux domaines : marbles-forecast la joue sur la table de
// billes des vérifications et sur des billes fabriquées, marbles-content sur la
// vraie table (son contrat).

import { SLOTS, legalActions } from "../../core/marbles.js";
import { readForecast } from "../../core/forecast.js";
import { createPicker } from "../helpers.js";

// Les comptes d'une série de parties : états visités, actions comparées, et les
// exceptions rencontrées (Éveils, billes inconnues mises en poche, choix réels).
export function emptyForecastTally() {
  return { states: 0, actions: 0, awakened: 0, unknownPockets: 0, choices: 0 };
}

// Les actions envisagées dans un état : aucune (la résolution seule), chaque pose,
// chaque échange.
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

// Compare la prévision de chaque action au réel. `tally` : les comparaisons
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
    // L'exception du choix (marbles/core/forecast.js) : un choix réel attend le
    // joueur, la prévision ne le devine pas ; elle doit l'avoir dit
    // (`choiceDependent`), et rien ne se compare.
    const choiceWaits = (result) => {
      if (!result.ok || !result.state.pendingChoice) return false;
      tally.choices += 1;
      if (!predicted.choiceDependent) faults.push(`choix réel sans prévision qui le dise : ${JSON.stringify(action)}`);
      return true;
    };
    if (choiceWaits(real)) continue;
    const resolved = marbles.reduce(real.state, { type: "resolve" });
    if (choiceWaits(resolved)) continue;
    if (!resolved.ok) {
      if (!predicted.ok) faults.push(`prévision refusée sur un tour 1 : ${predicted.error}`);
      continue;
    }
    tally.actions += 1;
    const actual = readForecast(real.events, resolved.events, resolved.state);
    const { uncertain, awakenPossible, ...certain } = predicted;
    // L'exception de l'Éveil (marbles/core/forecast.js) : un Éveil réel ne se
    // prévoit pas ; la prévision doit alors s'être dite incertaine, et seul ce qui
    // ne dépend d'aucun Éveil se compare. De même pour une bille piochée à l'aveugle
    // puis empochée : son identité, donc son entrée au pot, est inconnue.
    if (unknownPocket(predicted)) {
      tally.unknownPockets += 1;
      if (!uncertain) faults.push(`mise en poche inconnue sans prévision incertaine : ${JSON.stringify(action)}`);
      continue;
    }
    if (awakened(real.events, resolved.events)) {
      tally.awakened += 1;
      if (!uncertain) faults.push(`éveil réel sans prévision incertaine : ${JSON.stringify(action)}`);
      continue;
    }
    if (JSON.stringify(certain) !== JSON.stringify(actual)) {
      faults.push(`écart sur ${JSON.stringify(action)} : ${JSON.stringify(predicted)} au lieu de ${JSON.stringify(actual)}`);
    }
    if (resolved.state.score - state.score !== predicted.impact) {
      faults.push(`Impact prévu ${predicted.impact}, réel ${resolved.state.score - state.score}`);
    }
    // Les comptes tombent juste, lus indépendamment du journal d'Impact.
    const parts = [
      predicted.flick,
      predicted.knockout,
      predicted.hit,
      ...SLOTS.map((slot) => predicted.phases[slot]),
      ...SLOTS.flatMap((slot) => predicted.slotEffects[slot]),
      ...predicted.regenerations.flatMap(({ effects }) => effects),
      ...predicted.potEffects,
      ...predicted.potReactions,
    ]
      .filter((part) => part !== null)
      .flatMap(withEntries);
    const speed = parts.reduce((total, part) => total + part.speed, state.speed);
    if (speed !== predicted.speed) faults.push(`Vitesse prévue ${predicted.speed}, somme des effets ${speed}`);
  }
}

// Un effet prévu et les effets d'entrée au pot de ce qu'il a empoché, à plat.
// Les Éjections provoquées par ses Éjecter aussi.
function withEntries(outcome) {
  return [
    outcome,
    ...(outcome.pockets ?? []).flatMap((moved) => (moved.entry === null ? [] : withEntries(moved.entry))),
    ...(outcome.ejected ?? []).flatMap((ejected) => (ejected.knockout === null ? [] : withEntries(ejected.knockout))),
  ];
}

// Tous les effets d'une prévision, à plat.
function allOutcomes(predicted) {
  return [
    predicted.flick,
    predicted.knockout,
    predicted.hit,
    ...SLOTS.map((slot) => predicted.phases[slot]),
    ...SLOTS.flatMap((slot) => predicted.slotEffects[slot]),
    ...predicted.regenerations.flatMap(({ effects }) => effects),
    ...predicted.potEffects,
    ...predicted.potReactions,
  ]
    .filter((part) => part !== null && part !== undefined)
    .flatMap(withEntries);
}

// La prévision a-t-elle empoché une bille inconnue (piochée à l'aveugle) ?
function unknownPocket(predicted) {
  return allOutcomes(predicted).some((outcome) => (outcome.pockets ?? []).some((moved) => moved.marble === null));
}

// Un Éveil a-t-il joué (un effet) dans ces journaux ?
function awakened(...journals) {
  return journals.flat().some((event) => event.type === "effect" && event.trigger === "awaken");
}

// Joue une partie au hasard, à graine (un tirage de test, jamais le hasard de la
// partie), en comparant la prévision au réel à chaque état de jeu. Les écarts
// s'ajoutent à `faults` (des phrases), les comptes à `tally` (emptyForecastTally).
export function walkForecastGame(marbles, seed, options, faults, tally) {
  const pick = createPicker(seed);
  let state = marbles.createGame(seed, options);
  let guard = 0;
  while (state.stage !== "over" && guard < 400) {
    guard += 1;
    if (state.pendingChoice) {
      const answers = legalActions(state);
      state = marbles.reduce(state, answers[pick(answers.length)]).state;
      continue;
    }
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
