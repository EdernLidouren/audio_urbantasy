// Jeu des billes : tout ce qui se DIT, à partir de l'état, du journal
// (core/marbles.js) et de la prévision (core/marbles-forecast.js). Pur : rend du
// texte, n'annonce rien. `t` est reçu en paramètre, pour que l'écran et le kit
// terminal (tools/play-marbles.js) disent exactement les mêmes phrases.

import { nameRef } from "../../data/i18n/index.js";
import { effectAt, maxWearOf } from "../../core/marbles.js";
import { CLAUSE_ACTIONS } from "../../core/marbles-effects.js";
import { forecast } from "../../core/marbles-forecast.js";
import { formatMenuPosition } from "../../lib/menu.js";
import { stripTrailingPeriod } from "../../lib/announce.js";

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

// { speed, mass } -> ses morceaux à dire.
function statParts({ speed = 0, mass = 0 }, t) {
  const parts = [];
  const add = (value, up, down) => {
    if (value > 0) parts.push(t(up, { amount: value }));
    if (value < 0) parts.push(t(down, { amount: -value }));
  };
  add(speed, "marbles.effect.speed_up", "marbles.effect.speed_down");
  add(mass, "marbles.effect.mass_up", "marbles.effect.mass_down");
  return parts;
}

function combined(parts, t) {
  return parts.length === 0 ? t("marbles.effect.none") : t("marbles.effect.combined", { parts });
}

// Un effet JOUÉ ou PRÉVU : { speed, mass, given } -> « Vitesse +1 et Masse +2 »,
// « Vitesse +4 à la pointe », « aucun effet ».
export function describeEffect(effect, t) {
  const parts = statParts(effect, t);
  for (const gift of effect.given ?? []) {
    parts.push(t("marbles.effect.given", { effect: combined(statParts(gift, t), t), slot: slotName(gift.slot, t) }));
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
      effect: combined(statParts({ [when.stat]: when.atLeast }, t), t),
    }),
};

