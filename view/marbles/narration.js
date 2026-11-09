// Jeu des billes : tout ce qui se DIT, à partir de l'état, du journal
// (core/marbles.js) et de la prévision (core/marbles-forecast.js). Pur : rend du
// texte, n'annonce rien. `t` est reçu en paramètre, pour que l'écran et le kit
// terminal (tools/marbles/play.js) disent exactement les mêmes phrases.

import { nameRef } from "../../data/i18n/index.js";
import { SLOTS, throwsLeft } from "../../core/marbles.js";
import { CLAUSE_ACTIONS } from "../../core/marbles-effects.js";
import { forecast } from "../../core/marbles-forecast.js";
import { formatMenuPosition } from "../../lib/menu.js";

export function marbleName(marble, t) {
  return t(`marble.${marble}.name`);
}

export function slotName(slot, t) {
  return t(`marbles.slot.${slot}`);
}

// Un compteur qui peut être négatif (Vitesse, Masse), avec le vrai signe moins
// (U+2212) : un lecteur d'écran le lit, là où il peut taire un trait d'union, et
// « Vitesse 3 » dirait le contraire. Les gabarits d'effet font de même.
export function formatCounter(value) {
  return String(value).replace("-", "−");
}

// Les textes de chaque action de clause (core/marbles-effects.js/CLAUSE_ACTIONS),
// dans l'ordre où ses valeurs se disent : `up` pour une valeur positive, `down`
// pour une négative (absent : l'action n'en produit jamais, sa validation le
// refuse). Chacun reçoit {amount}, toujours positif.
const ACTION_TEXTS = {
  speed: { up: "marbles.effect.speed_up", down: "marbles.effect.speed_down" },
  mass: { up: "marbles.effect.mass_up", down: "marbles.effect.mass_down" },
  draw: { up: "marbles.effect.draw" },
};

// Une action sans texte, ou un texte sans action, échoue au chargement.
for (const action of new Set([...Object.keys(CLAUSE_ACTIONS), ...Object.keys(ACTION_TEXTS)])) {
  if (!Object.hasOwn(CLAUSE_ACTIONS, action) || !Object.hasOwn(ACTION_TEXTS, action)) {
    throw new Error(`marbles : l'action "${action}" doit avoir ses textes (ACTION_TEXTS) et son entrée (CLAUSE_ACTIONS).`);
  }
}

// Les valeurs d'un effet ({ speed, mass }, une absente comptant zéro) -> ses
// morceaux à dire.
function valueParts(values, t) {
  const parts = [];
  for (const [action, { up, down }] of Object.entries(ACTION_TEXTS)) {
    const value = values[action] ?? 0;
    if (value > 0) parts.push(t(up, { amount: value }));
    if (value < 0) parts.push(t(down, { amount: -value }));
  }
  return parts;
}

function combined(parts, t) {
  return parts.length === 0 ? t("marbles.effect.none") : t("marbles.effect.combined", { parts });
}

// Un effet JOUÉ ou PRÉVU : { speed, mass, draw, given } -> « Vitesse +1 et Masse
// +2 », « Pioche 1 », « Vitesse +4 à la pointe », « aucun effet ».
export function describeEffect(effect, t) {
  const parts = valueParts(effect, t);
  for (const gift of effect.given ?? []) {
    parts.push(t("marbles.effect.given", { effect: combined(valueParts(gift, t), t), slot: slotName(gift.slot, t) }));
  }
  return combined(parts, t);
}

// Prévu, s'il y en a un (null : rien à prévoir), sinon « aucun effet ».
function describeOutcome(outcome, t) {
  return outcome === null ? t("marbles.effect.none") : describeEffect(outcome, t);
}

const CONDITION_TEXTS = {
  printedStat: (when, t) =>
    t("marbles.condition.printedStat", {
      slot: slotName(when.slot, t),
      effect: combined(valueParts({ [when.stat]: when.atLeast }, t), t),
    }),
};

