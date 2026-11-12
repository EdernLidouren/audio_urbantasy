// Jeu des billes, ce qui se dit : le JOURNAL. Le texte de chaque évènement
// (marbles/core/content.js, en-tête), le journal découpé en étapes à dire
// (buildSteps), celles d'une résolution (resolutionSteps), et la question d'un choix
// en attente (describeChoicePrompt). Pur. Point d'entrée et vue d'ensemble :
// marbles/view/narration.js.

import { nameRef } from "../../../data/i18n/index.js";
import { MARBLE_POCKET, MARBLE_TRIGGERS } from "../../config/values.js";
import { FIRST_IN_HAND } from "../../core/effects.js";
import { choiceTarget, combined, describeEffect, formatCounter, marbleName, outcomeLine, slotName, valueParts } from "./effects.js";

// Le sens de la rotation du moteur (marbles/core/marbles.js/ROTATION_NEXT) : horaire (base
// gauche -> pointe -> base droite). Ses crans, eux, viennent de l'évènement.
const ROTATION_DIRECTION = "clockwise";

// Le gabarit d'un effet déclenché par un évènement, celui de son déclencheur
// (MARBLE_TRIGGERS, `texts.effect`) ; celui d'une phase se dit comme le résultat de
// son emplacement (outcomeLine).
const EFFECT_TEMPLATES = Object.fromEntries([
  ...MARBLE_TRIGGERS.map((trigger) => [trigger.id, trigger.texts.effect]),
  // Les moments En poche : « Entrée au pot de porcelaine : Vitesse +10. … », « Pot,
  // agate : Masse +1. ».
  ...MARBLE_POCKET.moments.map((moment) => [moment.trigger, moment.texts.effect]),
]);

function effectText(event, t) {
  if (event.trigger === "phase") {
    return outcomeLine(event.slot, { marble: event.marble, speed: event.speedDelta, mass: event.massDelta, draw: event.draw, operations: event.operations, given: event.given }, t);
  }
  const template = EFFECT_TEMPLATES[event.trigger];
  if (!template) throw new Error(`marbles : effet sans gabarit pour le déclencheur "${event.trigger}".`);
  return t(template, {
    marble: nameRef(`marble.${event.marble}.name`),
    effect: describeEffect({ speed: event.speedDelta, mass: event.massDelta, draw: event.draw, operations: event.operations, given: event.given }, t),
    speed: formatCounter(event.speed),
    mass: formatCounter(event.mass),
  });
}

// Ce qui ne se dit pas : l'évènement rejoint l'étape SUIVANTE (son son avec elle).
// La phase se dit par son effet, qui la suit toujours ; le retrait, par la défausse ;
// le Tic et l'Éjection, par leur effet s'ils en ont un.
const SILENT = () => null;
// Ce qui ne se dit pas et prolonge l'étape PRÉCÉDENTE : l'usure suit l'effet de sa
// phase, la fin de tour suit la rotation, l'évènement d'un déclencheur de la bille
// piochée (l'Éveil) suit sa pioche, sans couper la liste des pioches consécutives
// (son effet, s'il en a un, ouvre sa propre étape et la coupe).
// Une bille chassée par Éjecter : son retrait et son départ à la défausse suivent
// l'annonce de son Éjection (ou de l'éjection), sans se dire.
const TRAILING = new Set([
  "wear",
  "turnEnded",
  ...MARBLE_TRIGGERS.filter((trigger) => trigger.marble === "drawn").map((trigger) => trigger.event),
]);
const isTrailing = (event) => TRAILING.has(event.type) || ((event.type === "removed" || event.type === "discarded") && event.cause === "eject");

