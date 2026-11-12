// BOÎTE À OUTILS DES BILLES — les JOUEURS AUTOMATIQUES du simulateur
// (marbles/tools/simulation.js). Pur, sans Node.
//
// CE QU'UN JOUEUR SAIT : ce qu'un joueur humain sait, rien de plus. Il ne reçoit
// jamais l'état de la partie, seulement sa VUE PUBLIQUE (publicView) : les billes du
// sac y sont inconnues (marbles/core/run.js/UNKNOWN_MARBLE : seul leur nombre reste,
// comme la touche S), et l'état du hasard de la partie en est retiré. Il n'agit que
// par les actions publiques du réducteur (marbles/core/marbles.js), que le simulateur valide
// comme celles d'un humain (lancers compris), et ne prévoit que par le moteur de
// prévision existant (marbles/core/forecast.js) ou par le réducteur À L'AVEUGLE
// (options.blind), qui pioche des billes inconnues sans toucher au hasard. Ses choix
// aléatoires éventuels passent par SON générateur, à graine dérivée, jamais par
// celui de la partie.
//
// UN JOUEUR : une entrée de PLAYERS, { label, describe(options), startGame({ seed,
// options }) }. startGame rend la session d'une partie, { next(view) }, qui donne
// l'action suivante pour la vue reçue (jamais une pioche : le simulateur s'en
// charge). Avec un CHOIX EN ATTENTE (marbles/core/marbles.js, `pendingChoice`), la vue n'admet
// qu'une réponse (`choose`) : chaque joueur a la sienne. Ajouter un joueur : une
// entrée de plus ici, sans toucher au simulateur.

import { MARBLES_DRAWN_VALUE } from "./drawn-value.js";
import { SLOTS, legalActions } from "../core/marbles.js";
import { UNKNOWN_MARBLE } from "../core/run.js";
import { createSeed, nextRandom } from "../../lib/rng.js";
import { GAME_RULES } from "./game-rules.js";

// La vue publique d'un état : une copie, billes du sac inconnues (leur nombre reste)
// et hasard retiré. La défausse, que le joueur entend, reste lisible. Un choix en
// attente garde l'état de départ de son action (sa reprise) : il est voilé de même.
export function publicView(state) {
  const hidden = { ...state, bag: state.bag.map(() => UNKNOWN_MARBLE), rngState: null };
  if (state.pendingChoice) {
    const { resume } = state.pendingChoice;
    hidden.pendingChoice = { ...state.pendingChoice, resume: { ...resume, from: publicView(resume.from) } };
  }
  return structuredClone(hidden);
}

// --- Aléatoire ---