// Une clause IMPRIMÉE : ce que la bille promet, sa cible et sa condition comprises.
// Son action dit sa valeur par ses propres textes.
function describeClause(clause, t) {
  let text = combined(valueParts({ [clause.action]: clause.amount }, t), t);
  if (clause.target !== undefined) text = t("marbles.effect.given", { effect: text, slot: slotName(clause.target, t) });
  if (clause.when !== undefined) text = t("marbles.effect.conditional", { effect: text, condition: CONDITION_TEXTS[clause.when.type](clause.when, t) });
  return text;
}

// Un effet imprimé : une liste de clauses.
export function describePrinted(clauses, t) {
  return combined(clauses.map((clause) => describeClause(clause, t)), t);
}

// L'annonce principale d'une bille hors du triangle (main, sac, défausse) : son
// nom, son usure maximale, puis « x sur y ». Le détail est dans sa fiche
// (view/marbles/card.js).
export function describeMarbleInList(marble, index, total, rules, t) {
  const line = t("marbles.list.line", { name: marbleName(marble, t), maxWear: rules.maxWearOf(marble) });
  const position = formatMenuPosition(index, total, t);
  return position ? `${line}. ${position}` : `${line}.`;
}

// Une place de la main sous le curseur. Main vide : le dit.
export function describeHandFocus(game, index, rules, t) {
  if (game.hand.length === 0) return t("marbles.hand.empty");
  return describeMarbleInList(game.hand[index], index, game.hand.length, rules, t);
}

// L'effet de phase de ce tour d'une bille active : la prévision si le tour se
// joue, sinon ce qu'elle a d'imprimé.
function phaseText(game, slot, rules, t) {
  const predicted = rules.forecast(game);
  if (predicted.ok) return describeEffect(predicted.phases[slot], t);
  return describePrinted(rules.effectAt(game.triangle[slot].marble, slot), t);
}

// L'annonce principale d'un emplacement sous le curseur : la bille, sa place et
// son usure, ou « vide ». Le détail est dans sa fiche.
export function describeSlotFocus(game, slot, rules, t) {
  const placed = game.triangle[slot];
  if (placed === null) return t("marbles.slot_line.empty", { slot: slotName(slot, t) });
  return t("marbles.slot_line.occupied", {
    slot: slotName(slot, t),
    name: marbleName(placed.marble, t),
    wear: placed.wear,
    maxWear: rules.maxWearOf(placed.marble),
  });
}

// Un emplacement sous le curseur pendant qu'on cherche où poser : ce qui compte
// pour décider, la bille déjà là et ce qu'elle ferait ce tour.
export function describeSlotForPlacement(game, slot, rules, t) {
  const placed = game.triangle[slot];
  if (placed === null) return t("marbles.slot_line.placing_empty", { slot: slotName(slot, t) });
  return t("marbles.slot_line.placing_occupied", {
    slot: slotName(slot, t),
    name: marbleName(placed.marble, t),
    effect: phaseText(game, slot, rules, t),
  });
}

// Les lignes de lecture d'une confirmation de pose, chacune { key, params } : la
// question, puis, sur sa propre ligne, ce que la bille produirait à sa phase sur le
// triangle simulé, au format de la vue d'ensemble (valeurs produites seulement, bonus
// reçus compris, ni texte d'effet ni bonus donné : celui-là s'entend chez qui le
// reçoit) ; puis, sur un emplacement occupé, Éjection et Tic dans l'ordre réel des
// évènements, toujours présentes : le menu garde la même structure ; enfin, si la
// pose et la résolution régénéreraient le sac, une ligne pour le dire. La pose doit
// être permise (placeRefusal).
export function placementLines(game, handIndex, slot, rules, t) {
  const marble = game.hand[handIndex];
  const predicted = rules.forecast(game, { type: "place", handIndex, slot });
  const lines = [
    { key: "marbles.place.question", params: { marble: marbleName(marble, t), slot: slotName(slot, t) } },
    { key: "marbles.place.values", params: { effect: combined(valueParts(predicted.phases[slot], t), t) } },
  ];
  const occupant = game.triangle[slot];
  if (occupant !== null) {
    lines.push(
      {
        key: "marbles.place.knockout",
        params: { marble: nameRef(`marble.${occupant.marble}.name`), effect: describeOutcome(predicted.knockout, t) },
      },
      {
        key: "marbles.place.hit",
        params: { marble: nameRef(`marble.${marble}.name`), effect: describeOutcome(predicted.hit, t) },
      }
    );
  }
  if (predicted.regenerates) lines.push({ key: "marbles.forecast.regenerates" });
  return lines;
}

