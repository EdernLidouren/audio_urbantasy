// JEU DES BILLES — les DÉFINITIONS DE PARTIE : ce qu'une partie EST, entièrement en
// données. Ses valeurs de départ, son sac, sa durée, son objectif et ses règles ; la
// partie du jeu est la définition par défaut, un défi n'en sera qu'une de plus.
// Simulation pure : aucun DOM, aucun son, aucun hasard non seedé.
//
// LES DÉFINITIONS sont un registre de contenu (marbles/content/definitions/, une par
// fichier), que le core n'importe JAMAIS (CLAUDE.md) : les règles
// (marbles/core/rules.js/createMarblesRules) le reçoivent et le valident à la
// composition (marbles/core/validation.js/validateGameDefinition) ; une partie se crée
// D'APRÈS une définition (createGame(seed, definition)), du registre ou lue d'un
// fichier par les outils, validée de même.
//
// UNE DÉFINITION :
//   id     son identifiant ; ses textes en découlent : `marbles.definition.<id>.name`
//          (en minuscules) et `.description` (ceux du registre, obligatoires) ;
//   start  ses valeurs de DÉPART (START_KEYS) : `firstTurnDraw`, la pioche du premier
//          tour ; `drawPerTurn`, celle des tours suivants ; `handSize`, `throws`,
//          `potCapacity`, la valeur de départ des CARACTÉRISTIQUES (taille de main,
//          lancers par tour, capacité du pot), que des statuts changent
//          (marbles/core/statuses.js/characteristic) ;
//   bag    son SAC DE DÉPART (BAG_KINDS) : { kind: "list", marbles }, une liste fixe
//          d'ids (doublons permis) ; { kind: "random", size, maxCopies }, `size` billes
//          tirées dans la table, chacune au plus `maxCopies` fois (null : sans limite) ;
//   turns  son nombre de tours : la partie s'arrête après la résolution du dernier ;
//          null, sans limite (un objectif qui le permet seulement : GOALS) ;
//   goal   son OBJECTIF, { kind, ... } (GOALS) : comment le résultat se juge ; QUAND la
//          partie s'arrête, ce sont les CONDITIONS DE FIN (END_CONDITIONS), qui
//          découlent du nombre de tours et de l'objectif, plus la pioche impossible,
//          commune à tous ;
//   rules  ses RÈGLES, une liste (vide : aucune).
//
// SÉRIALISATION : l'état porte une COPIE de sa définition (`state.definition`), jamais
// une référence au registre. Une définition lue d'un fichier n'est dans aucun
// registre ; un état construit à la main, une prévision, la reprise d'un choix restent
// ainsi autonomes, et la partie ne change pas si le registre change ensuite. Une
// copie ne se modifie jamais : ce que la partie change (les statuts) vit à part.

import { createSeed, nextRandom } from "../../lib/rng.js";

// Les valeurs de départ (en-tête), dans l'ordre de leur validation.
export const START_KEYS = Object.freeze(["firstTurnDraw", "drawPerTurn", "handSize", "throws", "potCapacity"]);

// Les sortes de sac de départ (en-tête) : `fields`, ses champs ; `build(bag, seed,
// ids)`, la liste des billes de départ, avant le mélange, d'après la graine de la
// partie et les ids de la table.
export const BAG_KINDS = Object.freeze({
  list: { fields: ["kind", "marbles"], build: (bag) => [...bag.marbles] },
  // Tirée par son PROPRE générateur, à graine dérivée de celle de la partie : le
  // hasard de la partie (mélanges, régénérations) n'en dépend pas.
  random: { fields: ["kind", "size", "maxCopies"], build: (bag, seed, ids) => randomBag(bag, createSeed(`bag/${seed}`), ids) },
});

// LES PALIERS d'une partie libre, du plus bas au plus haut ; "none" : aucun atteint.
export const TIERS = Object.freeze(["bronze", "silver", "gold"]);