// Une clause IMPRIMÉE : ce que la bille promet, sa cible et sa condition comprises.
function describeClause(clause, t) {
  let text = combined(statParts(CLAUSE_ACTIONS[clause.action](clause), t), t);
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
export function describeMarbleInList(marble, index, total, t) {
  const line = t("marbles.list.line", { name: marbleName(marble, t), maxWear: maxWearOf(marble) });
  const position = formatMenuPosition(index, total, t);
  return position ? `${line}. ${position}` : `${line}.`;
}

// Une place de la main sous le curseur. Main vide : le dit.
export function describeHandFocus(game, index, t) {
  if (game.hand.length === 0) return t("marbles.hand.empty");
  return describeMarbleInList(game.hand[index], index, game.hand.length, t);
}

// La bille sélectionnée : la même ligne, et le rappel qu'elle est prise.
export function withHeldMark(line, t) {
  return `${stripTrailingPeriod(line)}. ${t("marbles.hand.held")}`;
}

// L'effet de phase de ce tour d'une bille active : la prévision si le tour se
// joue, sinon ce qu'elle a d'imprimé.
function phaseText(game, slot, t) {
  const predicted = forecast(game);
  if (predicted.ok) return describeEffect(predicted.phases[slot], t);
  return describePrinted(effectAt(game.triangle[slot].marble, slot), t);
}

// L'annonce principale d'un emplacement sous le curseur : la bille, sa place et
// son usure, ou « vide ». Le détail est dans sa fiche.
export function describeSlotFocus(game, slot, t) {
  const placed = game.triangle[slot];
  if (placed === null) return t("marbles.slot_line.empty", { slot: slotName(slot, t) });
  return t("marbles.slot_line.occupied", {
    slot: slotName(slot, t),
    name: marbleName(placed.marble, t),
    wear: placed.wear,
    maxWear: maxWearOf(placed.marble),
  });
}

// Un emplacement sous le curseur pendant qu'on cherche où poser : ce qui compte
// pour décider, la bille déjà là et ce qu'elle ferait ce tour.
export function describeSlotForPlacement(game, slot, t) {
  const placed = game.triangle[slot];
  if (placed === null) return t("marbles.slot_line.placing_empty", { slot: slotName(slot, t) });
  return t("marbles.slot_line.placing_occupied", {
    slot: slotName(slot, t),
    name: marbleName(placed.marble, t),
    effect: phaseText(game, slot, t),
  });
}

// Les lignes de lecture d'une confirmation de pose, chacune { key, params } : la
// question et l'effet de phase sur le triangle simulé, puis, sur un emplacement
// occupé, Éjection et Tic dans l'ordre réel des évènements, toujours présentes :
// le menu garde la même structure. La pose doit être permise (placeRefusal).
export function placementLines(game, handIndex, slot, t) {
  const marble = game.hand[handIndex];
  const predicted = forecast(game, { type: "place", handIndex, slot });
  const lines = [
    {
      key: "marbles.place.question",
      params: { marble: marbleName(marble, t), slot: slotName(slot, t), effect: describeEffect(predicted.phases[slot], t) },
    },
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
  return lines;
}

// Le sac : combien il en reste, et combien on en pioche à chaque tour.
export function describeBag(game, t) {
  return t("marbles.status.bag", { count: game.bag.length, draw: game.drawPerTurn });
}

export function describeDiscard(game, t) {
  return t("marbles.status.discard", { count: game.discard.length });
}

// Où en est le tour. Avec la disponibilité de l'échange : rien d'autre ne permet
// de la savoir sans essayer.
export function describeTurn(game, swapAvailable, t) {
  const line = t("marbles.status.turn", {
    turn: game.turn,
    turnCount: game.turnCount,
    score: game.score,
    speed: formatCounter(game.speed),
    mass: formatCounter(game.mass),
  });
  return `${line} ${t(swapAvailable ? "marbles.status.swap_available" : "marbles.status.swap_unavailable")}`;
}

// L'ordre dans lequel le menu du sac se dit : alphabétique, sur le nom prononcé.
// Il ne doit jamais révéler l'ordre de la pioche : il ne dépend donc que du contenu
// du sac, et ne demande aucun hasard, ni celui de la partie ni un autre.
export function bagDisplayOrder(bag, t) {
  return [...bag].sort((a, b) => marbleName(a, t).localeCompare(marbleName(b, t)));
}

function nameOrEmpty(placed, t) {
  return placed === null ? t("marbles.slot.empty") : marbleName(placed.marble, t);
}

// Ces évènements ne se disent pas eux-mêmes : ils existent pour le son et pour
// de futurs effets. Ce qu'on entend, c'est l'effet qu'ils déclenchent (Tic,
// Éjection) ou l'évènement qui les suit (la défausse après le retrait).
const silent = () => null;

// Le gabarit d'un effet, selon ce qui l'a déclenché ; celui d'une phase n'a pas
// à nommer la bille, l'annonce de la phase vient de le faire.
const EFFECT_TEMPLATES = {
  phase: "marbles.event.effect",
  hit: "marbles.event.effect_hit",
  knockout: "marbles.event.effect_knockout",
};

// Le texte de chaque type d'évènement. Les pioches ne sont pas ici : une
// suite de pioches se dit en une liste (voir buildSteps).
const EVENT_TEXTS = {
  turnStarted: (event, t) => t("marbles.event.turn_started", { turn: event.turn, turnCount: event.turnCount }),
  drawSkipped: (event, t) => t("marbles.event.draw_skipped"),
  bagRegenerated: (event, t) => t("marbles.event.bag_regenerated", { size: event.size }),
  swapped: (event, t) => t("marbles.event.swapped", { a: slotName(event.a, t), b: slotName(event.b, t) }),
  knockout: silent,
  removed: silent,
  hit: silent,
  turnEnded: silent,
  discarded: (event, t) => t(`marbles.event.discarded.${event.cause}`, { marble: marbleName(event.marble, t) }),
  placed: (event, t) => t("marbles.event.placed", { marble: marbleName(event.marble, t), slot: slotName(event.slot, t) }),
  phase: (event, t) => t("marbles.event.phase", { slot: slotName(event.slot, t), marble: marbleName(event.marble, t) }),
  phaseSkipped: (event, t) => t("marbles.event.phase_skipped", { slot: slotName(event.slot, t) }),
  effect: (event, t) =>
    t(EFFECT_TEMPLATES[event.trigger], {
      marble: nameRef(`marble.${event.marble}.name`),
      effect: describeEffect({ speed: event.speedDelta, mass: event.massDelta, given: event.given }, t),
      speed: formatCounter(event.speed),
      mass: formatCounter(event.mass),
    }),
  wear: (event, t) => t("marbles.event.wear", { wear: event.wear, maxWear: event.maxWear }),
  impact: (event, t) =>
    t("marbles.event.impact", { speed: formatCounter(event.speed), mass: formatCounter(event.mass), impact: event.impact, score: event.score }),
  rotation: (event, t) =>
    t("marbles.event.rotation", {
      apex: nameOrEmpty(event.triangle.apex, t),
      leftBase: nameOrEmpty(event.triangle.leftBase, t),
      rightBase: nameOrEmpty(event.triangle.rightBase, t),
    }),
  gameOver: (event, t) => t(`marbles.event.game_over.${event.reason}`, { score: event.score }),
};

// `event` prolonge-t-il l'étape en cours, qui finit par `previous` ? Une phase
// se dit d'un bloc (bille, effet, usure), comme le début d'un tour (tour,
// pioche, régénération) et l'après-Impact (retraits, rotation, fin de tour).
function continuesStep(event, previous) {
  if (previous === null) return false;
  switch (event.type) {
    case "draw":
    case "drawSkipped":
    case "bagRegenerated":
    case "effect":
    case "wear":
    case "discarded":
    case "hit":
    case "turnEnded":
      return true;
    case "rotation":
      return previous.type === "discarded";
    default:
      return false;
  }
}

// Le journal découpé en ÉTAPES à dire : [{ text, events }]. Un type d'évènement
// inconnu lève : c'est une faute de programmation, qu'une partie de fumée
// (domaine marbles-view) trouve avant le joueur.
export function buildSteps(events, t) {
  const steps = [];
  let current = null;
  let draws = [];
  let previous = null;

  const flushDraws = () => {
    if (draws.length > 0) current.parts.push(t("marbles.event.draw", { marbles: draws }));
    draws = [];
  };

  for (const event of events) {
    // Une étape qui n'a encore rien à dire accueille l'évènement suivant :
    // jamais d'étape silencieuse, où Entrée semblerait sans effet.
    const isSilentSoFar = current !== null && current.parts.length === 0 && draws.length === 0;
    if (!continuesStep(event, previous) && !isSilentSoFar) {
      if (current) flushDraws();
      current = { parts: [], events: [] };
      steps.push(current);
    }
    current.events.push(event);
    if (event.type === "draw") {
      draws.push(marbleName(event.marble, t));
    } else {
      flushDraws();
      const text = EVENT_TEXTS[event.type];
      if (!text) throw new Error(`marbles : évènement sans texte "${event.type}".`);
      const spoken = text(event, t);
      if (spoken !== null) current.parts.push(spoken);
    }
    previous = event;
  }
  if (current) flushDraws();

  return steps.map((step) => ({ text: step.parts.join(" "), events: step.events }));
}

// Toutes les étapes d'un coup, pour ce qui n'a pas à se dire étape par étape.
export function stepsText(steps) {
  return steps.map((step) => step.text).join(" ");
}