// Le sac : combien il en reste, et combien on en pioche à chaque tour.
export function describeBag(game, t) {
  return t("marbles.status.bag", { count: game.bag.length, draw: game.drawPerTurn });
}

export function describeDiscard(game, t) {
  return t("marbles.status.discard", { count: game.discard.length });
}

// Où en est le tour. Avec les lancers restants et la disponibilité de l'échange :
// rien d'autre ne permet de les savoir sans essayer.
export function describeTurn(game, swapAvailable, t) {
  const line = t("marbles.status.turn", {
    turn: game.turn,
    turnCount: game.turnCount,
    score: game.score,
    speed: formatCounter(game.speed),
    mass: formatCounter(game.mass),
  });
  const throws = t("marbles.status.throws", { count: throwsLeft(game) });
  return `${line} ${throws} ${t(swapAvailable ? "marbles.status.swap_available" : "marbles.status.swap_unavailable")}`;
}

// L'ordre dans lequel le menu du sac se dit : alphabétique, sur le nom prononcé.
// Il ne doit jamais révéler l'ordre de la pioche : il ne dépend donc que du contenu
// du sac, et ne demande aucun hasard, ni celui de la partie ni un autre.
export function bagDisplayOrder(bag, t) {
  return [...bag].sort((a, b) => marbleName(a, t).localeCompare(marbleName(b, t)));
}

// Ce qu'une bille produit À SON EMPLACEMENT, sur le triangle prévu ou pendant la
// résolution : « base gauche, argile : Vitesse +1. », « base droite, vide. ».
// `outcome` : { marble, speed, mass }, ou null pour un emplacement vide. Seules les
// valeurs effectivement produites se disent, bonus reçu compris, sans texte d'effet
// ni de condition : ce que la bille donne à une autre s'entend chez celle-ci.
function outcomeLine(slot, outcome, t) {
  if (outcome === null) return t("marbles.outcome.empty", { slot: slotName(slot, t) });
  return t("marbles.outcome.slot", {
    slot: slotName(slot, t),
    marble: marbleName(outcome.marble, t),
    effect: combined(valueParts(outcome, t), t),
  });
}

// Ce que la prévision sait du sac sans le dévoiler : qu'il serait régénéré en
// chemin. Rien sinon.
function forecastNotes(predicted, t) {
  return predicted.regenerates ? [t("marbles.forecast.regenerates")] : [];
}

// La vue d'ensemble du tour (touche R), d'un bloc : la prévision d'abord, Vitesse et
// Masse comprenant ce que le tour a déjà gagné (Tic, Éjection), l'Impact avec ses
// planchers ; puis chaque emplacement dans l'ordre des phases (une Pioche y est une
// valeur comme une autre, « Pioche 1 ») ; enfin la régénération du sac, si la
// résolution la provoquerait. Le triangle actuel, sans action envisagée. null hors
// de la phase de jeu, où rien ne se prévoit.
export function describeOverview(game, rules, t) {
  const predicted = rules.forecast(game);
  if (!predicted.ok) return null;
  const summary = t("marbles.overview.summary", {
    speed: formatCounter(predicted.speed),
    mass: formatCounter(predicted.mass),
    impact: predicted.impact,
  });
  return [summary, ...SLOTS.map((slot) => outcomeLine(slot, predicted.phases[slot], t)), ...forecastNotes(predicted, t)].join(" ");
}

// La rotation du moteur (core/marbles.js/rotated) : un cran, dans le sens horaire
// (base gauche -> pointe -> base droite). Paramètres du texte, pour le jour où elle
// variera ; son évènement les portera alors.
const ROTATION = { steps: 1, direction: "clockwise" };