// Uniforme parmi les actions légales (résolution comprise, dès qu'elle l'est) :
// la référence basse. Un choix : uniforme parmi ses cibles éligibles, Terminer
// compris en mode « jusqu'à N », par un générateur À PART (graine dérivée), pour que
// les choix ne décalent pas le reste de ses tirages.
function startRandom({ seed }) {
  let rngState = createSeed(seed);
  let choiceRng = createSeed(`${seed}/choices`);
  return {
    next(view) {
      const actions = legalActions(view).filter((action) => action.type !== "draw");
      if (view.pendingChoice) {
        const draw = nextRandom(choiceRng);
        choiceRng = draw.state;
        return actions[Math.floor(draw.value * actions.length)];
      }
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
  return hand.findIndex((held) => held.marble === marble);
}

function toAction(choice, state) {
  return choice.type === "place" ? { type: "place", handIndex: handIndexIn(state.hand, choice.marble), slot: choice.slot } : choice;
}

// Les billes distinctes de la main : deux exemplaires donnent la même issue, un
// seul s'évalue. Une bille piochée pendant la planification est inconnue : elle ne
// se planifie pas.
const distinct = (hand) => [...new Set(hand.map((held) => held.marble))].filter((marble) => marble !== UNKNOWN_MARBLE);

// Les billes que des journaux disent piochées.
const drawsIn = (events) => events.filter((event) => event.type === "draw").length;

// Le réducteur, à l'aveugle : planifier ne révèle ni ne tire rien.
const blindReduce = (state, action) => GAME_RULES.reduce(state, action, { blind: true });

// Les suites de poses envisagées depuis `state`, chacune avec l'état où elle mène et
// les billes que ses poses ont piochées : au premier tour, le triangle vide, toutes
// les façons d'en remplir tout ou partie (aucune règle ne l'exige, c'est une
// stratégie : poser une bille sur un vide ne retire rien) ; ensuite, de zéro à
// `maxPlacements` poses, sur tout emplacement, ou sur un vide seulement sans
// remplacement. Plus courtes d'abord.
function placementSequences(state, { maxPlacements, allowReplacement }, drawnBefore = 0) {
  const sequences = [];
  const firstTurn = state.turn === 1;
  const walk = (current, choices, drawn) => {
    sequences.push({ choices, state: current, drawn });
    if (!firstTurn && choices.length >= maxPlacements) return;
    // Au premier tour, les emplacements vides se remplissent dans l'ordre des
    // phases, chacun après le dernier rempli : chaque sous-ensemble d'emplacements,
    // chaque attribution, est couvert sans compter deux fois le même.
    const after = choices.length === 0 ? -1 : SLOTS.indexOf(choices.at(-1).slot);
    const slots = firstTurn
      ? SLOTS.filter((slot, index) => index > after && current.triangle[slot] === null)
      : allowReplacement
        ? SLOTS
        : SLOTS.filter((slot) => current.triangle[slot] === null);
    for (const marble of distinct(current.hand)) {
      for (const slot of slots) {
        const choice = { type: "place", marble, slot };
        const result = blindReduce(current, toAction(choice, current));
        if (result.ok) walk(result.state, [...choices, choice], drawn + drawsIn(result.events));
      }
    }
  };
  walk(state, [], drawnBefore);
  return sequences;
}

// Le meilleur plan du tour pour la vue reçue, sa résolution comprise : chaque
// combinaison envisageable (pas d'échange ou chaque échange légal, puis les
// suites de poses) est évaluée par la prévision du triangle obtenu. Sa VALEUR :
// l'Impact prévu, plus `drawnValue` par bille gagnée en main (piochée par les poses
// du plan ou par la résolution), sans quoi une bille qui pioche ne vaudrait rien
// pour lui. La première à la valeur la plus haute l'emporte (à égalité, la plus
// simple : sans échange, avec le moins de poses).
// -> { choices, impact, drawn, value, evaluated }
export function bestPlan(view, { maxPlacements = 1, allowReplacement = true, drawnValue = MARBLES_DRAWN_VALUE } = {}) {
  const swaps = [null, ...legalActions(view).filter((action) => action.type === "swap")];
  let best = null;
  let evaluated = 0;
  for (const swap of swaps) {
    const swapped = swap === null ? null : blindReduce(view, swap);
    const start = swapped === null ? view : swapped.state;
    for (const { choices, state, drawn: placed } of placementSequences(start, { maxPlacements, allowReplacement })) {
      const predicted = GAME_RULES.forecast(state);
      evaluated += 1;
      if (!predicted.ok) continue;
      const drawn = placed + predicted.drawn;
      const value = predicted.impact + drawnValue * drawn;
      if (best === null || value > best.value) {
        best = { choices: swap === null ? choices : [swap, ...choices], impact: predicted.impact, drawn, value };
      }
    }
  }
  // Aucune prévision possible (boucle d'évènements partout) : résoudre tel quel.
  return { ...(best ?? { choices: [], impact: null, drawn: 0, value: null }), evaluated };
}

// La meilleure réponse au choix en attente : celle qui maximise l'Impact prévu du
// tour (marbles/core/forecast.js, « prévoir une réponse » : les choix suivants y
// restent indécis ; ils seront tranchés de même, un par un). À égalité, la première
// dans l'ordre des réponses légales (cibles, puis Terminer).
export function bestChoice(view) {
  let best = null;
  for (const action of legalActions(view)) {
    const predicted = GAME_RULES.forecast(view, action);
    const value = predicted.ok ? predicted.impact : -Infinity;
    if (best === null || value > best.value) best = { action, value };
  }
  return best.action;
}

function checkMaxPlacements(value) {
  if (!Number.isInteger(value) || value < 0) throw new Error("joueur glouton : maxPlacements doit être un entier >= 0.");
  return value;
}

function checkDrawnValue(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("joueur glouton : drawnValue doit être un nombre >= 0.");
  return value;
}

// Myope : planifie son tour quand il commence, puis le joue choix par choix, et
// résout.
function startGreedy(allowReplacement) {
  return ({ options = {} }) => {
    const maxPlacements = checkMaxPlacements(options.maxPlacements ?? 1);
    const drawnValue = checkDrawnValue(options.drawnValue ?? MARBLES_DRAWN_VALUE);
    let plan = [];
    let plannedTurn = null;
    return {
      next(view) {
        if (view.pendingChoice) return bestChoice(view);
        if (plannedTurn !== view.turn) {
          plan = [...bestPlan(view, { maxPlacements, allowReplacement, drawnValue }).choices, { type: "resolve" }];
          plannedTurn = view.turn;
        }
        // Une bille du plan qui n'est plus en main (empochée par un choix entre-temps)
        // ne se pose plus : la suite du plan continue.
        let choice = plan.shift() ?? { type: "resolve" };
        while (choice.type === "place" && handIndexIn(view.hand, choice.marble) < 0) choice = plan.shift() ?? { type: "resolve" };
        return toAction(choice, view);
      },
    };
  };
}

const describeGreedy = (label) => (options = {}) => {
  const count = options.maxPlacements ?? 1;
  const drawnValue = String(options.drawnValue ?? MARBLES_DRAWN_VALUE).replace(".", ",");
  return `${label}, au plus ${count} ${count > 1 ? "poses envisagées" : "pose envisagée"} par tour après le premier, une bille gagnée en main valant ${drawnValue} d'Impact`;
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