// Le palier atteint par `score` (`tiers`, les seuils de l'objectif), ou "none".
export function tierOf(score, tiers) {
  return TIERS.filter((tier) => score >= tiers[tier]).at(-1) ?? "none";
}

// Les tours TENUS d'une partie d'endurance : ceux dont l'Impact a atteint le minimum.
// La partie s'arrête au premier tour raté : tous les tours finis avant le tour en cours
// ont été tenus ; à la fin, le dernier aussi, si la partie s'est arrêtée à son nombre
// de tours (`end`, la condition de fin, celle du résultat par défaut).
export function turnsHeld(state, end = state.result?.end ?? null) {
  return end === "lastTurn" ? state.turn : state.turn - 1;
}

// Les OBJECTIFS (en-tête) : COMMENT le résultat se juge, { kind, ... }. Chacun :
//   fields  ses champs ;
//   turns   "required", la définition donne son nombre de tours ; "optional", null
//           permis (une partie sans limite de tours) ;
//   validate(goal, fail)  ses champs propres (marbles/core/validation.js) ;
//   judge(state, end)  son résultat, à la fin de la partie (`end`, la condition de fin
//           atteinte) : les champs propres à l'objectif (gameResult y ajoute le reste).
// Trois objectifs :
//   free       { kind, tiers: { bronze, silver, gold } } : la partie va à son dernier
//              tour ; le résultat est le PALIER atteint par le score (tierOf) ;
//   target     { kind, score } : atteindre `score` en `turns` tours au plus ; VICTOIRE
//              dès que le score l'atteint (après l'Impact, la partie s'arrête), ÉCHEC si
//              la partie finit sans ;
//   endurance  { kind, minimum } : chaque tour, l'Impact doit atteindre `minimum` ; la
//              partie s'arrête au premier tour raté ; le résultat est le nombre de tours
//              tenus (turnsHeld) ; `turns`, facultatif, termine la partie en SUCCÈS.
export const GOALS = Object.freeze({
  free: {
    fields: ["kind", "tiers"],
    turns: "required",
    // Des seuils entiers, strictement croissants du bronze à l'or.
    validate: (goal, fail) => {
      if (goal.tiers === null || typeof goal.tiers !== "object") fail("tiers doit être { bronze, silver, gold }.");
      if (Object.keys(goal.tiers).sort().join() !== [...TIERS].sort().join()) fail(`tiers doit donner exactement ${TIERS.join(", ")}.`);
      TIERS.forEach((tier, index) => {
        if (!Number.isInteger(goal.tiers[tier]) || goal.tiers[tier] < 1) fail(`tiers.${tier} doit être un entier >= 1.`);
        if (index > 0 && goal.tiers[tier] <= goal.tiers[TIERS[index - 1]]) fail(`tiers.${tier} doit dépasser tiers.${TIERS[index - 1]}.`);
      });
    },
    judge: (state) => ({ tier: tierOf(state.score, state.definition.goal.tiers) }),
  },
  target: {
    fields: ["kind", "score"],
    turns: "required",
    validate: (goal, fail) => {
      if (!Number.isInteger(goal.score) || goal.score < 1) fail("score doit être un entier >= 1.");
    },
    judge: (state) => ({ outcome: state.score >= state.definition.goal.score ? "victory" : "defeat" }),
  },
  endurance: {
    fields: ["kind", "minimum"],
    turns: "optional",
    validate: (goal, fail) => {
      if (!Number.isInteger(goal.minimum) || goal.minimum < 1) fail("minimum doit être un entier >= 1.");
    },
    judge: (state, end) => ({ held: turnsHeld(state, end), outcome: end === "lastTurn" ? "success" : "ended" }),
  },
});