// Le gabarit d'un effet déclenché par un évènement : celui d'une phase se dit comme
// le résultat de son emplacement (outcomeLine). Un futur déclencheur a besoin de son
// gabarit ici ; sans lui, buildSteps lève.
const EFFECT_TEMPLATES = {
  hit: "marbles.event.effect_hit",
  knockout: "marbles.event.effect_knockout",
};

function effectText(event, t) {
  if (event.trigger === "phase") {
    return outcomeLine(event.slot, { marble: event.marble, speed: event.speedDelta, mass: event.massDelta, draw: event.draw }, t);
  }
  const template = EFFECT_TEMPLATES[event.trigger];
  if (!template) throw new Error(`marbles : effet sans gabarit pour le déclencheur "${event.trigger}".`);
  return t(template, {
    marble: nameRef(`marble.${event.marble}.name`),
    effect: describeEffect({ speed: event.speedDelta, mass: event.massDelta, draw: event.draw, given: event.given }, t),
    speed: formatCounter(event.speed),
    mass: formatCounter(event.mass),
  });
}

// Ce qui ne se dit pas : l'évènement rejoint l'étape SUIVANTE (son son avec elle).
// La phase se dit par son effet, qui la suit toujours ; le retrait, par la défausse ;
// le Tic et l'Éjection, par leur effet s'ils en ont un.
const SILENT = () => null;
// Ce qui ne se dit pas et prolonge l'étape PRÉCÉDENTE : l'usure suit l'effet de sa
// phase, la fin de tour suit la rotation.
const TRAILING = new Set(["wear", "turnEnded"]);

// Le texte de chaque type d'évènement, ou null s'il ne se dit pas. `context` :
// { gameEndsBeforeNextTurn(index) }, pour la rotation.
const EVENT_TEXTS = {
  turnStarted: (event, t) => t("marbles.event.turn_started", { turn: event.turn }),
  // Les pioches consécutives se disent en une liste : buildSteps les regroupe.
  draw: (event, t) => marbleName(event.marble, t),
  drawSkipped: (event, t) => t(`marbles.event.draw_skipped.${event.reason}`),
  bagRegenerated: (event, t) => t("marbles.event.bag_regenerated", { size: event.size }),
  swapped: (event, t) => t("marbles.event.swapped", { a: slotName(event.a, t), b: slotName(event.b, t) }),
  knockout: SILENT,
  removed: SILENT,
  hit: SILENT,
  phase: SILENT,
  wear: SILENT,
  turnEnded: SILENT,
  discarded: (event, t) => t(`marbles.event.discarded.${event.cause}`, { marble: nameRef(`marble.${event.marble}.name`) }),
  placed: (event, t) => t("marbles.event.placed", { marble: marbleName(event.marble, t), slot: slotName(event.slot, t) }),
  phaseSkipped: (event, t) => outcomeLine(event.slot, null, t),
  effect: effectText,
  impact: (event, t) => t("marbles.event.impact", { impact: event.impact, score: event.score }),
  // Au dernier tour, la partie finit avant que le triangle ne serve : la rotation
  // ne se dit pas.
  rotation: (event, t, context) => (context.endsBeforeNextTurn ? null : t("marbles.event.rotation", ROTATION)),
  gameOver: (event, t) => t(`marbles.event.game_over.${event.reason}`, { score: event.score }),
};

// La partie finit-elle après `index`, avant tout nouveau tour ?
function endsBeforeNextTurn(events, index) {
  const next = events.slice(index + 1).find((event) => event.type === "gameOver" || event.type === "turnStarted");
  return next?.type === "gameOver";
}