// Le texte de chaque type d'évènement, ou null s'il ne se dit pas. `context` :
// { gameEndsBeforeNextTurn(index) }, pour la rotation.
const EVENT_TEXTS = {
  turnStarted: (event, t) => t("marbles.event.turn_started", { turn: event.turn }),
  // Les pioches consécutives se disent en une liste : buildSteps les regroupe.
  draw: (event, t) => marbleName(event.marble, t),
  drawSkipped: (event, t) => t(`marbles.event.draw_skipped.${event.reason}`),
  bagRegenerated: (event, t) => t("marbles.event.bag_regenerated", { size: event.size }),
  swapped: (event, t) => t("marbles.event.swapped", { a: slotName(event.a, t), b: slotName(event.b, t) }),
  // L'évènement d'un déclencheur se dit par son effet, s'il en a un.
  ...Object.fromEntries(MARBLE_TRIGGERS.map((trigger) => [trigger.event, SILENT])),
  removed: SILENT,
  phase: SILENT,
  wear: SILENT,
  turnEnded: SILENT,
  // Polissage, Fêlure : la bille qui les reçoit, et son usure d'après.
  polished: (event, t) => t("marbles.event.polished", { marble: nameRef(`marble.${event.marble}.name`), wear: event.wear, maxWear: event.maxWear }),
  cracked: (event, t) => t("marbles.event.cracked", { marble: nameRef(`marble.${event.marble}.name`), wear: event.wear, maxWear: event.maxWear }),
  // Une cible vide : un emplacement, la main (Empocher la première bille de la
  // main), ou la bille elle-même qui n'est plus là.
  targetEmpty: (event, t) => {
    if (event.target === FIRST_IN_HAND) return t("marbles.event.target_empty_hand");
    if (event.target === "choice") return t("marbles.event.target_empty_choice");
    if (event.target === "all") return t("marbles.event.target_empty_all");
    if (event.target === "self" && event.action === "eject") return t("marbles.event.target_empty_self_eject", { marble: nameRef(`marble.${event.marble}.name`) });
    if (event.target === "self") return t("marbles.event.target_empty_self", { marble: nameRef(`marble.${event.marble}.name`) });
    return t("marbles.event.target_empty", { slot: slotName(event.slot, t) });
  },
  // La mise en poche et la perte, dites avec la bille ; une bille piochée à
  // l'aveugle n'apparaît que dans la prévision, qui ne passe jamais par ici.
  pocketed: (event, t) => t("marbles.event.pocketed", { marble: nameRef(`marble.${event.marble}.name`) }),
  lost: (event, t) => t("marbles.event.lost", { marble: nameRef(`marble.${event.marble}.name`) }),
  // L'étape du pot et une réaction se disent par l'effet de la bille, si elle en a
  // un (« Pot, tigrée : Vitesse +2. »).
  potResolution: SILENT,
  pocketReaction: SILENT,
  // La limite de sécurité a arrêté la chaîne : une anomalie, qui se dit.
  chainInterrupted: (event, t) => t("marbles.event.chain_interrupted"),
  // Un choix : l'écran en dit la question (describeChoicePrompt) ; chaque cible
  // choisie se dit (« agate choisie. »), la fin aussi quand elle n'est pas d'avoir
  // fait les N choix. Un choix indécis n'existe qu'à l'aveugle, jamais dit ici.
  choice: SILENT,
  chosen: (event, t) =>
    event.zone === "triangle" && event.marble === null
      ? t("marbles.choice.chosen_slot", { slot: slotName(event.slot, t) })
      : t("marbles.choice.chosen", { marble: nameRef(`marble.${event.marble}.name`) }),
  choiceEnded: (event, t) => (event.reason === "count" ? null : t(`marbles.choice.ended.${event.reason}`)),
  choiceUndecided: SILENT,
  // Une bille chassée par Éjecter : déjà dite par l'éjection (isTrailing).
  discarded: (event, t) => (event.cause === "eject" ? null : t(`marbles.event.discarded.${event.cause}`, { marble: nameRef(`marble.${event.marble}.name`) })),
  // Éjecter : la bille qui éjecte, et celle qu'elle chasse ; son Éjection se dit
  // ensuite par son effet.
  eject: (event, t) => t("marbles.event.eject", { source: nameRef(`marble.${event.by.marble}.name`), marble: nameRef(`marble.${event.marble}.name`) }),
  placed: (event, t) => t("marbles.event.placed", { marble: marbleName(event.marble, t), slot: slotName(event.slot, t) }),
  phaseSkipped: (event, t) => outcomeLine(event.slot, null, t),
  effect: effectText,
  impact: (event, t) => t("marbles.event.impact", { impact: event.impact, score: event.score }),
  // Au dernier tour, la partie finit avant que le triangle ne serve : la rotation
  // ne se dit pas.
  rotation: (event, t, context) => (context.endsBeforeNextTurn ? null : t("marbles.event.rotation", { steps: event.notches, direction: ROTATION_DIRECTION })),
  gameOver: (event, t) => t("marbles.event.game_over", { score: event.score }),
};

