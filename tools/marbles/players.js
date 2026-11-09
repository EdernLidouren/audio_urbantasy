// BOÎTE À OUTILS DES BILLES — les JOUEURS AUTOMATIQUES du simulateur
// (tools/marbles/simulation.js). Pur, sans Node.
//
// CE QU'UN JOUEUR SAIT : ce qu'un joueur humain sait, rien de plus. Il ne reçoit
// jamais l'état de la partie, seulement sa VUE PUBLIQUE (publicView) : le sac y est
// vide (son contenu et son ordre sont cachés, seul son nombre de billes reste,
// `bagSize`, comme la touche S), et l'état du hasard de la partie en est retiré. Il
// n'agit que par les actions publiques du réducteur (core/marbles.js), que le
// simulateur valide comme celles d'un humain, et ne prévoit que par le moteur de
// prévision existant (core/marbles-forecast.js). Ses choix aléatoires éventuels
// passent par SON générateur, à graine dérivée, jamais par celui de la partie.
//
// UN JOUEUR : une entrée de PLAYERS, { label, describe(options), startGame({ seed,
// options }) }. startGame rend la session d'une partie, { next(view) }, qui donne
// l'action suivante pour la vue reçue (jamais une pioche : le simulateur s'en
// charge). Ajouter un joueur : une entrée de plus ici, sans toucher au simulateur.

import { SLOTS, legalActions } from "../../core/marbles.js";
import { forecast } from "../../core/marbles-forecast.js";
import { createSeed, nextRandom } from "../../core/rng.js";
import { GAME_RULES } from "./game-rules.js";

// La vue publique d'un état : une copie, sac vidé et hasard retiré.
export function publicView(state) {
  return { ...structuredClone({ ...state, bag: [], rngState: null }), bagSize: state.bag.length };
}

// --- Aléatoire ---

// Uniforme parmi les actions légales (résolution comprise, dès qu'elle l'est) :
// la référence basse.
function startRandom({ seed }) {
  let rngState = createSeed(seed);
  return {
    next(view) {
      const actions = legalActions(view).filter((action) => action.type !== "draw");
      const draw = nextRandom(rngState);
      rngState = draw.state;
      return actions[Math.floor(draw.value * actions.length)];
    },
  };
}

// --- Glouton ---

// Les choix d'un plan : { type: "swap", a, b } ou { type: "place", marble, slot }.
// Une pose désigne sa BILLE, pas une place dans la main, qui bouge à chaque pose :
// la place n'est calculée qu'au moment de jouer (handIndexIn).
function handIndexIn(hand, marble) {
  return hand.indexOf(marble);
}

function toAction(choice, state) {
  return choice.type === "place" ? { type: "place", handIndex: handIndexIn(state.hand, choice.marble), slot: choice.slot } : choice;
}

// Les billes distinctes de la main : deux exemplaires donnent la même issue, un
// seul s'évalue.
const distinct = (hand) => [...new Set(hand)];

// Les suites de poses envisagées depuis `state`, chacune avec l'état où elle mène :
// au premier tour, toutes les façons de remplir le triangle ; ensuite, de zéro à
// `maxPlacements` poses, sur tout emplacement, ou sur un vide seulement sans
// remplacement. Plus courtes d'abord.
function placementSequences(state, { maxPlacements, allowReplacement }) {
  const sequences = [];
  const firstTurn = state.turn === 1;
  const walk = (current, choices) => {
    const empty = SLOTS.filter((slot) => current.triangle[slot] === null);
    if (firstTurn ? empty.length === 0 : true) sequences.push({ choices, state: current });
    if (firstTurn ? empty.length === 0 : choices.length >= maxPlacements) return;
    // Au premier tour, les emplacements se remplissent dans l'ordre des phases :
    // toutes les attributions sont couvertes sans compter deux fois la même.
    const slots = firstTurn ? [empty[0]] : allowReplacement ? SLOTS : empty;
    for (const marble of distinct(current.hand)) {
      for (const slot of slots) {
        const choice = { type: "place", marble, slot };
        const result = GAME_RULES.reduce(current, toAction(choice, current));
        if (result.ok) walk(result.state, [...choices, choice]);
      }
    }
  };
  walk(state, []);
  return sequences;
}

// Le meilleur plan du tour pour la vue reçue, sa résolution comprise : chaque
// combinaison envisageable (pas d'échange ou chaque échange légal, puis les
// suites de poses) est évaluée par la prévision du triangle obtenu, et la
// première à l'Impact prévu le plus haut l'emporte (à égalité, la plus simple :
// sans échange, avec le moins de poses). -> { choices, impact, evaluated }
export function bestPlan(view, { maxPlacements = 1, allowReplacement = true } = {}) {
  const swaps = [null, ...legalActions(view).filter((action) => action.type === "swap")];
  let best = null;
  let evaluated = 0;
  for (const swap of swaps) {
    const start = swap === null ? view : GAME_RULES.reduce(view, swap).state;
    for (const { choices, state } of placementSequences(start, { maxPlacements, allowReplacement })) {
      const predicted = GAME_RULES.forecast(state);
      evaluated += 1;
      if (!predicted.ok) continue;
      if (best === null || predicted.impact > best.impact) {
        best = { choices: swap === null ? choices : [swap, ...choices], impact: predicted.impact };
      }
    }
  }
  // Aucune prévision possible (boucle d'évènements partout) : résoudre tel quel.
  return { ...(best ?? { choices: [], impact: null }), evaluated };
}

function checkMaxPlacements(value) {
  if (!Number.isInteger(value) || value < 0) throw new Error("joueur glouton : maxPlacements doit être un entier >= 0.");
  return value;
}

// Myope : planifie son tour quand il commence, puis le joue choix par choix, et
// résout.
function startGreedy(allowReplacement) {
  return ({ options = {} }) => {
    const maxPlacements = checkMaxPlacements(options.maxPlacements ?? 1);
    let plan = [];
    let plannedTurn = null;
    return {
      next(view) {
        if (plannedTurn !== view.turn) {
          plan = [...bestPlan(view, { maxPlacements, allowReplacement }).choices, { type: "resolve" }];
          plannedTurn = view.turn;
        }
        return toAction(plan.shift() ?? { type: "resolve" }, view);
      },
    };
  };
}

const describeGreedy = (label) => (options = {}) => {
  const count = options.maxPlacements ?? 1;
  return `${label}, au plus ${count} ${count > 1 ? "poses envisagées" : "pose envisagée"} par tour après le premier`;
};

export const PLAYERS = {
  random: {
    label: "aléatoire",
    describe: () => "aléatoire, uniforme parmi les actions légales",
    startGame: startRandom,
  },
  greedy: {
    label: "glouton",
    describe: describeGreedy("glouton"),
    startGame: startGreedy(true),
  },
  "greedy-no-replacement": {
    label: "glouton sans remplacement",
    describe: describeGreedy("glouton sans remplacement"),
    startGame: startGreedy(false),
  },
};