// Le journal découpé en ÉTAPES à dire, dans l'ordre chronologique :
// [{ text, events, messages, startsTurn?, endsGame? }]. `messages` : les messages de
// jeu que l'étape porte, pour l'historique (view/marbles/history.js), d'ordinaire
// son seul texte ; `startsTurn` (le numéro du tour) marque le début de tour,
// `endsGame` la fin de partie : ce sont les bornes de l'historique. Chaque évènement qui se dit ouvre son étape ; un évènement
// muet rejoint la suivante (ou la précédente, TRAILING) ; tout évènement appartient
// à une étape et une seule. Deux règles d'ordre :
// - les pioches consécutives se disent en une liste (« Vous piochez argile et verre. ») ;
// - le début de tour se dit APRÈS sa pioche, à la fin du journal reçu : « Début du
//   tour 3, jouez vos billes. » vient quand le joueur a sa main. Une fin de partie
//   avant lui le remplace.
// Un nouvel évènement qui se dit (un effet d'un nouveau déclencheur) devient ainsi une
// étape à sa place, sans autre changement. Un type inconnu lève : c'est une faute de
// programmation, qu'une partie de fumée (domaine marbles-view) trouve avant le joueur.
export function buildSteps(events, t) {
  const steps = [];
  let waiting = [];
  let turnStart = null;

  const open = (text, event) => {
    const step = { text, events: [...waiting, event] };
    waiting = [];
    steps.push(step);
    return step;
  };

  events.forEach((event, index) => {
    const text = EVENT_TEXTS[event.type];
    if (!text) throw new Error(`marbles : évènement sans texte "${event.type}".`);

    // Le début de tour se dit plus tard, mais son évènement reste à sa place : il
    // part (son son avec lui) avec l'étape suivante, la pioche.
    if (event.type === "turnStarted") {
      turnStart = { text: text(event, t), turn: event.turn };
      waiting.push(event);
      return;
    }
    // Le tour qui allait commencer n'aura pas lieu.
    if (event.type === "gameOver") turnStart = null;

    const last = steps[steps.length - 1];
    if (event.type === "draw") {
      if (last?.draws && waiting.length === 0) {
        last.draws.push(marbleName(event.marble, t));
        last.events.push(event);
      } else {
        open(null, event).draws = [marbleName(event.marble, t)];
      }
      return;
    }
    if (TRAILING.has(event.type) && last !== undefined && waiting.length === 0) {
      last.events.push(event);
      return;
    }
    const spoken = text(event, t, { endsBeforeNextTurn: endsBeforeNextTurn(events, index) });
    if (spoken === null) waiting.push(event);
    else open(spoken, event);
  });

  if (turnStart !== null) steps.push({ text: turnStart.text, events: waiting, startsTurn: turnStart.turn });
  else if (waiting.length > 0 && steps.length > 0) steps[steps.length - 1].events.push(...waiting);
  else if (waiting.length > 0) steps.push({ text: "", events: waiting });

  return steps.map((step) => {
    const text = step.draws ? t("marbles.event.draw", { marbles: step.draws }) : step.text;
    const built = { text, events: step.events, messages: text === "" ? [] : [text] };
    if (step.startsTurn !== undefined) built.startsTurn = step.startsTurn;
    if (step.events.some((event) => event.type === "gameOver")) built.endsGame = true;
    return built;
  });
}

// Les étapes d'une RÉSOLUTION (journal de la résolution puis de la pioche qui la
// suit), ouvertes par « Résolution du tour 3. », qui n'est pas un évènement : c'est
// le geste du joueur qui l'ouvre. L'ouverture se dit SANS PAUSE avant la phase de
// base gauche : elle partage sa première étape. Deux étapes à pause nulle ne
// suffiraient pas, la seconde annonce couperait la première. Elles restent deux
// messages pour l'historique. `hint` : la première fois, comment passer la
// résolution, dit après l'ouverture mais hors de l'historique (ce n'est pas un
// message de jeu).
export function resolutionSteps(turn, events, t, { hint = false } = {}) {
  const opening = t("marbles.resolution.opening", { turn });
  const spoken = hint ? `${opening} ${t("marbles.resolution.hint")}` : opening;
  const [first, ...rest] = buildSteps(events, t);
  if (first === undefined) return [{ text: spoken, events: [], messages: [opening] }];
  return [{ ...first, text: `${spoken} ${first.text}`, messages: [opening, ...first.messages] }, ...rest];
}

// Toutes les étapes d'un coup, pour ce qui n'a pas à se dire étape par étape.
export function stepsText(steps) {
  return steps.map((step) => step.text).join(" ");
}