// Le moment d'un choix, devant sa question : la bille qui le pose et son moment
// (`by`, marbles/core/content.js, en-tête), comme ses effets se disent : « Tic de gorille : », « base
// gauche, tigrée : », « Entrée au pot de porcelaine : », « Pot, mica : ». Le Tic a
// sa propre clé : son effet anglais se dit « Hit from gorilla », pas « of ».
const POCKET_ENTRY_TRIGGERS = new Set(MARBLE_POCKET.moments.filter((moment) => moment.event === "pocketed").map((moment) => moment.trigger));
const POCKET_TRIGGERS = new Set(MARBLE_POCKET.moments.map((moment) => moment.trigger));
const TRIGGER_NAMES = Object.fromEntries(MARBLE_TRIGGERS.map((trigger) => [trigger.id, trigger.texts.name]));

function choiceByPrefix({ trigger, slot, marble }, question, t) {
  const ref = nameRef(`marble.${marble}.name`);
  if (trigger === "phase") return t("marbles.choice.by_phase", { slot: slotName(slot, t), marble: ref, question });
  if (POCKET_ENTRY_TRIGGERS.has(trigger)) return t("marbles.choice.by_pot_entry", { marble: ref, question });
  if (POCKET_TRIGGERS.has(trigger)) return t("marbles.choice.by_pot", { marble: ref, question });
  if (trigger === "hit") return t("marbles.choice.by_hit", { marble: ref, question });
  return t("marbles.choice.by_trigger", { moment: t(TRIGGER_NAMES[trigger]), marble: ref, question });
}

// La question d'un CHOIX EN ATTENTE (marbles/core/marbles.js, `pendingChoice`), à
// l'ouverture, avec la bille et le moment qui la posent : « Tic de gorille :
// choisissez une bille de votre main à empocher. », « Final de porcelaine : choisissez
// jusqu'à 2 billes actives à polir. T pour terminer. » ; après un premier choix, ce
// qui reste : « Choisissez encore une bille active. ».
export function describeChoicePrompt(pending, t) {
  if (pending.chosen.length > 0) {
    const target = choiceTarget(pending, t, pending.remaining, false);
    return t(pending.upTo ? "marbles.choice.more_up_to" : "marbles.choice.more", { target });
  }
  const effect = pending.amount === undefined ? undefined : combined(valueParts({ [pending.action]: pending.amount }, t), t);
  const question = choiceByPrefix(pending.by, t("marbles.choice.question", { target: choiceTarget(pending, t), verb: t(`marbles.choice.verb.${pending.action}`, { effect }) }), t);
  return pending.upTo ? `${question} ${t("marbles.choice.finish_hint")}` : question;
}

// La partie finit-elle après `index`, avant tout nouveau tour ?
function endsBeforeNextTurn(events, index) {
  const next = events.slice(index + 1).find((event) => event.type === "gameOver" || event.type === "turnStarted");
  return next?.type === "gameOver";
}

// Le journal découpé en ÉTAPES à dire, dans l'ordre chronologique :
// [{ text, events, messages, startsTurn?, endsGame? }]. `messages` : les messages de
// jeu que l'étape porte, pour l'historique (marbles/view/history.js), d'ordinaire
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
    if (isTrailing(event) && last !== undefined && waiting.length === 0) {
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