// Les CONDITIONS DE FIN : QUAND la partie s'arrête, séparées de l'objectif qui juge le
// résultat. Vérifiées à des MOMENTS FIXES, dans l'ordre de cette liste (la première
// atteinte l'emporte) :
//   "afterImpact"  après le calcul de l'Impact d'une résolution (le score à jour) ; la
//                  résolution se termine ensuite comme au dernier tour : rotation, fin
//                  du tour, sans fin des statuts ; puis la fin de partie ;
//   "turnDraw"     à la pioche du début de tour, après la pioche ; la partie s'arrête
//                  avant la phase de jeu, le tour n'est pas joué.
// Chacune :
//   id        son identifiant, celui du résultat (`end`) ;
//   moment    son moment ;
//   applies(definition)  vrai si la définition l'a ;
//   reached(state, context)  vrai si elle est atteinte (`context.impact`, l'Impact du
//             tour, au moment "afterImpact").
// AJOUTER une condition : une entrée ici, et son moment dans marbles/core/marbles.js
// s'il est nouveau.
const END_CONDITIONS = Object.freeze([
  // Cible : le score l'atteint, victoire aussitôt (même au dernier tour).
  { id: "targetReached", moment: "afterImpact", applies: (definition) => definition.goal.kind === "target", reached: (state) => state.score >= state.definition.goal.score },
  // Endurance : un tour raté, la partie s'arrête (même au dernier tour : pas de succès).
  { id: "impactMissed", moment: "afterImpact", applies: (definition) => definition.goal.kind === "endurance", reached: (state, { impact }) => impact < state.definition.goal.minimum },
  // Le dernier tour de la définition est résolu.
  { id: "lastTurn", moment: "afterImpact", applies: (definition) => definition.turns !== null, reached: (state) => state.turn >= state.definition.turns },
  // PIOCHE IMPOSSIBLE, commune à tous les objectifs : après la pioche, plus rien à
  // jouer, ni en main, ni sur le triangle, ni au sac, ni à la défausse (les billes
  // perdues, envoyées au pot plein, ne reviennent jamais). Seul le pot reste.
  {
    id: "noMarbles",
    moment: "turnDraw",
    applies: () => true,
    reached: (state) => state.hand.length === 0 && state.bag.length === 0 && state.discard.length === 0 && Object.values(state.triangle).every((placed) => placed === null),
  },
]);

// La condition de fin atteinte à ce `moment`, ou null.
export function endReached(state, moment, context = {}) {
  return END_CONDITIONS.find((condition) => condition.moment === moment && condition.applies(state.definition) && condition.reached(state, context))?.id ?? null;
}

// LE RÉSULTAT d'une partie qui finit par la condition `end` : { goal, end, score, ... }
// et les champs de son objectif (GOALS, judge). Porté par l'état (`result`) et par
// l'évènement `gameOver`.
export function gameResult(state, end) {
  const { kind } = state.definition.goal;
  return { goal: kind, end, score: state.score, ...GOALS[kind].judge(state, end) };
}

// Le registre vide : celui de règles composées sans définitions.
export const NO_DEFINITIONS = Object.freeze({});

// Un sac tiré dans la table : chaque bille uniformément parmi celles qui n'ont pas
// atteint leur limite d'exemplaires (`maxCopies`, null : sans limite), par le
// générateur reçu (`rngState`). Le simulateur s'en sert avec sa propre graine.
export function randomBag({ size, maxCopies }, rngState, ids) {
  let state = rngState;
  const counts = {};
  const bag = [];
  while (bag.length < size) {
    const open = ids.filter((id) => maxCopies === null || (counts[id] ?? 0) < maxCopies);
    const draw = nextRandom(state);
    state = draw.state;
    const id = open[Math.floor(draw.value * open.length)];
    counts[id] = (counts[id] ?? 0) + 1;
    bag.push(id);
  }
  return bag;
}

// Les billes de départ d'une définition, avant le mélange.
export function startingBag(definition, seed, types) {
  return BAG_KINDS[definition.bag.kind].build(definition.bag, seed, Object.keys(types));
}

// Une valeur de départ de la partie (START_KEYS).
export function startValue(state, key) {
  return state.definition.start[key];
}

// Le nombre de tours de la partie, ou null (sans limite).
export function turnLimit(state) {
  return state.definition.turns;
}
