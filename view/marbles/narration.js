// Jeu des billes : tout ce qui se DIT, à partir de l'état et du journal
// (core/marbles.js). Pur : rend du texte, n'annonce rien. `t` est reçu en
// paramètre, pour que l'écran et le kit terminal (tools/play-marbles.js)
// disent exactement les mêmes phrases.

import { effectAt, maxWearOf } from "../../core/marbles.js";

export function marbleName(marble, t) {
  return t(`marble.${marble}.name`);
}

export function slotName(slot, t) {
  return t(`marbles.slot.${slot}`);
}

// { speed?, mass? } -> « vitesse plus 1 et masse plus 2 », « aucun effet ».
// En toutes lettres plutôt qu'avec des signes : un lecteur d'écran peut taire
// un « + » ou un « − ».
export function describeEffect(effect, t) {
  const parts = [];
  const add = (value, up, down) => {
    if (value > 0) parts.push(t(up, { amount: value }));
    if (value < 0) parts.push(t(down, { amount: -value }));
  };
  add(effect.speed ?? 0, "marbles.effect.speed_up", "marbles.effect.speed_down");
  add(effect.mass ?? 0, "marbles.effect.mass_up", "marbles.effect.mass_down");
  if (parts.length === 0) return t("marbles.effect.none");
  return t("marbles.effect.combined", { parts });
}

// Effets d'une bille en main : base et pointe, ou les deux bases à part si
// elles diffèrent.
function describeMarbleEffects(marble, t) {
  const left = effectAt(marble, "leftBase");
  const right = effectAt(marble, "rightBase");
  const apex = describeEffect(effectAt(marble, "apex"), t);
  if (left === right) return t("marbles.hand.effects", { base: describeEffect(left, t), apex });
  return t("marbles.hand.effects_variant", { left: describeEffect(left, t), right: describeEffect(right, t), apex });
}

// Une place de la main sous le curseur. Main vide : le dit.
export function describeHandFocus(game, index, t) {
  if (game.hand.length === 0) return t("marbles.hand.empty");
  const marble = game.hand[index];
  return t("marbles.hand.line", {
    index: index + 1,
    total: game.hand.length,
    name: marbleName(marble, t),
    effects: describeMarbleEffects(marble, t),
    maxWear: maxWearOf(marble),
  });
}

// Un emplacement sous le curseur : la position, la bille ou « vide », son effet
// À CETTE POSITION, son usure.
export function describeSlotFocus(game, slot, t) {
  const placed = game.triangle[slot];
  if (placed === null) return t("marbles.slot_line.empty", { slot: slotName(slot, t) });
  return t("marbles.slot_line.occupied", {
    slot: slotName(slot, t),
    name: marbleName(placed.marble, t),
    effect: describeEffect(effectAt(placed.marble, slot), t),
    wear: placed.wear,
    maxWear: maxWearOf(placed.marble),
  });
}

// La touche d'état. Avec la disponibilité de l'échange : rien d'autre ne
// permet de la savoir sans essayer.
export function describeStatus(game, swapAvailable, t) {
  const line = t("marbles.status.line", {
    turn: game.turn,
    turnCount: game.turnCount,
    score: game.score,
    bag: game.bag.length,
    discard: game.discard.length,
  });
  return `${line} ${t(swapAvailable ? "marbles.status.swap_available" : "marbles.status.swap_unavailable")}`;
}

function nameOrEmpty(placed, t) {
  return placed === null ? t("marbles.slot.empty") : marbleName(placed.marble, t);
}

// Le texte de chaque type d'évènement. Les pioches ne sont pas ici : une
// suite de pioches se dit en une liste (voir buildSteps).
const EVENT_TEXTS = {
  turnStarted: (event, t) => t("marbles.event.turn_started", { turn: event.turn, turnCount: event.turnCount }),
  bagRegenerated: (event, t) => t("marbles.event.bag_regenerated", { size: event.size }),
  swapped: (event, t) => t("marbles.event.swapped", { a: slotName(event.a, t), b: slotName(event.b, t) }),
  replaced: (event, t) => t("marbles.event.replaced", { marble: marbleName(event.marble, t) }),
  placed: (event, t) => t("marbles.event.placed", { marble: marbleName(event.marble, t), slot: slotName(event.slot, t) }),
  phase: (event, t) => t("marbles.event.phase", { slot: slotName(event.slot, t), marble: marbleName(event.marble, t) }),
  phaseSkipped: (event, t) => t("marbles.event.phase_skipped", { slot: slotName(event.slot, t) }),
  effect: (event, t) =>
    t("marbles.event.effect", {
      effect: describeEffect({ speed: event.speedDelta, mass: event.massDelta }, t),
      speed: event.speed,
      mass: event.mass,
    }),
  wear: (event, t) => t("marbles.event.wear", { wear: event.wear, maxWear: event.maxWear }),
  impact: (event, t) =>
    t("marbles.event.impact", { speed: event.speed, mass: event.mass, impact: event.impact, score: event.score }),
  retired: (event, t) => t("marbles.event.retired", { marble: marbleName(event.marble, t) }),
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
// pioche, régénération) et l'après-Impact (retraits, rotation).
function continuesStep(event, previous) {
  if (previous === null) return false;
  switch (event.type) {
    case "draw":
    case "bagRegenerated":
    case "effect":
    case "wear":
      return true;
    case "retired":
    case "rotation":
      return previous.type === "retired";
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
    if (!continuesStep(event, previous)) {
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
      current.parts.push(text(event, t));
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
