// Vérifications — domaine « marbles-view ». Ce que le jeu des billes DIT et
// sonne : chaque refus, déclencheur, valeur de partie a ses textes, chaque
// évènement du journal (JOURNAL_EVENTS) se dit et a son point d'accroche sonore,
// aucun gabarit ne reste brut, dans chaque langue. Plus les fiches des billes,
// l'ordre du menu du sac et de la confirmation, le déplacement du curseur et la
// sélection d'emplacement.
// Sur la table de billes des vérifications (marbles/checks/fixtures/marbles.js), avec
// la traduction de test (helpers.js/keyText) : CE QUE la vue dit, gabarit et
// valeurs, sans dépendre de la rédaction des textes. Les PHRASES complètes ont une
// dizaine de témoins par langue (checkWitnesses), sur des billes fabriquées qui ne
// prennent aux vraies que leur nom. Les textes des vraies billes : domaine
// marbles-content.
// La vue d'ensemble et la séquence de résolution ont leur domaine,
// marbles-sequence. Rien n'est annoncé ni joué ici : runChecks() se lance aussi
// dans le jeu. Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js marbles-view`).

import { LOCALE_TABLES, nameRef, t as realT, setLocale, getLocale } from "../../data/i18n/index.js";
import {
  LARGE,
  MARBLE_CARD_MODEL,
  MARBLE_SIZES,
  MEDIUM,
  SMALL,
  MARBLE_SOUND_PROFILES,
  MARBLES_COLLISION,
  MARBLES_PITCH_VARIATION,
  MARBLES_SETTINGS,
  MARBLE_TRIGGERS,
} from "../config/values.js";
import { detailLine, stepDetail } from "../../lib/detail-card.js";
import { MARBLE_ERRORS, SLOTS } from "../core/marbles.js";
import { JOURNAL_EVENTS } from "../core/content.js";
import { emptyTally } from "../core/tally.js";
import { MARBLE_KEYWORDS, REACTION_KEYS, TALLY_COUNTERS } from "../core/content.js";
import { TALLY_CATEGORIES } from "../core/counters.js";
import {
  bagDisplayOrder,
  buildSteps,
  stepsText,
  describeBag,
  describeChoicePrompt,
  describeDiscard,
  describePot,
  describeEffect,
  describeHandFocus,
  describeOverview,
  describeMarbleInList,
  cardSituation,
  describePrinted,
  describeSlotFocus,
  describeSlotForPlacement,
  describeTurn,
  formatCounter,
  instanceLabel,
  originText,
  placementLines,
  remainingText,
  statusCard,
  refusalText,
  describeGoal,
  describeOpening,
  describeTurn as describeTurnLine,
  goalCard,
  resultText,
} from "../view/narration.js";
import { marbleCard } from "../view/card.js";
import { tallyMenu } from "../view/tally-screen.js";
import { keywordsMenu, keywordsText } from "../view/keywords.js";
import { descriptionText } from "../view/marble-info.js";
import { GAME_ZONES } from "../core/zones.js";
import { confirmationEntries } from "../../view/menus/confirmation.js";
import { INITIAL_CURSOR, placementStart, stepCursor, zoneOf } from "../view/navigation.js";
import {
  MARBLE_EVENT_CUES,
  beaconKey,
  discardPlace,
  eventCues,
  handPlace,
  handSizeChange,
  placesDemoCues,
  positionOf,
  potPlace,
  renderAt,
  rollRendering,
  rotationPath,
  slotPlace,
  validateMarbleSounds,
  validateRolls,
  collisionStrength,
  validateCollision,
  validatePitchVariation,
  validateSoundDepth,
  validateSoundPlaces,
} from "../view/sounds.js";
import { pathLength, rollAt, rollDurationMs, rollEnvelope } from "../view/rolls.js";
import { EMPTY_SOUND_QUEUE, advanceSoundQueue, enqueueCues } from "../view/sound-queue.js";
import { throws } from "../../lib/check.js";
import { CHOICELESS_TYPES, FIXTURE_DEFINITION, FIXTURE_STATUSES, FIXTURE_TYPES, fixtureRules } from "./fixtures/marbles.js";
import { choice, draw, polish, speed } from "../content/effects.js";
import { ruleInstance } from "../core/statuses.js";
import { answerChoices, emptyBagMarblesGame, fabricatedRules, inHand, isCleanText, keyText, marblesPlayState, mustReduce, overState, statusInstance } from "./helpers.js";
import { choiceAnswer, choiceCursorAfterAnswer, choiceFocusLine, choiceHandOptions, choiceListEntry, choiceStartCursor, stepChoiceCursor } from "../view/choice.js";
import { MARBLES_HELP_TOPICS, helpTopicText, marblesHelpMenu } from "../view/help-screen.js";
import { AMOUNT_SOURCES, CLAUSE_ACTIONS, TARGET_FILTERS, effectAt } from "../core/effects.js";

// Les règles de la table des vérifications (marbles/checks/fixtures/marbles.js).
const rules = fixtureRules();
// La même table sans cible au choix ni Éjecter.
const earlierRules = fixtureRules(CHOICELESS_TYPES);

// La traduction de test (helpers.js/keyText) : ce que la vue dit, clé et valeurs.
// Les vrais textes (realT) ne servent qu'aux vérifications de chaque langue et aux
// témoins.
const t = keyText;

// Les textes français portent des espaces insécables, invisibles dans une
// comparaison : on compare sur l'espace ordinaire.
function plain(text) {
  return text.replace(/[\u00a0\u202f]/g, " ");
}

// Les billes de la table des vérifications n'ont pas de nom : pour faire dire leurs
// évènements dans une vraie langue, chacune y prend celui d'une vraie bille.
function withRealNames(value) {
  // Une bille de test devient l'argile ; un statut de test, le coup de fouet.
  if (typeof value === "string") return Object.hasOwn(FIXTURE_TYPES, value) ? "clay" : Object.hasOwn(FIXTURE_STATUSES, value) ? "whiplash" : value;
  if (Array.isArray(value)) return value.map(withRealNames);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, withRealNames(inner)]));
  return value;
}

// Une partie complète, puis des cas fabriqués : chaque type d'évènement du journal
// (JOURNAL_EVENTS), ce que la vérification de couverture contrôle.
function sampleEvents() {
  const events = [];
  let state = rules.createGame(11);
  const step = (action) => {
    const result = answerChoices(rules, rules.reduce(state, action));
    if (result.ok) {
      state = result.state;
      events.push(...result.events);
    }
    return result.ok;
  };
  while (state.stage !== "over") {
    step({ type: "draw" });
    if (state.stage === "over") break;
    if (state.turn === 2) step({ type: "swap", a: "leftBase", b: "apex" });
    // Toujours trois poses, sur un emplacement occupé ou non : la défausse se
    // remplit, le sac régénère.
    for (const slot of SLOTS) step({ type: "place", handIndex: 0, slot });
    step({ type: "resolve" });
  }
  // Une main pleine, pour la pioche sautée.
  const fullHand = rules.reduce({ ...rules.createGame(4), stage: "draw", turn: 2, hand: inHand(["aging_flick", "hit_polish", "final_pocket", "awaken_draw", "all_rounder"]) }, { type: "draw" });
  events.push(...fullHand.events);
  // Polissage, Fêlure, cible vide : le Tic de hit_polish sur une pointe vide, puis le
  // base_pocket qui fêle une fragile.
  const polishedNothing = rules.reduce({ ...emptyBagMarblesGame(rules, 6), turn: 2, stage: "play", hand: inHand(["hit_polish"]), triangle: { leftBase: { marble: "aging_flick", wear: 0 }, rightBase: null, apex: null } }, { type: "place", handIndex: 0, slot: "leftBase" });
  events.push(...polishedNothing.events);
  // Une cible vide : le Tic de hit_polish sans choix (CHOICELESS_TYPES) polit la
  // pointe, vide.
  const polishedEmpty = earlierRules.reduce({ ...emptyBagMarblesGame(rules, 6), turn: 2, stage: "play", hand: inHand(["hit_polish"]), triangle: { leftBase: { marble: "aging_flick", wear: 0 }, rightBase: null, apex: null } }, { type: "place", handIndex: 0, slot: "leftBase" });
  events.push(...polishedEmpty.events);
  const pocketedApex = rules.reduce({ ...emptyBagMarblesGame(rules, 7), turn: 2, stage: "play", bag: ["aging_flick"], triangle: { leftBase: { marble: "base_pocket", wear: 0 }, rightBase: null, apex: { marble: "fragile", wear: 0 } } }, { type: "resolve" });
  events.push(...pocketedApex.events);
  // flick_strike fêle fragile de la pointe ; hit_pocket, pot plein, perd la
  // bille de la main choisie.
  const cracked = rules.reduce({ ...emptyBagMarblesGame(rules, 7), turn: 2, stage: "play", hand: inHand(["flick_strike"]), triangle: { leftBase: null, rightBase: null, apex: { marble: "fragile", wear: 0 } } }, { type: "place", handIndex: 0, slot: "apex" });
  events.push(...cracked.events);
  // Une Fêlure : flick_strike de la table sans choix ni Éjecter (CHOICELESS_TYPES).
  const crackedBefore = earlierRules.reduce({ ...emptyBagMarblesGame(rules, 7), turn: 2, stage: "play", hand: inHand(["flick_strike"]), triangle: { leftBase: null, rightBase: null, apex: { marble: "fragile", wear: 0 } } }, { type: "place", handIndex: 0, slot: "apex" });
  events.push(...crackedBefore.events);
  // Le Tic de hit_pocket fait choisir la bille de la main : aging_flick, perdue.
  const lost = answerChoices(rules, rules.reduce({ ...emptyBagMarblesGame(rules, 7), turn: 2, stage: "play", hand: inHand(["hit_pocket", "aging_flick"]), pot: ["hit_polish", "hit_polish", "hit_polish"], triangle: { leftBase: null, rightBase: null, apex: { marble: "aging_flick", wear: 0 } } }, { type: "place", handIndex: 0, slot: "apex" }));
  events.push(...lost.events);
  const polished = rules.reduce({ ...emptyBagMarblesGame(rules, 8), turn: 2, stage: "play", bag: ["aging_flick"], triangle: { leftBase: null, rightBase: null, apex: { marble: "awaken_draw", wear: 1 } } }, { type: "resolve" });
  events.push(...polished.events);
  // Une arrivée en main : une bille qui se renvoie en main à son Final, fabriquée
  // sous un id de la table des vérifications (ses textes : withRealNames).
  const bouncing = fabricatedRules({ aging_flick: { maxWear: 1, final: [{ action: "bounce" }] }, hit_polish: {} });
  const returned = bouncing.reduce({ ...emptyBagMarblesGame(bouncing, 8), turn: 2, stage: "play", bag: ["hit_polish"], triangle: { leftBase: null, rightBase: null, apex: { marble: "aging_flick", wear: 0 } } }, { type: "resolve" });
  events.push(...returned.events);
  // Une redirection : le Final de final_pocket l'empoche, en partance.
  const redirected = rules.reduce({ ...emptyBagMarblesGame(rules, 8), turn: 2, stage: "play", bag: ["aging_flick"], triangle: { leftBase: null, rightBase: null, apex: { marble: "final_pocket", wear: 2 } } }, { type: "resolve" });
  events.push(...redirected.events);
  // Sac vide, défausse pleine : la défausse devient le sac.
  // all_rounder active y trouve (Trouvaille).
  const regenerated = rules.reduce(
    { ...emptyBagMarblesGame(rules, 5), turn: 2, stage: "draw", hand: inHand([]), discard: ["aging_flick", "hit_polish"], triangle: { leftBase: null, rightBase: null, apex: { marble: "all_rounder", wear: 0 } } },
    { type: "draw" }
  );
  events.push(...regenerated.events);
  // Sac et défausse vides : la pioche s'arrête, la partie finit.
  const end = rules.reduce({ ...emptyBagMarblesGame(rules, 2), turn: 2, stage: "draw", hand: inHand(["aging_flick"]) }, { type: "draw" });
  events.push(...end.events);
  // Un tour avec des emplacements vides, pour les phases sautées.
  const skipped = rules.reduce({ ...emptyBagMarblesGame(rules, 3), turn: 2, stage: "play" }, { type: "resolve" });
  events.push(...skipped.events);
  // all_rounder du pot réagit à la Chiquenaude de aging_flick.
  const reacting = rules.reduce({ ...emptyBagMarblesGame(rules, 3), turn: 2, stage: "play", hand: inHand(["aging_flick"]), pot: ["all_rounder"] }, { type: "place", handIndex: 0, slot: "apex" });
  events.push(...reacting.events);
  // Un choix indécis : à l'aveugle seulement (la prévision), le Tic de hit_polish.
  const undecided = rules.reduce({ ...emptyBagMarblesGame(rules, 3), turn: 2, stage: "play", hand: inHand(["hit_polish"]), triangle: { leftBase: null, rightBase: null, apex: { marble: "aging_flick", wear: 0 } } }, { type: "place", handIndex: 0, slot: "apex" }, { blind: true });
  events.push(...undecided.events);
  // Les STATUTS (FIXTURE_STATUSES) : des reçus, un déjà là et une réaction à la
  // première pose (aging_flick, sa Chiquenaude), qui consomme la charge reçue et la
  // finit ; un renforcé à la seconde ; à la résolution, la fin d'un statut compté en
  // tours ; au tour suivant, l'activation d'un statut en attente.
  const statusRules = fabricatedRules({
    aging_flick: {
      flick: [
        { action: "applyStatus", status: "gain_charge", amount: 1 },
        { action: "applyStatus", status: "loss_cushion", amount: 1 },
        { action: "applyStatus", status: "flick_react", amount: 1 },
      ],
      base: [{ action: "speed", amount: 3 }],
      apex: [{ action: "speed", amount: 3 }],
    },
  });
  let statusState = { ...emptyBagMarblesGame(statusRules, 9), turn: 2, stage: "play", hand: inHand(["aging_flick", "aging_flick"]), statuses: [statusInstance("flick_react"), statusInstance("throws_next", { pending: true })] };
  for (const action of [{ type: "place", handIndex: 0, slot: "rightBase" }, { type: "place", handIndex: 0, slot: "leftBase" }, { type: "resolve" }, { type: "draw" }]) {
    const result = statusRules.reduce(statusState, action);
    statusState = result.state;
    events.push(...result.events);
  }
  // La limite de sécurité, nulle : chaque chaîne est coupée, l'action aboutit.
  const interrupted = rules.reduce(rules.createGame(3), { type: "draw" }, { eventLimit: 0 });
  events.push(...interrupted.events);
  return { events, state: { ...state, stage: "play" } };
}

// Les fiches d'une bille : ce que le modèle déclare, avec les vrais textes.
function checkCards(run) {
  {
    const fields = (marble) => {
      const card = marbleCard(marble, "principal", rules, t);
      return { above: card.above, below: card.below };
    };
    run.same(
      "fiche : pointe puis base au-dessus, chiquenaude puis tic au-dessous, montant calculé à 0 hors de la main",
      {
        above: [
          "card.apex{effect: effect.combined{parts: [effect.combined{parts: [effect.speed_up{amount: 4}]}]}}",
          "card.base{effect: effect.combined{parts: [effect.combined{parts: [effect.speed_up{amount: 1}]}]}}",
        ],
        below: [
          "card.flick{effect: effect.combined{parts: [effect.computed_current{effect: effect.computed_max{effect: effect.per_turn_in_hand{effect: effect.combined{parts: [effect.speed_up{amount: 1}]}}, max: +5}, current: 0}]}}",
          "card.hit{effect: effect.combined{parts: [effect.combined{parts: [effect.speed_up{amount: 2}]}]}}",
        ],
      },
      fields("aging_flick")
    );
    run.same(
      "fiche : éjection au-dessous, base sans effet",
      {
        above: [
          "card.apex{effect: effect.combined{parts: [effect.combined{parts: [effect.speed_up{amount: 6}]}]}}",
          "card.base{effect: effect.none}",
        ],
        below: [
          "card.hit{effect: effect.semicolon{first: effect.conditional{effect: effect.combined{parts: [effect.speed_up{amount: 4}]}, condition: condition.relativeSize{marble: ejected, is: smaller}}, rest: effect.pocket_choice{target: choice.noun.hand_marble{count: 1}}}}",
          "card.knockout{effect: effect.combined{parts: [effect.combined{parts: [effect.speed_up{amount: 3}]}]}}",
        ],
      },
      fields("hit_pocket")
    );
    run.same(
      "fiche : Empocher en base, une Fêlure ciblée, En poche en dernier",
      {
        above: [
          "card.apex{effect: effect.combined{parts: [effect.combined{parts: [effect.mass_up{amount: 3}]}]}}",
          "card.base{effect: effect.combined{parts: [effect.pocket_slot{slot: slot.apex}]}}",
        ],
        below: [
          "card.windfall{effect: effect.combined{parts: [effect.given{effect: effect.combined{parts: [effect.crack{amount: 1}]}, slot: slot.rightBase}]}}",
          "card.pocketed_resolution{effect: effect.combined{parts: [effect.per_zone_size_triangle{effect: effect.combined{parts: [effect.speed_up{amount: 2}]}, zone: triangle, size: <size.small.name>}]}}",
        ],
      },
      fields("base_pocket")
    );
    run.same(
      "fiche : effet négatif avec le vrai signe moins",
      [
        "card.apex{effect: effect.combined{parts: [effect.combined{parts: [effect.speed_down{amount: 3}]}]}}",
        "card.base{effect: effect.combined{parts: [effect.combined{parts: [effect.mass_up{amount: 2}]}]}}",
      ],
      fields("flick_strike").above
    );
    run.same(
      "fiche : variante de base, un seul champ",
      [
        "card.apex{effect: effect.combined{parts: [effect.combined{parts: [effect.speed_up{amount: 3}]}]}}",
        "card.base_variant{left: effect.combined{parts: [effect.combined{parts: [effect.speed_up{amount: 3}]}]}, right: effect.combined{parts: [effect.combined{parts: [effect.mass_up{amount: 1}]}]}}",
      ],
      fields("split_base").above
    );
    run(
      "fiche : effet imprimé conditionnel de tally_flick",
      "card.base_variant{left: effect.combined{parts: [effect.conditional{effect: effect.given{effect: effect.combined{parts: [effect.speed_up{amount: 4}]}, slot: slot.apex}, condition: condition.printedStat{slot: slot.apex, effect: effect.combined{parts: [effect.speed_up{amount: 1}]}}}]}, right: effect.combined{parts: [effect.combined{parts: [effect.speed_up{amount: 1}]}]}}",
      fields("tally_flick").above[1]
    );
    run.same(
      "fiche : la Pioche en base, un Polissage sur soi, une Éjection conditionnée au calibre",
      {
        above: [
          "card.apex{effect: effect.combined{parts: [effect.combined{parts: [effect.speed_up{amount: 2}]} | effect.combined{parts: [effect.polish{amount: 1}]}]}}",
          "card.base{effect: effect.combined{parts: [effect.combined{parts: [effect.draw{amount: 1}]}]}}",
        ],
        below: [
          "card.awaken{effect: effect.combined{parts: [effect.combined{parts: [effect.draw{amount: 1}]}]}}",
          "card.knockout{effect: effect.combined{parts: [effect.conditional{effect: effect.combined{parts: [effect.draw{amount: 1}]}, condition: condition.relativeSize{marble: placed, is: larger}}]}}",
          "card.pocketed_reaction{effect: effect.combined{parts: [effect.given{effect: effect.combined{parts: [effect.polish{amount: 1}]}, slot: slot.apex}]}, occurrence: tally.shuffles.each}",
        ],
      },
      fields("awaken_draw")
    );
    // Les conditions de calibre, lisibles à l'oreille.
    run("fiche : comptage par calibre", "card.base{effect: effect.combined{parts: [effect.per_zone_size_triangle{effect: effect.combined{parts: [effect.speed_up{amount: 1}]}, zone: triangle, size: <size.small.name>}]}}", fields("size_count").above[1]);
    run("fiche : calibre d'un emplacement", "card.apex{effect: effect.semicolon{first: effect.combined{parts: [effect.mass_up{amount: 1}]}, rest: effect.conditional{effect: effect.combined{parts: [effect.mass_up{amount: 2}]}, condition: condition.sizeAt{slot: slot.leftBase, size: <size.large.name>, not: no}}}}", fields("final_pocket").above[0]);
    run.same("fiche : un Polissage au choix au Tic", [
      "card.hit{effect: effect.combined{parts: [effect.given_choice{effect: effect.combined{parts: [effect.polish{amount: 1}]}, target: choice.noun.triangle_marble{count: 1}, upTo: no}]}}",
    ], fields("hit_polish").below);
    run.same(
      "fiche : un Polissage ciblé au Final, une Trouvaille entre Tic et Final",
      [
        "card.hit{effect: effect.combined{parts: [effect.combined{parts: [effect.mass_up{amount: 1}]}]}}",
        "card.windfall{effect: effect.combined{parts: [effect.combined{parts: [effect.polish{amount: 1}]}]}}",
        "card.final{effect: effect.combined{parts: [effect.given{effect: effect.combined{parts: [effect.polish{amount: 1}]}, slot: slot.apex} | effect.pocket_self]}}",
        "card.pocketed_resolution{effect: effect.combined{parts: [effect.combined{parts: [effect.mass_up{amount: 1}]}]}}",
      ],
      fields("final_pocket").below
    );
    run.same("fiche : la Pioche au tic", [
      "card.hit{effect: effect.combined{parts: [effect.combined{parts: [effect.draw{amount: 1}]}]}}",
    ], fields("split_base").below);
    run.same("fiche : la Pioche à l'éjection, puis sa réaction en poche", [
      "card.knockout{effect: effect.combined{parts: [effect.combined{parts: [effect.draw{amount: 1}]}]}}",
      "card.pocketed_reaction{effect: effect.combined{parts: [effect.combined{parts: [effect.mass_up{amount: 1}]}]}, occurrence: tally.ejectedMarbles.each}",
    ], fields("size_count").below);
    run("fiche : la réaction de all_rounder, en dernier", "card.pocketed_reaction{effect: effect.combined{parts: [effect.combined{parts: [effect.speed_up{amount: 2}]}]}, occurrence: tally.flick.each}", fields("all_rounder").below.at(-1));
    // Plusieurs occurrences écoutées : une ligne chacune, dans l'ordre des valeurs de
    // partie, après les moments fixes.
    const listening = fabricatedRules({
      many: { pocketed: { shuffles: [{ action: "mass", amount: 1 }], resolution: [{ action: "speed", amount: 1 }], flick: [{ action: "speed", amount: 2 }] } },
    });
    run.same(
      "fiche : moments fixes, puis une ligne par occurrence, dans l'ordre des valeurs de partie",
      [
        "card.pocketed_resolution{effect: effect.combined{parts: [effect.combined{parts: [effect.speed_up{amount: 1}]}]}}",
        "card.pocketed_reaction{effect: effect.combined{parts: [effect.combined{parts: [effect.speed_up{amount: 2}]}]}, occurrence: tally.flick.each}",
        "card.pocketed_reaction{effect: effect.combined{parts: [effect.combined{parts: [effect.mass_up{amount: 1}]}]}, occurrence: tally.shuffles.each}",
      ],
      marbleCard("many", "x", listening, t).below
    );
    run.same(
      "fiche : la Chiquenaude, le Final, puis En poche à l'entrée de fragile",
      [
        "card.flick{effect: effect.combined{parts: [effect.combined{parts: [effect.mass_up{amount: 1}]}]}}",
        "card.final{effect: effect.combined{parts: [effect.combined{parts: [effect.speed_up{amount: 4}]} | effect.given_choice{effect: effect.combined{parts: [effect.polish{amount: 1}]}, target: choice.up_to{target: choice.noun.triangle_marble{count: 2}}, upTo: yes}]}}",
        "card.pocketed_entry{effect: effect.combined{parts: [effect.combined{parts: [effect.speed_up{amount: 10}]}]}}",
      ],
      fields("fragile").below
    );
    // Un montant calculé, avec sa valeur actuelle : en main, celle de son compteur.
    const flickLine = (turnsInHand) => marbleCard("aging_flick", "principal", rules, t, { turnsInHand }).below[0];
    run("fiche : montant calculé en main, valeur actuelle", "card.flick{effect: effect.combined{parts: [effect.computed_current{effect: effect.computed_max{effect: effect.per_turn_in_hand{effect: effect.combined{parts: [effect.speed_up{amount: 1}]}}, max: +5}, current: +2}]}}", flickLine(2));
    run("fiche : montant calculé en main, plafonné", "card.flick{effect: effect.combined{parts: [effect.computed_current{effect: effect.computed_max{effect: effect.per_turn_in_hand{effect: effect.combined{parts: [effect.speed_up{amount: 1}]}}, max: +5}, current: +5}]}}", flickLine(8));
    run("fiche : Éjecter la bille en pointe, flick_strike", "card.flick{effect: effect.combined{parts: [effect.eject_slot{slot: slot.apex}]}}", fields("flick_strike").below[0]);
    run("fiche : Éjecter toutes les minibilles actives, one_shot", "card.final{effect: effect.combined{parts: [effect.combined{parts: [effect.draw{amount: 1}]} | effect.eject_all{target: target.all_size{size: <size.small.name>}}]}}", fields("one_shot").below.at(-1));
    run("fiche : Éjecter une bille active au choix, all_rounder", "card.base{effect: effect.combined{parts: [effect.eject_choice{target: choice.noun.triangle_marble{count: 1}}]}}", fields("all_rounder").above[1]);
    // Une valeur de partie : la valeur actuelle se lit dans le registre de la partie,
    // où que soit la bille ; hors de toute partie, à zéro.
    const withTally = (marble, values) => marbleCard(marble, "principal", rules, t, { tally: { ...emptyTally(TALLY_COUNTERS), ...values } });
    run(
      "fiche : valeur de partie, chiquenaudes ce tour",
      "card.flick{effect: effect.combined{parts: [effect.computed_current{effect: effect.computed_max{effect: effect.per_tally{effect: effect.combined{parts: [effect.speed_up{amount: 2}]}, unit: <tally.flick.unit>, scope: <tally.scope.turn>}, max: +6}, current: +4}]}}",
      withTally("tally_flick", { flick: { turn: 2, game: 6 } }).below[0]
    );
    run(
      "fiche : valeur de partie, plafonnée",
      "card.flick{effect: effect.combined{parts: [effect.computed_current{effect: effect.computed_max{effect: effect.per_tally{effect: effect.combined{parts: [effect.speed_up{amount: 2}]}, unit: <tally.flick.unit>, scope: <tally.scope.turn>}, max: +6}, current: +6}]}}",
      withTally("tally_flick", { flick: { turn: 5, game: 5 } }).below[0]
    );
    run(
      "fiche : valeur de partie, trouvailles cette partie",
      "card.apex{effect: effect.combined{parts: [effect.computed_current{effect: effect.computed_max{effect: effect.per_tally{effect: effect.combined{parts: [effect.speed_up{amount: 1}]}, unit: <tally.windfall.unit>, scope: <tally.scope.game>}, max: +10}, current: +2}]}}",
      withTally("hit_polish", { windfall: { turn: 0, game: 2 }, shuffles: { turn: 1, game: 9 } }).above[0]
    );
    run(
      "fiche : hors de toute partie, valeur actuelle à zéro",
      "card.apex{effect: effect.combined{parts: [effect.computed_current{effect: effect.computed_max{effect: effect.per_tally{effect: effect.combined{parts: [effect.speed_up{amount: 1}]}, unit: <tally.windfall.unit>, scope: <tally.scope.game>}, max: +10}, current: 0}]}}",
      marbleCard("hit_polish", "principal", rules, t).above[0]
    );
    // Sur le triangle, en pose : sans prévision possible, l'effet imprimé, avec le
    // registre de la partie.
    run(
      "texte : effet imprimé d'une bille active, avec le registre",
      "slot_line.placing_occupied{slot: slot.apex, name: <hit_polish>, effect: effect.combined{parts: [effect.computed_current{effect: effect.computed_max{effect: effect.per_tally{effect: effect.combined{parts: [effect.speed_up{amount: 1}]}, unit: <tally.windfall.unit>, scope: <tally.scope.game>}, max: +10}, current: +3}]}}",
      
        describeSlotForPlacement(
          { ...rules.createGame(1), stage: "over", triangle: { leftBase: null, rightBase: null, apex: { marble: "hit_polish", wear: 0 } }, tally: { ...emptyTally(TALLY_COUNTERS), windfall: { turn: 1, game: 3 } } },
          "apex",
          rules,
          t
        )
      
    );
    // Les autres formes d'un montant calculé : avec une base, sans plafond, négatif,
    // une action non signée.
    const source = { type: "turnsInHand" };
    const computedCard = (amount, action, turnsInHand) =>
      marbleCard("x", "principal", fabricatedRules({ x: { flick: [{ action, amount }] } }), t, { turnsInHand }).below[0];
    run("fiche : montant calculé avec une base", "card.flick{effect: effect.combined{parts: [effect.computed_current{effect: effect.computed_base{base: effect.combined{parts: [effect.speed_up{amount: 2}]}, effect: effect.per_turn_in_hand{effect: +1}}, current: +3}]}}", computedCard({ base: 2, step: 1, source }, "speed", 1));
    run(
      "fiche : montant calculé négatif",
      "card.flick{effect: effect.combined{parts: [effect.computed_current{effect: effect.computed_max{effect: effect.computed_base{base: effect.combined{parts: [effect.mass_down{amount: 2}]}, effect: effect.per_turn_in_hand{effect: +1}}, max: +1}, current: −2}]}}",
      computedCard({ base: -2, step: 1, source, max: 1 }, "mass", 0)
    );
    run("fiche : montant calculé d'une Pioche", "card.flick{effect: effect.combined{parts: [effect.computed_current{effect: effect.computed_max{effect: effect.per_turn_in_hand{effect: effect.combined{parts: [effect.draw{amount: 1}]}}, max: 3}, current: 3}]}}", computedCard({ base: 0, step: 1, source, max: 3 }, "draw", 4));
    run.same("fiche : l'Éveil en premier, puis le Final de one_shot", [
      "card.awaken{effect: effect.combined{parts: [effect.given{effect: effect.combined{parts: [effect.polish{amount: 1}]}, slot: slot.apex}]}}",
      "card.final{effect: effect.combined{parts: [effect.combined{parts: [effect.draw{amount: 1}]} | effect.eject_all{target: target.all_size{size: <size.small.name>}}]}}",
    ], fields("one_shot").below);
    run.same(
      "fiche : tic, éjection, final, dans cet ordre",
      [
        "card.hit{effect: effect.combined{parts: [effect.combined{parts: [effect.speed_up{amount: 1}]}]}}",
        "card.knockout{effect: effect.combined{parts: [effect.combined{parts: [effect.mass_up{amount: 2}]}]}}",
        "card.final{effect: effect.combined{parts: [effect.combined{parts: [effect.draw{amount: 1}]}]}}",
      ],
      marbleCard(
        "all",
        "x",
        fabricatedRules({ all: { final: [{ action: "draw", amount: 1 }], knockout: [{ action: "mass", amount: 2 }], hit: [{ action: "speed", amount: 1 }] } }),
        t
      ).below
    );
    run.same(
      "fiche : tic et éjection dans l'ordre",
      [
        "card.hit{effect: effect.combined{parts: [effect.combined{parts: [effect.speed_up{amount: 1}]}]}}",
        "card.knockout{effect: effect.combined{parts: [effect.combined{parts: [effect.mass_up{amount: 2}]}]}}",
      ],
      marbleCard("both", "x", fabricatedRules({ both: { knockout: [{ action: "mass", amount: 2 }], hit: [{ action: "speed", amount: 1 }] } }), t).below.map(
        plain
      )
    );
  }

  // Parcours sur une vraie fiche, comme au clavier.
  const card = marbleCard("aging_flick", "principal", rules, t);
  const walk = (...directions) => {
    let position = 0;
    return directions.map((direction) => {
      position = stepDetail(position, card, direction);
      return detailLine(card, position).split(" ")[0];
    });
  };
  run.same(
    "fiche : pointe, base, réannonce, retour, annonce principale, chiquenaude",
    [
      "card.apex{effect:",
      "card.base{effect:",
      "card.base{effect:",
      "card.apex{effect:",
      "principal",
      "card.flick{effect:",
    ],
    walk(1, 1, 1, -1, -1, -1)
  );

  // Ajouter un champ se fait en le déclarant : aucune navigation à toucher.
  const extendedModel = { ...MARBLE_CARD_MODEL, below: [...MARBLE_CARD_MODEL.below, { field: "spin", labelKey: "spin.label" }] };
  const spinner = { spinner: { spin: [{ action: "speed", amount: 1 }] } };
  // Des règles minimales pour des tables que la simulation refuserait (un champ
  // inventé) : la fiche ne lit que la table et les effets imprimés.
  const cardRules = (types) => ({ types, effectAt: (marble, slot) => effectAt(marble, slot, types) });
  run(
    "fiche : un champ déclaré apparaît",
    true,
    marbleCard("spinner", "x", cardRules(spinner), t, { model: extendedModel }).below[0].startsWith("spin.label")
  );
  run.same(
    "fiche : un champ déclaré, absent de la bille, n'existe pas",
    [t(MARBLE_CARD_MODEL.emptyBelowKey)],
    marbleCard("plain", "x", cardRules({ plain: {} }), t, { model: extendedModel }).below
  );
  run("fiche : champ obligatoire vide, aucun effet", 2, marbleCard("plain", "x", cardRules({ plain: {} }), t).above.length);
}

// Une partie à décisions fixes, avec ou sans consultation du sac et de la défausse
// entre deux actions.
function playWithLookups(seed, lookup) {
  let state = rules.createGame(seed);
  const journal = [];
  const step = (action) => {
    lookup(state);
    const result = answerChoices(rules, rules.reduce(state, action));
    if (result.ok) {
      state = result.state;
      journal.push(...result.events);
    }
  };
  while (state.stage !== "over") {
    step({ type: "draw" });
    for (const slot of SLOTS) step({ type: "place", handIndex: 0, slot });
    step({ type: "resolve" });
  }
  return { journal, state };
}

// Le menu de debug des valeurs de partie (Maj+L) : regroupé par catégorie, le titre
// de chacune puis une ligne par compteur avec ses deux portées, lues dans le
// registre ; enfin « Fermer », la seule entrée qui agisse ; Échap ferme aussi.
function checkTallyMenu(run) {
  const tally = { ...emptyTally(TALLY_COUNTERS), flick: { turn: 2, game: 5 }, shuffles: { turn: 0, game: 1 } };
  const menu = tallyMenu(tally);
  const lines = (built) => built.entries.map((entry) => t(entry.label, entry.labelParams));
  const said = lines(menu);
  run("menu des valeurs : titre", "tally.title", t(menu.title));
  run.same(
    "menu des valeurs : le début, la catégorie puis ses compteurs",
    [
      "tally.category.trigger",
      "tally.line{name: <tally.awaken.name>, turn: 0, game: 0}",
      "tally.line{name: <tally.flick.name>, turn: 2, game: 5}",
    ],
    said.slice(0, 3)
  );
  run.same(
    "menu des valeurs : les titres des catégories, dans l'ordre",
    [
      "tally.category.trigger",
      "tally.category.action",
      "tally.category.stat",
      "tally.category.event",
      "tally.close",
    ],
    said.filter((line) => !line.includes(":") && line !== "Fermer")
  );
  run("menu des valeurs : un mélange", true, said.includes("tally.line{name: <tally.shuffles.name>, turn: 0, game: 1}"));
  run("menu des valeurs : Fermer en dernier", "tally.close", said.at(-1));
  run("menu des valeurs : une ligne par compteur, un titre par catégorie, Fermer", TALLY_COUNTERS.length + TALLY_CATEGORIES.length + 1, menu.entries.length);
  run("menu des valeurs : Échap ferme", true, menu.closable);
  run.same("menu des valeurs : seule Fermer agit", [menu.entries.length - 1], menu.entries.flatMap((entry, index) => (typeof entry.onActivate === "function" ? [index] : [])));
  run("menu des valeurs : un compteur absent du registre lève", true, throws(() => tallyMenu({})));
}

// L'aide des mots-clés (touches E et Maj+E) : seulement ceux présents sur la bille,
// dans l'ordre (déclencheurs, En poche, actions, puis pointe et base), chacun une
// fois ; les cas vides.
function checkKeywords(run) {
  const ids = (marble, marbles = rules) => marbles.keywordsOf(marble).map((keyword) => keyword.id);
  run.same("mots-clés : one_shot, déclencheurs, actions, puis pointe et base", ["awaken", "final", "draw", "polish", "eject", "apex", "base"], ids("one_shot"));
  run.same("mots-clés : awaken_draw, la Pioche une seule fois (base, éveil, éjection) ; En poche par sa réaction", ["awaken", "knockout", "pocketed", "draw", "polish", "apex", "base"], ids("awaken_draw"));
  run.same("mots-clés : base_pocket, En poche avant les actions, Fêlure puis Empocher", ["windfall", "pocketed", "crack", "pocket", "apex", "base"], ids("base_pocket"));
  run.same("mots-clés : fragile, En poche par son seul effet d'entrée, Polissage par son Final", ["flick", "final", "pocketed", "polish", "apex", "base"], ids("fragile"));
  run.same("mots-clés : ni Vitesse ni Masse, ni calibre", ["flick", "hit", "apex", "base"], ids("aging_flick"));
  const made = fabricatedRules({ sided: { baseVariant: { leftBase: [{ action: "mass", amount: 1 }] } }, bare: {} });
  run.same("mots-clés : une variante de base seule compte comme base", ["base"], ids("sided", made));
  run.same("mots-clés : une bille sans effet n'en a aucun", [], ids("bare", made));
  run.same(
    "mots-clés : l'ordre de la liste, déclencheurs, En poche, actions, puis phases",
    ["awaken", "flick", "hit", "windfall", "knockout", "final", "drop", "polished", "cracked", "pocketed", "draw", "polish", "crack", "pocket", "eject", "discard", "bounce", "retrieve", "applyStatus", "apex", "base"],
    MARBLE_KEYWORDS.map((keyword) => keyword.id)
  );

  run(
    "touche E : all_rounder, d'une seule annonce, pointe et base en dernier",
    "keyword.line{name: <keyword.awaken.name>, description: <keyword.awaken.description>} keyword.line{name: <keyword.windfall.name>, description: <keyword.windfall.description>} keyword.line{name: <keyword.final.name>, description: <keyword.final.description>} keyword.line{name: <keyword.pocketed.name>, description: <keyword.pocketed.description>} keyword.line{name: <keyword.eject.name>, description: <keyword.eject.description>} keyword.line{name: <keyword.apex.name>, description: <keyword.apex.description>} keyword.line{name: <keyword.base.name>, description: <keyword.base.description>}",
    keywordsText("all_rounder", rules, t)
  );
  run("touche E : aucune bille", "keyword.no_marble", keywordsText(undefined, rules, t));
  run(
    "touche E : En poche et Empocher, tels que déclarés",
    true,
    keywordsText("final_pocket", rules, t).includes(
      "keyword.line{name: <keyword.pocketed.name>, description: <keyword.pocketed.description>} keyword.line{name: <keyword.polish.name>, description: <keyword.polish.description>} keyword.line{name: <keyword.pocket.name>, description: <keyword.pocket.description>} keyword.line{name: <keyword.apex.name>"
    )
  );
  run("touche E : aucun mot-clé", "keyword.none", keywordsText("bare", made, t));

  // Touche V : la description, un texte facultatif déduit de l'id de la bille.
  const described = (key) => key === "marble.bare.description";
  run("touche V : la description de la bille", "marble.bare.description", descriptionText("bare", t, described));
  run("touche V : une bille sans description", "description.none", descriptionText("one_shot", t, described));
  run("touche V : aucune bille (emplacement vide, main vide)", "no_marble", descriptionText(undefined, t, described));
  run("touche V : aucune bille (null)", "no_marble", descriptionText(null, t, described));
  const menu = keywordsMenu("one_shot", rules);
  const lines = (built) => built.entries.map((entry) => t(entry.label, entry.labelParams));
  run("Maj+E : titre", "keyword.title{marble: <one_shot>}", t(menu.title, menu.titleParams));
  run.same(
    "Maj+E : une entrée par mot-clé, puis Fermer",
    [
      "keyword.line{name: <keyword.awaken.name>, description: <keyword.awaken.description>}",
      "keyword.line{name: <keyword.final.name>, description: <keyword.final.description>}",
      "keyword.line{name: <keyword.draw.name>, description: <keyword.draw.description>}",
      "keyword.line{name: <keyword.polish.name>, description: <keyword.polish.description>}",
      "keyword.line{name: <keyword.eject.name>, description: <keyword.eject.description>}",
      "keyword.line{name: <keyword.apex.name>, description: <keyword.apex.description>}",
      "keyword.line{name: <keyword.base.name>, description: <keyword.base.description>}",
      "keyword.close",
    ],
    lines(menu).map((line) => line.split(" : ")[0])
  );
  run("Maj+E : la description de la Pioche", "keyword.line{name: <keyword.draw.name>, description: <keyword.draw.description>}", lines(menu)[2]);
  run("Maj+E : Échap ferme", true, menu.closable);
  run.same("Maj+E : seule Fermer agit", [menu.entries.length - 1], menu.entries.flatMap((entry, index) => (typeof entry.onActivate === "function" ? [index] : [])));
  run.same("Maj+E : aucun mot-clé", [
    "keyword.none",
    "keyword.close",
  ], lines(keywordsMenu("bare", made)));
  run.same("Maj+E : aucune bille", [
    "keyword.no_marble",
    "keyword.close",
  ], lines(keywordsMenu(undefined, rules)));
  run("Maj+E : aucune bille, titre", "keyword.title_none", t(keywordsMenu(undefined, rules).title));
  // Chaque mot-clé a son nom et sa description dans chaque langue.
  for (const [lang, table] of Object.entries(LOCALE_TABLES)) {
    const missing = MARBLE_KEYWORDS.flatMap((keyword) => [keyword.texts.name, keyword.texts.description]).filter((key) => !Object.hasOwn(table, key));
    run.same(`${lang} : chaque mot-clé a son nom et sa description`, [], missing);
  }
}

// L'aide du jeu des billes (touche H) : les rubriques dans l'ordre, puis « Les
// touches » et « Fermer » ; Échap ferme ; chaque rubrique a son texte court, dans
// chaque langue, avec les valeurs des réglages.
function checkHelpMenu(run) {
  const locale = getLocale();
  let keyHelpOpened = 0;
  const menu = marblesHelpMenu(() => (keyHelpOpened += 1));
  const labels = menu.entries.map((entry) => entry.label);
  setLocale("fr");
  run.same(
    "aide H : les rubriques dans l'ordre, puis les touches et Fermer",
    [
      "help.goal.title",
      "help.score.title",
      "help.triangle.title",
      "help.wear.title",
      "help.hand.title",
      "help.zones.title",
      "help.keywords.title",
      "help.statuses.title",
      "help.keys.title",
      "help.close",
    ],
    labels.map((label) => t(label))
  );
  run("aide H : son titre", "help.title", t(menu.title));
  run("aide H : Échap ferme", true, menu.closable);
  run("aide H : chaque entrée agit", true, menu.entries.every((entry) => typeof entry.onActivate === "function"));
  menu.entries.at(-2).onActivate();
  run("aide H : « Les touches » ouvre l'aide des touches", 1, keyHelpOpened);
  run.same("aide H : une rubrique par texte, dans l'ordre", ["goal", "score", "triangle", "wear", "hand", "zones", "keywords", "statuses"], MARBLES_HELP_TOPICS);
  // Les textes de l'aide citent les valeurs de la définition de la partie.
  const { turns: turnCount, start } = FIXTURE_DEFINITION;
  const { handSize: maxHandSize, throws: throwsPerTurn, firstTurnDraw, drawPerTurn, potCapacity } = start;
  run(
    "aide H : la main cite les réglages du jeu",
    `help.hand.text{turns: ${turnCount}, hand: ${maxHandSize}, throws: ${throwsPerTurn}, firstDraw: ${firstTurnDraw}, draw: ${drawPerTurn}, pot: ${potCapacity}}`,
    helpTopicText("hand", FIXTURE_DEFINITION, t)
  );
  run("aide H : le but du jeu, ses propres textes et les mêmes réglages", helpTopicText("hand", FIXTURE_DEFINITION, t).replace("help.hand.", "help.goal."), helpTopicText("goal", FIXTURE_DEFINITION, t));
  run("aide H : le pot cite sa capacité", true, helpTopicText("zones", FIXTURE_DEFINITION, t).endsWith(`pot: ${potCapacity}}`));
  setLocale("fr");
  run("aide H : les mots-clés renvoient à E et Maj+E", true, plain(helpTopicText("keywords", FIXTURE_DEFINITION, realT)).includes("touche E") && plain(helpTopicText("keywords", FIXTURE_DEFINITION, realT)).includes("Maj+E"));
  for (const lang of ["fr", "en"]) {
    setLocale(lang);
    const short = MARBLES_HELP_TOPICS.filter((id) => {
      const text = helpTopicText(id, FIXTURE_DEFINITION, realT);
      const sentences = text.split(/[.!?]\s/).length;
      return text.length === 0 || sentences > 4;
    });
    run.same(`aide H, ${lang} : chaque texte court, de quelques phrases`, [], short);
  }
  setLocale(locale);
}

// L'INTERFACE DE CHOIX (marbles/view/choice.js) et ses textes : la main limitée aux
// billes éligibles (« Ne rien choisir », puis « Terminer », en dernier dans un choix
// facultatif), le triangle entier
// avec ses emplacements non éligibles dits et bloqués, la navigation entre zones,
// la question, ce qui reste, les cibles choisies.
function checkChoiceInterface(run) {
  const choose = (zones, extra = {}) => ({ type: "choice", zones, pick: "marble", count: 1, mode: "required", ...extra });
  const made = fabricatedRules({
    plain: { apex: [{ action: "speed", amount: 1 }] },
    anyPocket: { hit: [{ action: "pocket", target: choose(["hand", "triangle"]) }] },
    upToPolish: { hit: [{ action: "polish", amount: 1, target: choose(["triangle"], { count: 2, mode: "optional" }) }] },
    twoCrack: { hit: [{ action: "crack", amount: 1, target: choose(["triangle"], { count: 2 }) }] },
    booster: { hit: [{ action: "speed", amount: 2, target: choose(["triangle"]) }] },
    // En poche, à chaque chiquenaude : Fêlure 1 au choix ; un choix ouvert pendant
    // le lancer de `flicker`, alors en transit.
    potCrack: { pocketed: { flick: [{ action: "crack", amount: 1, target: choose(["triangle"]) }] } },
    // Final : Polissage 1 au choix, pendant que la bille est en partance.
    finalChooser: { maxWear: 1, final: [{ action: "polish", amount: 1, target: choose(["triangle"]) }] },
    // Tic : Ramasser une bille de la défausse au choix.
    picker: { hit: [{ action: "retrieve", target: choose(["discard"]) }] },
    flicker: { flick: [{ action: "speed", amount: 1 }] },
  });
  const pending = (marble, triangle, hand = []) =>
    made.reduce({ ...emptyBagMarblesGame(made, 2), turn: 2, stage: "play", hand: inHand([marble, ...hand]), triangle }, { type: "place", handIndex: 0, slot: "apex" }).state;
  const cursor = (place, handIndex = 0) => ({ place, handIndex, lastBase: "leftBase" });

  // hit_pocket : la main seule, ses billes éligibles.
  const hitPocket = rules.reduce({ ...emptyBagMarblesGame(rules, 2), turn: 2, stage: "play", hand: inHand(["hit_pocket", "aging_flick", "final_pocket"]), triangle: { leftBase: null, rightBase: null, apex: { marble: "aging_flick", wear: 0 } } }, { type: "place", handIndex: 0, slot: "apex" }).state;
  const handOnly = hitPocket.pendingChoice;
  // La question d'un choix des billes fabriquées.
  const question = (pending) => describeChoicePrompt(pending, t);
  run("choix, question : la bille et le moment, puis la main", "choice.by_hit{marble: <hit_pocket>, question: choice.question.required{target: choice.noun.hand_marble{count: 1}, verb: choice.verb.pocket{effect: undefined}}}", describeChoicePrompt(handOnly, t));
  run.same("choix, main : les billes éligibles seulement", ["aging_flick", "final_pocket"], choiceHandOptions(handOnly).map((option) => option.marble));
  run.same("choix, main : le curseur s'y ouvre", { place: "hand", handIndex: 0 }, (({ place, handIndex }) => ({ place, handIndex }))(choiceStartCursor(handOnly, cursor("apex"))));
  run("choix, main : la position dans le menu du choix", "list.line{name: <final_pocket>, size: size.medium.name, families: [family.classics.name], rarity: rarity.common.name, maxWear: 3}. menu.position{index: 2, total: 2}", choiceFocusLine(hitPocket, cursor("hand", 1), rules, t));
  run("choix, main seule : pas de triangle", null, stepChoiceCursor(handOnly, cursor("hand"), "up"));
  run.same("choix, main : Entrée répond par la place dans la main", { type: "choose", target: { zone: "hand", index: 1 } }, choiceAnswer(handOnly, cursor("hand", 1)).action);
  run.same("choix, main : la fiche de la bille sous le curseur", "final_pocket", choiceListEntry(hitPocket, choiceHandOptions(hitPocket.pendingChoice)[1]).marble);

  // Le triangle seul, « jusqu'à 2 » : la question, Terminer, les non éligibles.
  const upTo = pending("upToPolish", { leftBase: { marble: "plain", wear: 1 }, rightBase: null, apex: { marble: "plain", wear: 0 } });
  const upToChoice = upTo.pendingChoice;
  run("choix, question : facultatif, jusqu'à 2, « ne rien choisir » annoncé", "choice.by_hit{marble: <upToPolish>, question: choice.question.optional{action: choice.may.polish{target: choice.up_to{target: choice.noun.triangle_marble{count: 2}}, limit: choice.at_most{target: choice.noun.triangle_marble{count: 2}}, effect: effect.combined{parts: [effect.polish{amount: 1}]}}}} choice.decline_hint", question(upToChoice));
  run.same("choix, triangle seul : le curseur sur le premier éligible", "leftBase", choiceStartCursor(upToChoice, cursor("hand")).place);
  run("choix, triangle seul : pas de main", null, stepChoiceCursor(upToChoice, cursor("leftBase"), "down"));
  run("choix, triangle : la navigation habituelle", "apex", stepChoiceCursor(upToChoice, cursor("leftBase"), "up").place);
  run("choix, triangle : un emplacement vide reste accessible", "rightBase", stepChoiceCursor(upToChoice, cursor("leftBase"), "right").place);
  run("choix, triangle : non éligible, dit", "slot_line.empty{slot: slot.rightBase} choice.not_eligible", choiceFocusLine(upTo, cursor("rightBase"), made, t));
  run.same("choix, triangle : non éligible, bloqué", { refusal: "notEligible" }, choiceAnswer(upToChoice, cursor("rightBase")));
  run.same("choix, triangle : éligible, Entrée répond", { type: "choose", target: { zone: "triangle", slot: "leftBase" } }, choiceAnswer(upToChoice, cursor("leftBase")).action);
  run.same("choix, triangle seul : pas de menu de main", [], choiceHandOptions(upToChoice));
  const afterOne = made.reduce(upTo, { type: "choose", target: { zone: "triangle", slot: "leftBase" } }).state.pendingChoice;
  run("choix, après un : ce qui reste, en mode facultatif", "choice.more.optional{action: choice.may.polish{target: choice.noun.triangle_marble{count: 1}, limit: choice.noun.triangle_marble{count: 1}, effect: effect.combined{parts: [effect.polish{amount: 1}]}}} choice.finish_hint", describeChoicePrompt(afterOne, t));
  run("choix, après un : la cible choisie n'est plus éligible", true, choiceFocusLine({ ...upTo, pendingChoice: afterOne }, cursor("leftBase"), made, t).endsWith("choice.not_eligible"));

  // Une bille EN TRANSIT (en cours de lancer) : l'emplacement qu'elle vise l'annonce
  // après son contenu, avant « Non éligible. » ; jamais une cible ; les autres
  // emplacements n'en disent rien.
  const throwing = (slot) =>
    made.reduce(
      { ...emptyBagMarblesGame(made, 2), turn: 2, stage: "play", hand: inHand(["flicker"]), pot: ["potCrack"], triangle: { leftBase: { marble: "plain", wear: 1 }, rightBase: null, apex: { marble: "plain", wear: 0 } } },
      { type: "place", handIndex: 0, slot }
    ).state;
  const toApex = throwing("apex");
  run(
    "transit : l'emplacement visé, occupé, l'annonce après son contenu",
    "slot_line.occupied{slot: slot.apex, name: <plain>, size: size.medium.name, wear: 0, maxWear: 3} choice.in_transit.thrown{name: <flicker>}",
    choiceFocusLine(toApex, cursor("apex"), made, t)
  );
  run("transit : un autre emplacement n'en dit rien", "slot_line.occupied{slot: slot.leftBase, name: <plain>, size: size.medium.name, wear: 1, maxWear: 3}", choiceFocusLine(toApex, cursor("leftBase"), made, t));
  const toEmpty = throwing("rightBase");
  run(
    "transit : l'emplacement visé, vide et non éligible, l'annonce avant « Non éligible »",
    "slot_line.empty{slot: slot.rightBase} choice.in_transit.thrown{name: <flicker>} choice.not_eligible",
    choiceFocusLine(toEmpty, cursor("rightBase"), made, t)
  );
  run.same("transit : jamais une cible, Entrée bloque sur l'emplacement vide qu'elle vise", { refusal: "notEligible" }, choiceAnswer(toEmpty.pendingChoice, cursor("rightBase")));
  // EN PARTANCE : pendant son Final, l'emplacement que la bille quitte le dit.
  const leaving = made.reduce(
    { ...emptyBagMarblesGame(made, 2), turn: 2, stage: "play", bag: ["plain"], triangle: { leftBase: { marble: "plain", wear: 0 }, rightBase: null, apex: { marble: "finalChooser", wear: 0 } } },
    { type: "resolve" }
  ).state;
  run(
    "en partance : l'emplacement quitté l'annonce, avant « Non éligible »",
    "slot_line.empty{slot: slot.apex} choice.in_transit.leaving{name: <finalChooser>} choice.not_eligible",
    choiceFocusLine(leaving, cursor("apex"), made, t)
  );
  run("en partance : un autre emplacement n'en dit rien", false, choiceFocusLine(leaving, cursor("leftBase"), made, t).includes("in_transit"));

  // LA DÉFAUSSE (Ramasser) : un menu horizontal, dans l'ordre d'arrivée, à la place
  // de la main ; Entrée répond par la place dans la défausse ; la fiche est celle de
  // la bille.
  const picking = made.reduce(
    { ...emptyBagMarblesGame(made, 2), turn: 2, stage: "play", hand: inHand(["picker"]), discard: ["plain", "booster"], triangle: { leftBase: null, rightBase: null, apex: { marble: "plain", wear: 0 } } },
    { type: "place", handIndex: 0, slot: "apex" }
  ).state;
  const fromDiscard = picking.pendingChoice;
  run(
    "défausse, question : choisir une bille de la défausse à ramasser",
    "choice.by_hit{marble: <picker>, question: choice.question.required{target: choice.noun.discard_marble{count: 1}, verb: choice.verb.retrieve{effect: undefined}}}",
    describeChoicePrompt(fromDiscard, t)
  );
  // Au Tic, la remplacée est en partance : elle n'est pas encore à la défausse.
  run.same("défausse : le menu, dans l'ordre d'arrivée, sans la remplacée en partance", ["plain", "booster"], choiceHandOptions(fromDiscard).map((option) => option.marble));
  run.same("défausse : le curseur s'y ouvre", { place: "hand", handIndex: 0 }, (({ place, handIndex }) => ({ place, handIndex }))(choiceStartCursor(fromDiscard, cursor("apex"))));
  run("défausse : la position dans le menu", "list.line{name: <booster>, size: size.medium.name, families: [family.classics.name], rarity: rarity.common.name, maxWear: 3}. menu.position{index: 2, total: 2}", choiceFocusLine(picking, cursor("hand", 1), made, t));
  run.same("défausse : Entrée répond par la place dans la défausse", { type: "choose", target: { zone: "discard", index: 1 } }, choiceAnswer(fromDiscard, cursor("hand", 1)).action);
  run.same("défausse : la fiche de la bille sous le curseur", { marble: "booster", turnsInHand: 0 }, (({ marble, turnsInHand }) => ({ marble, turnsInHand }))(choiceListEntry(picking, choiceHandOptions(picking.pendingChoice)[1])));
  run("défausse seule : pas de triangle", null, stepChoiceCursor(fromDiscard, cursor("hand"), "up"));

  // Obligatoire, 2 : la question, puis ce qui reste.
  const two = pending("twoCrack", { leftBase: { marble: "plain", wear: 0 }, rightBase: { marble: "plain", wear: 0 }, apex: { marble: "plain", wear: 0 } });
  run("choix, question : 2 billes actives", "choice.by_hit{marble: <twoCrack>, question: choice.question.required{target: choice.noun.triangle_marble{count: 2}, verb: choice.verb.crack{effect: effect.combined{parts: [effect.crack{amount: 1}]}}}}", question(two.pendingChoice));
  const oneDone = made.reduce(two, { type: "choose", target: { zone: "triangle", slot: "rightBase" } }).state.pendingChoice;
  run("choix, après un : ce qui reste", "choice.more.required{target: choice.noun.triangle_marble{count: 1}}", describeChoicePrompt(oneDone, t));

  // Un bonus au choix : sa valeur dans la question.
  const boost = pending("booster", { leftBase: { marble: "plain", wear: 0 }, rightBase: null, apex: { marble: "plain", wear: 0 } });
  run("choix, question : un bonus", "choice.by_hit{marble: <booster>, question: choice.question.required{target: choice.noun.triangle_marble{count: 1}, verb: choice.verb.speed{effect: effect.combined{parts: [effect.speed_up{amount: 2}]}}}}", question(boost.pendingChoice));

  // Les deux zones : la main (avec Terminer s'il y a lieu), puis le triangle.
  const both = pending("anyPocket", { leftBase: null, rightBase: null, apex: { marble: "plain", wear: 0 } }, ["plain"]);
  run("choix, question : main ou active", "choice.by_hit{marble: <anyPocket>, question: choice.question.required{target: choice.noun.hand_triangle_marble{count: 1}, verb: choice.verb.pocket{effect: undefined}}}", question(both.pendingChoice));
  // Chaque moment : une phase, un Final, une réaction du pot.
  const tigerBase = rules.reduce({ ...emptyBagMarblesGame(rules, 2), turn: 2, stage: "play", triangle: { leftBase: { marble: "all_rounder", wear: 0 }, rightBase: null, apex: { marble: "aging_flick", wear: 0 } } }, { type: "resolve" }).state;
  run("choix, question : en phase, l'emplacement et la bille", "choice.by_phase{slot: slot.leftBase, marble: <all_rounder>, question: choice.question.required{target: choice.noun.triangle_marble{count: 1}, verb: choice.verb.eject{effect: undefined}}}", describeChoicePrompt(tigerBase.pendingChoice, t));
  const porcelainFinal = rules.reduce({ ...emptyBagMarblesGame(rules, 2), turn: 2, stage: "play", bag: ["aging_flick"], triangle: { leftBase: { marble: "aging_flick", wear: 0 }, rightBase: null, apex: { marble: "fragile", wear: 1 } } }, { type: "resolve" }).state;
  run("choix, question : au Final", "choice.by_trigger{moment: keyword.final.name, marble: <fragile>, question: choice.question.optional{action: choice.may.polish{target: choice.up_to{target: choice.noun.triangle_marble{count: 2}}, limit: choice.at_most{target: choice.noun.triangle_marble{count: 2}}, effect: effect.combined{parts: [effect.polish{amount: 1}]}}}} choice.decline_hint", describeChoicePrompt(porcelainFinal.pendingChoice, t));
  run("choix, question : en réaction du pot", "choice.by_pot{marble: <awaken_draw>, question: choice.question.required{target: choice.noun.triangle_marble{count: 1}, verb: choice.verb.polish{effect: effect.combined{parts: [effect.polish{amount: 1}]}}}}", describeChoicePrompt({ ...two.pendingChoice, action: "polish", count: 1, by: { trigger: "pocketReaction", slot: null, marble: "awaken_draw" } }, t));
  run("choix, question : à l'entrée au pot", true, describeChoicePrompt({ ...two.pendingChoice, by: { trigger: "pocketEntry", slot: null, marble: "fragile" } }, t).startsWith("choice.by_pot_entry{marble: <fragile>"));
  run("choix, deux zones : de la main vers le triangle", "leftBase", stepChoiceCursor(both.pendingChoice, cursor("hand"), "up").place);
  run("choix, deux zones : du triangle vers la main", "hand", stepChoiceCursor(both.pendingChoice, cursor("leftBase"), "down").place);
  // Deux zones, mais plus aucune bille éligible en main (aucune au départ, ou la
  // dernière déjà choisie) : le curseur n'entre jamais dans une main sans option.
  const triangleLeft = { ...both.pendingChoice, eligible: both.pendingChoice.eligible.filter((target) => target.zone === "triangle") };
  run("choix, deux zones, main sans option : le curseur s'ouvre sur le triangle", "apex", choiceStartCursor(triangleLeft, cursor("hand")).place);
  run("choix, deux zones, main sans option : on n'y descend pas", false, ["leftBase", "rightBase"].some((slot) => stepChoiceCursor(triangleLeft, cursor(slot), "down")?.place === "hand"));
  run("choix, deux zones, main sans option : après une réponse, le curseur la quitte", "apex", choiceCursorAfterAnswer(triangleLeft, cursor("hand")).place);
  run("choix, deux zones, après une réponse : le curseur reste là où il a des options", "hand", choiceCursorAfterAnswer(both.pendingChoice, cursor("hand")).place);

  // « Ne rien choisir » en fin de menu de la main, dans un choix facultatif.
  const upToHand = { ...handOnly, mode: "optional" };
  run.same("choix, main, facultatif : Ne rien choisir en dernier", ["marble", "marble", "finish"], choiceHandOptions(upToHand).map((option) => option.kind));
  run("choix, main, facultatif : rien de choisi, « Ne rien choisir »", "choice.decline. menu.position{index: 3, total: 3}", choiceFocusLine({ ...hitPocket, pendingChoice: upToHand }, cursor("hand", 2), rules, t));
  const oneChosen = { ...upToHand, chosen: [upToHand.eligible[0]], eligible: upToHand.eligible.slice(1) };
  run("choix, main, facultatif : une cible choisie, « Terminer »", "choice.finish. menu.position{index: 2, total: 2}", choiceFocusLine({ ...hitPocket, pendingChoice: oneChosen }, cursor("hand", 1), rules, t));
  run.same("choix, main, obligatoire : ni « Ne rien choisir » ni « Terminer »", ["marble", "marble"], choiceHandOptions(handOnly).map((option) => option.kind));
  run.same("choix, main, facultatif : Ne rien choisir répond", { type: "choose", done: true }, choiceAnswer(upToHand, cursor("hand", 2)).action);
  run("choix, Terminer : aucune fiche", null, choiceListEntry({ ...hitPocket, pendingChoice: upToHand }, choiceHandOptions(upToHand)[2]));

  // Les cibles choisies se disent, accord compris ; la fin, quand elle n'est pas d'avoir
  // fait les N choix ; rien à choisir.
  run("choix, dit : une bille choisie", "choice.chosen{marble: <final_pocket>}", t("marbles.choice.chosen", { marble: nameRef("marble.final_pocket.name") }));
  run("choix, dit : un hit_pocket choisi", "choice.chosen{marble: <hit_pocket>}", t("marbles.choice.chosen", { marble: nameRef("marble.hit_pocket.name") }));
  run(
    "choix, dit : la réponse de hit_pocket, puis l'arrivée de la délogée",
    "choice.chosen{marble: <final_pocket>} event.pocketed{marble: <final_pocket>} event.discarded.replacement{marble: <aging_flick>}",
    stepsText(buildSteps(rules.reduce(hitPocket, { type: "choose", target: { zone: "hand", index: 1 } }).events, t))
  );
  run(
    "choix, dit : rien de choisi, l'action ignorée, puis l'arrivée de la délogée",
    "choice.ended.declined event.discarded.replacement{marble: <plain>}",
    stepsText(buildSteps(made.reduce(upTo, { type: "choose", done: true }).events, t))
  );
  const doneAfterOne = made.reduce(made.reduce(upTo, { type: "choose", target: { zone: "triangle", slot: "leftBase" } }).state, { type: "choose", done: true });
  run("choix, dit : Terminer après une cible", true, stepsText(buildSteps(doneAfterOne.events, t)).includes("choice.ended.done"));

}

// La touche P : le pot et les billes perdues, accords compris.
function checkPotStatus(run) {
  const game = (pot, lost) => ({ ...rules.createGame(1), pot, lost });
  run("touche P : vide", "state.pot{count: 0, capacity: 3, lost: 0}", describePot(game([], []), rules, t));
  run("touche P : une de chaque", "state.pot{count: 1, capacity: 3, lost: 1}", describePot(game(["aging_flick"], ["hit_polish"]), rules, t));
  run("touche P : pluriels", "state.pot{count: 3, capacity: 3, lost: 2}", describePot(game(["aging_flick", "hit_polish", "final_pocket"], ["awaken_draw", "all_rounder"]), rules, t));
  run("Maj+P : le titre du menu", "pile.pot", t("marbles.pile.pot"));
}

function checkBagOrder(run) {
  // L'ordre affiché ne dépend que du contenu : deux ordres de pioche, une liste.
  const bag = ["all_rounder", "aging_flick", "one_shot", "final_pocket", "aging_flick"];
  run.same("sac : l'ordre affiché ne dépend pas de l'ordre de pioche", bagDisplayOrder(bag, t), bagDisplayOrder([...bag].reverse(), t));
  run.same("sac : rien de perdu, doublons compris", [...bag].sort(), [...bagDisplayOrder(bag, t)].sort());
  const original = [...bag];
  bagDisplayOrder(bag, t);
  run.same("sac : la liste reçue n'est pas touchée", original, bag);

  // Sur les vraies parties : une graine, un ordre de pioche, jamais révélé.
  {
    run.same("sac : alphabétique sur le nom dit", [
      "aging_flick",
      "aging_flick",
      "all_rounder",
      "final_pocket",
      "one_shot",
    ], bagDisplayOrder(bag, t));
    const order = (seed) => bagDisplayOrder(rules.createGame(seed).bag, t).join();
    run("sac : même liste quelle que soit la graine", order(1), order(2));
    run("sac : deux graines, deux vrais ordres de pioche", false, rules.createGame(1).bag.join() === rules.createGame(2).bag.join());
  }

  // Consulter ne change rien à la partie : même journal, même état, générateur
  // compris, que les menus aient été ouverts ou non.
  const plainGame = playWithLookups(21, () => {});
  const looked = playWithLookups(21, (state) => {
    Object.freeze(state);
    Object.freeze(state.bag);
    Object.freeze(state.discard);
    bagDisplayOrder(state.bag, t);
    describeBag(state, rules, t);
    describeDiscard(state, t);
    for (const marble of [...state.bag, ...state.discard]) marbleCard(marble, "x", rules, t);
  });
  run.same("sac : consulter ne change pas le journal", plainGame.journal, looked.journal);
  run.same("sac : consulter ne change pas l'état final", plainGame.state, looked.state);
  run("sac : la partie comparée pioche bien", true, plainGame.journal.some((event) => event.type === "draw"));

  // La défausse : l'ordre d'arrivée, celui que tient l'état.
  let state = { ...emptyBagMarblesGame(rules, 1), turn: 2, stage: "play", hand: inHand(["aging_flick", "hit_polish", "final_pocket"]) };
  state = { ...state, triangle: { leftBase: { marble: "fragile", wear: 0 }, rightBase: { marble: "all_rounder", wear: 0 }, apex: { marble: "one_shot", wear: 0 } } };
  for (const slot of ["apex", "leftBase", "rightBase"]) state = answerChoices(rules, rules.reduce(state, { type: "place", handIndex: 0, slot })).state;
  run.same("défausse : de la plus ancienne à la plus récente", ["one_shot", "fragile", "all_rounder"], state.discard);
}

// Les sons : profils, repères d'un geste et leur ligne de temps, file de sons.
// Rien n'est joué : on vérifie QUAND chaque son partirait.
function checkSounds(run) {
  // Le son suit le calibre : un profil par calibre, aucun champ sonore par bille.
  run("profils : chaque calibre a son profil", true, Object.keys(MARBLE_SIZES).every((size) => Object.hasOwn(MARBLE_SOUND_PROFILES, size)));
  run("profils : les réglages du jeu sont valides", false, throws(() => validateMarbleSounds(MARBLE_SIZES, MARBLE_SOUND_PROFILES, MARBLES_SETTINGS)));
  run("profils : calibre sans profil refusé", true, throws(() => validateMarbleSounds(MARBLE_SIZES, { [SMALL]: MARBLE_SOUND_PROFILES[SMALL] }, MARBLES_SETTINGS)));
  run("profils : profil sans chute refusé", true, throws(() => validateMarbleSounds({ [SMALL]: "small" }, { [SMALL]: { beacon: "a" } }, MARBLES_SETTINGS)));
  // La balise d'une bille : la sienne, sinon celle de son calibre.
  const beaconTypes = { own: { size: SMALL, beacon: "assets/sounds/marbles/own_beacon" }, plain: { size: LARGE } };
  run("balise : la balise propre de la bille", "assets/sounds/marbles/own_beacon", beaconKey("own", beaconTypes));
  run("balise : sans balise propre, celle du calibre", MARBLE_SOUND_PROFILES[LARGE].beacon, beaconKey("plain", beaconTypes));
  run("collision : réglages du jeu valides", false, throws(() => validateCollision(MARBLES_COLLISION)));
  run("collision : écart négatif refusé", true, throws(() => validateCollision({ ...MARBLES_COLLISION, flamMs: -1 })));
  run("collision : calibre sans poids refusé", true, throws(() => validateCollision({ ...MARBLES_COLLISION, weights: { [SMALL]: 1, [LARGE]: 3 } })));
  run("collision : poids nul refusé", true, throws(() => validateCollision({ ...MARBLES_COLLISION, weights: { ...MARBLES_COLLISION.weights, [MEDIUM]: 0 } })));
  // Comme avant pour des tailles équivalentes : poids 1, 2, 3, exposant 0,3.
  run(
    "collision : un calot sur une minibille, 1,39 ; l'inverse, 0,72 ; même calibre, 1",
    "1.39 0.72 1",
    [
      collisionStrength("one_shot", "fragile", { types: FIXTURE_TYPES }),
      collisionStrength("fragile", "one_shot", { types: FIXTURE_TYPES }),
      collisionStrength("one_shot", "flick_strike", { types: FIXTURE_TYPES }),
    ].map((strength) => Math.round(strength * 100) / 100).join(" ")
  );
  run("ton : réglages du jeu valides", false, throws(() => validatePitchVariation(MARBLES_PITCH_VARIATION)));
  run("ton : variation sans chute refusée", true, throws(() => validatePitchVariation({ impact: 0.04, roll: 0.02 })));
  const strengthTable = {
    types: { pebble: { size: SMALL }, boulder: { size: LARGE }, twin: { size: SMALL } },
    collision: { flamMs: 10, weights: { [SMALL]: 1, [LARGE]: 4 }, weightExponent: 0.5 },
  };
  run("collision : deux billes de même taille, force 1", 1, collisionStrength("pebble", "twin", strengthTable));
  run("collision : une lourde sur une légère frappe plus fort", 2, collisionStrength("boulder", "pebble", strengthTable));
  run("collision : une légère sur une lourde frappe moins fort", 0.5, collisionStrength("pebble", "boulder", strengthTable));
  run(
    "collision : exposant nul, force toujours 1",
    1,
    collisionStrength("boulder", "pebble", { ...strengthTable, collision: { ...strengthTable.collision, weightExponent: 0 } })
  );
  run(
    "profils : profil sans roulement refusé",
    true,
    throws(() => validateMarbleSounds({ [SMALL]: "small" }, { [SMALL]: { beacon: "a", drop: "b", impact: "c" } }, MARBLES_SETTINGS))
  );
  run("profils : délai négatif refusé", true, throws(() => validateMarbleSounds({}, {}, { ...MARBLES_SETTINGS, drawSoundIntervalMs: -1 })));

  run("profils : délai d'usure négatif refusé", true, throws(() => validateMarbleSounds({}, {}, { ...MARBLES_SETTINGS, crackToOutMs: -1 })));
  run("ton : variation de la fêlure manquante refusée", true, throws(() => validatePitchVariation({ ...MARBLES_PITCH_VARIATION, crack: undefined })));

  const settings = { shuffleToDrawMs: 900, drawSoundIntervalMs: 350, swapSoundDelayMs: 150, wearSoundIntervalMs: 120, crackToOutMs: 150, awakenAfterDrawMs: 250, triggerSoundIntervalMs: 120 };
  // La table des billes des repères : celle des vérifications, injectée comme les
  // règles de l'écran injectent la leur.
  const FIXTURE_TABLE = { types: FIXTURE_TYPES };
  const draws = ["aging_flick", "hit_polish", "one_shot"].map((marble) => ({ type: "draw", marble }));
  run.same(
    "repères : ouverture, le brassage puis une balise après l'autre",
    [
      { atMs: 0, sound: "shuffle" },
      { atMs: 900, sound: "beacon", marble: "aging_flick" },
      { atMs: 1250, sound: "beacon", marble: "hit_polish" },
      { atMs: 1600, sound: "beacon", marble: "one_shot" },
    ],
    eventCues([{ type: "turnStarted", turn: 1, turnCount: 9 }, ...draws], { shuffleFirst: true }, settings, FIXTURE_TABLE)
  );
  run.same(
    "repères : une pioche sans brassage part aussitôt",
    [0, 350],
    eventCues(draws.slice(0, 2), {}, settings, FIXTURE_TABLE).map((cue) => cue.atMs)
  );
  run.same(
    "repères : sac régénéré, le brassage avant la pioche",
    ["shuffle@0", "beacon@900"],
    eventCues([{ type: "bagRegenerated", size: 4 }, draws[0]], {}, settings, FIXTURE_TABLE).map((cue) => `${cue.sound}@${cue.atMs}`)
  );
  // Roulements, sur une table aux distances rondes : de la main au milieu à la
  // pointe, 1 ; d'une base à l'autre, 0,8 ; de la pointe à la défausse, 0,8.
  const places = {
    hand: { fromX: -0.6, toX: 0.6, y: 0 },
    leftBase: { x: -0.4, y: 0.5 },
    rightBase: { x: 0.4, y: 0.5 },
    apex: { x: 0, y: 1 },
    discard: { x: 0.8, y: 1 },
    pot: { x: -0.8, y: 1 },
  };
  const rolls = {
    place: { speed: 1, endRatio: 1 },
    swap: { speed: 1, endRatio: 1 },
    out: { speed: 1, endRatio: 0.6 },
    strike: { speed: 2, endRatio: 1 },
    knocked: { speed: 1, endRatio: 0.6 },
    rotation: { notchMs: 700, endRatio: 0.5, gain: 0.6, dropGain: 0.5 },
    restRate: 0.5,
    fadeMs: 100,
    impactToOutMs: 30,
    outStaggerMs: 200,
  };
  const motion = { rolls, places, types: FIXTURE_TYPES };
  const placeName = (place) => place.slot ?? place.kind;
  const rolled = (cues) =>
    cues.map((cue) =>
      cue.sound === "roll"
        ? `roll ${cue.marble} ${cue.path.map(placeName).join(">")} @${cue.atMs}+${Math.round(cue.durationMs)}`
        : `${cue.sound} ${cue.marble}${cue.struck ? `>${cue.struck}` : ""} ${placeName(cue.place)} @${Math.round(cue.atMs)}${cue.gain === undefined ? "" : ` x${cue.gain}`}`
    );
  // Une Éjecter à la Chiquenaude, posée sur un emplacement vide : la chassée roule à la
  // défausse, une seule fois ; la posée se pose, sans choc.
  const ejectingFlick = [
    { type: "flick", slot: "leftBase", marble: "flick_strike", turnsInHand: 0 },
    { type: "eject", slot: "apex", marble: "aging_flick", by: { trigger: "flick", slot: "leftBase", marble: "flick_strike" } },
    { type: "removed", slot: "apex", marble: "aging_flick", cause: "eject" },
    { type: "knockout", slot: "apex", marble: "aging_flick", replacement: { placed: "flick_strike", ejected: "aging_flick" }, by: { trigger: "flick", slot: "leftBase", marble: "flick_strike" } },
    { type: "discarded", marble: "aging_flick", from: "triangle", slot: "apex", cause: "eject" },
    { type: "placed", slot: "leftBase", marble: "flick_strike" },
  ];
  const ejectCues = eventCues(ejectingFlick, { placeFrom: handPlace(0, 1) }, settings, motion);
  run.same(
    "repères : Éjecter hors d'une pose, une seule sortie de la chassée, une pose sans choc",
    { outs: 1, collisions: 0, placedDrop: true },
    {
      outs: ejectCues.filter((cue) => cue.sound === "roll" && cue.marble === "aging_flick").length,
      collisions: ejectCues.filter((cue) => cue.sound === "collision").length,
      placedDrop: ejectCues.some((cue) => cue.sound === "drop" && cue.marble === "flick_strike"),
    }
  );
  run.same(
    "repères : une pose, la bille roule de la main à l'emplacement, puis y tombe",
    ["roll final_pocket hand>apex @0+1000", "drop final_pocket apex @1000"],
    rolled(eventCues([{ type: "placed", slot: "apex", marble: "final_pocket" }], { placeFrom: handPlace(1, 3) }, settings, motion))
  );
  run.same(
    "repères : une pose part de la place de la bille dans la main",
    handPlace(4, 5),
    eventCues([{ type: "placed", slot: "apex", marble: "final_pocket" }], { placeFrom: handPlace(4, 5) }, settings, motion)[0].path[0]
  );
  run.same(
    "repères : sans place connue, la pose part du milieu de la main",
    { x: 0, y: 0 },
    positionOf(eventCues([{ type: "placed", slot: "apex", marble: "final_pocket" }], {}, settings, motion)[0].path[0], places)
  );
  // Remplacement, dans l'ordre du journal : l'éjection, le retrait, la défausse,
  // la pose, le tic. La bille posée est tirée (deux fois plus vite ici) ; la
  // collision attend son arrivée, à la force du choc (une grosse, poids 2, sur une
  // petite, poids 1 : 2) ; la délogée part 30 ms après, lancée deux fois plus vite.
  // L'écart entre les deux sons de la collision se programme à la lecture.
  const knockedOut = { slot: "apex", marble: "awaken_draw" };
  const replacement = [
    { type: "knockout", ...knockedOut },
    { type: "removed", ...knockedOut, cause: "replacement" },
    { type: "discarded", ...knockedOut, cause: "replacement" },
    { type: "placed", slot: "apex", marble: "final_pocket" },
    { type: "hit", slot: "apex", marble: "final_pocket" },
  ];
  const collisionMotion = {
    ...motion,
    collision: { flamMs: 10, weights: { [SMALL]: 1, [LARGE]: 2 }, weightExponent: 1 },
    types: { final_pocket: { size: LARGE }, awaken_draw: { size: SMALL } },
  };
  run.same(
    "repères : un remplacement, la bille tirée, la collision des deux billes, puis la délogée lancée à la défausse",
    [
      "roll final_pocket hand>apex @0+500",
      "collision final_pocket>awaken_draw apex @500 x2",
      "roll awaken_draw apex>discard @530+500",
      "drop awaken_draw discard @1030",
    ],
    rolled(eventCues(replacement, {}, settings, collisionMotion))
  );
  run.same(
    "repères : la bille qui frappe est tirée, celle qui se pose ne l'est pas",
    ["strike", "place"],
    [
      eventCues(replacement, {}, settings, collisionMotion)[0].style,
      eventCues([{ type: "placed", slot: "apex", marble: "final_pocket" }], {}, settings, collisionMotion)[0].style,
    ]
  );
  run(
    "repères : la délogée part à la défausse en style knocked, l'usée en style out",
    "knocked out",
    [
      eventCues(replacement, {}, settings, collisionMotion).find((cue) => cue.marble === "awaken_draw" && cue.sound === "roll").style,
      eventCues([{ type: "discarded", marble: "awaken_draw", from: "triangle", slot: "apex", cause: "wear" }], {}, settings, collisionMotion)[0].style,
    ].join(" ")
  );
  // Échange : la bille choisie (en `a` avant l'échange, en `b` après), puis l'autre.
  const swapped = { type: "swapped", a: "leftBase", b: "rightBase" };
  run.same(
    "repères : un échange, la bille choisie roule puis l'autre, chacune tombe à l'arrivée",
    ["roll one_shot leftBase>rightBase @0+800", "drop one_shot rightBase @800", "roll awaken_draw rightBase>leftBase @150+800", "drop awaken_draw leftBase @950"],
    rolled(
      eventCues([swapped], { triangleAfter: { leftBase: { marble: "awaken_draw", wear: 0 }, rightBase: { marble: "one_shot", wear: 1 }, apex: null } }, settings, motion)
    )
  );
  run.same(
    "repères : un déplacement vers un vide, une seule bille roule, aussitôt",
    ["roll one_shot leftBase>rightBase @0+800", "drop one_shot rightBase @800"],
    rolled(eventCues([swapped], { triangleAfter: { leftBase: null, rightBase: { marble: "one_shot", wear: 0 }, apex: null } }, settings, motion))
  );
  run.same(
    "repères : les billes usées roulent à la défausse l'une après l'autre",
    ["roll aging_flick apex>discard @0+1000", "drop aging_flick discard @1000", "roll all_rounder apex>discard @200+1000", "drop all_rounder discard @1200"],
    rolled(
      eventCues(
        ["aging_flick", "all_rounder"].flatMap((marble) => [
          { type: "removed", slot: "apex", marble, cause: "wear" },
          { type: "discarded", marble, from: "triangle", slot: "apex", cause: "wear" },
        ]),
        {},
        settings,
        motion
      )
    )
  );
  // Rotation : chaque bille roule vers l'emplacement suivant, toutes ensemble ; un
  // emplacement vide reste muet. Les chutes, plus discrètes, à l'arrivée.
  const rotation = (triangle, notches = 1) => ({ type: "rotation", triangle, notches });
  run.same(
    "repères : une rotation, les billes tournent ensemble, puis se calent",
    [
      "roll all_rounder rightBase>leftBase @0+700",
      "drop all_rounder leftBase @700 x0.5",
      "roll aging_flick leftBase>apex @0+700",
      "drop aging_flick apex @700 x0.5",
      "roll awaken_draw apex>rightBase @0+700",
      "drop awaken_draw rightBase @700 x0.5",
    ],
    rolled(
      eventCues(
        [rotation({ apex: { marble: "aging_flick", wear: 1 }, rightBase: { marble: "awaken_draw", wear: 1 }, leftBase: { marble: "all_rounder", wear: 1 } })],
        {},
        settings,
        motion
      )
    )
  );
  run.same(
    "repères : une rotation avec un seul emplacement occupé, une seule bille tourne",
    ["roll one_shot rightBase>leftBase @0+700", "drop one_shot leftBase @700 x0.5"],
    rolled(eventCues([rotation({ apex: null, rightBase: null, leftBase: { marble: "one_shot", wear: 0 } })], {}, settings, motion))
  );
  run.same(
    "repères : une rotation de deux crans, la bille passe par l'emplacement du milieu",
    ["roll one_shot leftBase>apex>rightBase @0+1400", "drop one_shot rightBase @1400 x0.5"],
    rolled(eventCues([rotation({ apex: null, rightBase: { marble: "one_shot", wear: 0 }, leftBase: null }, 2)], {}, settings, motion))
  );
  run.same("rotation : un cran, l'emplacement suivant", ["leftBase", "apex"], rotationPath("leftBase", 1));
  run.same("rotation : trois crans, le tour complet", ["apex", "rightBase", "leftBase", "apex"], rotationPath("apex", 3));
  run.same(
    "rotation : l'ordre de la vue est celui du cœur",
    ["apex", "rightBase", "leftBase"],
    ["leftBase", "apex", "rightBase"].map((slot) => rotationPath(slot, 1)[1])
  );
  run("rotation : plusieurs crans, une durée par cran", 2100, rollDurationMs([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 0 }], rolls.rotation));
  run("roulements : rotation sans durée de cran refusée", true, throws(() => validateRolls({ ...rolls, rotation: { endRatio: 0.5, gain: 0.6, dropGain: 0.5 } })));
  run("roulements : vitesse nulle refusée", true, throws(() => validateRolls({ ...rolls, out: { speed: 0, endRatio: 0.5 } })));
  run("roulements : style manquant refusé", true, throws(() => validateRolls({ ...rolls, swap: undefined })));
  run("roulements : réglages du jeu valides", false, throws(() => validateRolls(rolls)));

  // Le mouvement : une bille qui ralentit fait plus de chemin au début qu'à la fin.
  const from = { x: 0, y: 0 };
  const to = { x: 0, y: 1 };
  run("mouvement : durée, distance sur vitesse moyenne", 1250, rollDurationMs([from, to], { speed: 1, endRatio: 0.6 }));
  const slowing = { path: [from, to], durationMs: 1000, endRatio: 0.2 };
  run.same("mouvement : au départ, à la place de départ, à pleine vitesse", { position: from, speedRatio: 1, done: false }, rollAt(slowing, 0));
  const arrived = rollAt(slowing, 1000);
  run.same("mouvement : à l'arrivée, à la place d'arrivée, ralentie", { position: to, speedRatio: 0.2, done: true }, { ...arrived, speedRatio: Math.round(arrived.speedRatio * 100) / 100 });
  run("mouvement : à mi-temps, plus de la moitié du chemin", true, rollAt(slowing, 500).position.y > 0.5);
  run("mouvement : sans ralentir, à mi-temps, à mi-chemin", 0.5, rollAt({ ...slowing, endRatio: 1 }, 500).position.y);
  // Un chemin à plusieurs étapes : la bille passe par chacune sans s'arrêter.
  const turn = { path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], durationMs: 1000, endRatio: 1 };
  run("mouvement : longueur d'un chemin, étape par étape", 2, pathLength(turn.path));
  run.same("mouvement : à mi-temps, à l'étape du milieu", { x: 1, y: 0 }, rollAt(turn, 500).position);
  run.same("mouvement : aux trois quarts, sur la seconde étape", { x: 1, y: 0.5 }, rollAt(turn, 750).position);
  run.same("mouvement : à l'arrivée, au bout du chemin", { x: 1, y: 1 }, rollAt(turn, 1000).position);
  run.same("mouvement : enveloppe, fondu d'entrée, plein, fondu de sortie", [0, 0.5, 1, 0.5, 0], [0, 50, 500, 950, 1000].map((ms) => rollEnvelope(ms, 1000, 100)));

  // Le rendu d'une bille qui roule : il suit la position (profondeur) et la vitesse
  // (volume, vitesse de lecture).
  const depthOf = { farGainDb: -6, nearLowpassHz: 20000, farLowpassHz: 7000, nearReverbSend: 0.05, farReverbSend: 0.35, reverb: { durationSec: 1, decay: 3, wet: 0.5 } };
  const render = (ms) => rollRendering(slowing, ms, 1, rolls, depthOf);
  run("rendu du roulement : muet au tout départ, le fondu d'entrée", 0, render(0).volume);
  run("rendu du roulement : vitesse de lecture d'origine au départ", 1, render(0).rate);
  run("rendu du roulement : passe-bas toujours présent, ouvert au plus près", 20000, render(0).lowpassHz);
  run("rendu du roulement : plus grave en ralentissant", true, render(900).rate < render(100).rate && render(900).rate > 0.5);
  run("rendu du roulement : plus loin, plus réverbéré", true, render(900).reverbSend > render(100).reverbSend);
  run("rendu du roulement : plus lente, plus douce", true, render(800).volume < render(200).volume);
  run("rendu du roulement : le gain du style s'applique", 0.6, Math.round((rollRendering({ ...slowing, gain: 0.6 }, 500, 1, rolls, depthOf).volume / render(500).volume) * 100) / 100);
  run.same(
    "repères : une phase, la balise de la bille active, à son emplacement",
    [{ atMs: 0, sound: "beacon", marble: "aging_flick", place: slotPlace("apex") }],
    eventCues([{ type: "phase", slot: "apex", marble: "aging_flick" }], {}, settings, FIXTURE_TABLE)
  );

  // Les sons d'usure : à l'emplacement de la bille touchée, seulement quand l'usure
  // change ou que la Fêlure retire la bille ; plusieurs, l'un après l'autre ; la
  // bille retirée par une Fêlure part après le son de sa fêlure.
  // Un évènement d'usure tel que le core l'émet : une Fêlure qui amène la bille à son
  // maximum la retire (`retires`).
  const wearEvent = (type, slot, marble, applied, wear, maxWear = 3) => ({ type, slot, marble, amount: 1, applied, wear, maxWear, retires: type === "cracked" && wear >= maxWear });
  run.same(
    "usure : le Polissage, à l'emplacement de la bille polie",
    [{ atMs: 0, sound: "polish", marble: "aging_flick", place: slotPlace("leftBase") }],
    eventCues([wearEvent("polished", "leftBase", "aging_flick", 1, 0)], {}, settings, FIXTURE_TABLE)
  );
  run.same("usure : un Polissage sans effet reste muet", [], eventCues([wearEvent("polished", "leftBase", "aging_flick", 0, 0)], {}, settings, FIXTURE_TABLE));
  run.same(
    "usure : la Fêlure, à l'emplacement de la bille fêlée",
    [{ atMs: 0, sound: "crack", marble: "one_shot", place: slotPlace("apex") }],
    eventCues([wearEvent("cracked", "apex", "one_shot", 1, 1)], {}, settings, FIXTURE_TABLE)
  );
  run.same(
    "usure : plusieurs sons d'un geste, l'un après l'autre",
    ["polish@0", "crack@120"],
    eventCues([wearEvent("polished", "leftBase", "aging_flick", 1, 0), wearEvent("cracked", "apex", "one_shot", 1, 1)], {}, settings, FIXTURE_TABLE).map((cue) => `${cue.sound}@${cue.atMs}`)
  );
  const crackedOut = eventCues(
    [wearEvent("cracked", "apex", "one_shot", 1, 3), { type: "removed", slot: "apex", marble: "one_shot", cause: "wear" }, { type: "discarded", from: "triangle", slot: "apex", marble: "one_shot", cause: "wear" }],
    {},
    settings,
    FIXTURE_TABLE
  );
  run.same("usure : la bille retirée par la Fêlure part après sa fêlure", ["crack@0", "roll@150", "drop"], crackedOut.map((cue) => (cue.sound === "drop" ? cue.sound : `${cue.sound}@${cue.atMs}`)));
  // Les sons de DÉCLENCHEUR, seulement chez une bille qui a l'effet du mot-clé :
  // la Chiquenaude à la place de la bille dans la main, l'Éveil après la balise de
  // sa pioche, à la même place, la balise suivante l'attend ; le Final à
  // l'emplacement quitté, la Trouvaille à son emplacement, l'un après l'autre.
  const fromHand = handPlace(1, 3);
  run.same(
    "Chiquenaude : son son à la place de la bille dans la main, avant son roulement",
    ["flick@0", "roll@0"],
    eventCues([{ type: "flick", slot: "apex", marble: "aging_flick", turnsInHand: 0 }, { type: "placed", slot: "apex", marble: "aging_flick" }], { placeFrom: fromHand }, settings, FIXTURE_TABLE).slice(0, 2).map((cue) => `${cue.sound}@${cue.atMs}`)
  );
  run.same("Chiquenaude : à la place de la bille dans la main", fromHand, eventCues([{ type: "flick", slot: "apex", marble: "aging_flick", turnsInHand: 0 }], { placeFrom: fromHand }, settings, FIXTURE_TABLE)[0].place);
  run.same("Chiquenaude : muette chez une bille qui n'en a pas", [], eventCues([{ type: "flick", slot: "apex", marble: "hit_pocket", turnsInHand: 0 }], { placeFrom: fromHand }, settings, FIXTURE_TABLE));
  const waking = eventCues(
    [{ type: "draw", marble: "awaken_draw", cause: "turn" }, { type: "awaken", marble: "awaken_draw" }, { type: "draw", marble: "hit_pocket", cause: "turn" }, { type: "awaken", marble: "hit_pocket" }],
    { handAfter: ["awaken_draw", "hit_pocket"] },
    settings,
    FIXTURE_TABLE
  );
  run.same(
    "Éveil : après la balise de sa pioche, la pause réglée ; la balise suivante l'attend ; aucun chez une bille sans Éveil",
    ["beacon@0", `awaken@${settings.awakenAfterDrawMs}`, `beacon@${settings.awakenAfterDrawMs + settings.drawSoundIntervalMs}`],
    waking.map((cue) => `${cue.sound}@${cue.atMs}`)
  );
  run.same("Éveil : à la place de la bille dans la main", [handPlace(0, 2), handPlace(0, 2)], waking.slice(0, 2).map((cue) => cue.place));
  run.same(
    "Final et Trouvaille : à leur emplacement, l'un après l'autre",
    [`final@0@apex`, `windfall@${settings.triggerSoundIntervalMs}@leftBase`],
    eventCues([{ type: "final", slot: "apex", marble: "fragile" }, { type: "windfall", slot: "leftBase", marble: "all_rounder" }], {}, settings, FIXTURE_TABLE).map((cue) => `${cue.sound}@${cue.atMs}@${cue.place.slot}`)
  );
  run.same("Final : muet chez une bille qui n'en a pas", [], eventCues([{ type: "final", slot: "apex", marble: "aging_flick" }], {}, settings, FIXTURE_TABLE));
  // Le début du tour du joueur : après les balises de pioche, au centre.
  const turnCue = eventCues([{ type: "draw", marble: "aging_flick", cause: "turn" }], { handAfter: ["aging_flick"], playerTurn: true }, settings, FIXTURE_TABLE).at(-1);
  run.same("player_turn : après la balise de pioche, au centre", { atMs: settings.drawSoundIntervalMs, sound: "playerTurn" }, turnCue);

  // Une bille du pot qui agit (son effet à chaque résolution, une réaction) : sa
  // balise, au pot ; son entrée au pot, non (son roulement la dit).
  const potEffect = (trigger) => ({ type: "effect", trigger, slot: null, marble: "aging_flick", speedDelta: 1, massDelta: 0, draw: 0, operations: [], given: [], lost: [], speed: 1, mass: 1, potIndex: 0 });
  run.same(
    "pot : sa balise quand une bille du pot agit, à la résolution et en réaction",
    [
      [{ atMs: 0, sound: "beacon", marble: "aging_flick", place: potPlace() }],
      [{ atMs: 0, sound: "beacon", marble: "aging_flick", place: potPlace() }],
    ],
    ["pocketResolution", "pocketReaction"].map((trigger) => eventCues([potEffect(trigger)], {}, settings, FIXTURE_TABLE))
  );
  run.same("pot : pas de balise à l'entrée au pot", [], eventCues([potEffect("pocketEntry")], {}, settings, FIXTURE_TABLE));
  run.same("effet : un effet de phase n'ajoute rien (la phase a sa balise)", [], eventCues([{ ...potEffect("phase"), slot: "apex" }], {}, settings, FIXTURE_TABLE));

  // Les déplacements par effet : vers la main (Rebond, Ramasser), de la main à la
  // défausse (Défausser) ; du sac, muet.
  run.same(
    "déplacement : une bille renvoyée en main roule de son emplacement à sa place dans la main",
    ["roll", "drop"],
    eventCues([{ type: "returned", marble: "aging_flick", from: "triangle", slot: "apex", handIndex: 1, cause: "bounce", movedBy: "bounce" }], { handSize: 2 }, settings, FIXTURE_TABLE).map((cue) => cue.sound)
  );
  run.same(
    "déplacement : elle tombe à sa place dans la main",
    handPlace(1, 2),
    eventCues([{ type: "returned", marble: "aging_flick", from: "discard", index: 0, handIndex: 1, cause: "retrieve", movedBy: "retrieve" }], { handSize: 2 }, settings, FIXTURE_TABLE).at(-1).place
  );
  run.same(
    "déplacement : défaussée de la main, elle roule à la défausse",
    discardPlace(),
    eventCues([{ type: "discarded", marble: "aging_flick", from: "hand", index: 0, cause: "discard", movedBy: "discard" }], { handSize: 1 }, settings, FIXTURE_TABLE).at(-1).place
  );
  run.same("déplacement : défaussée du sac, muette", [], eventCues([{ type: "discarded", marble: "aging_flick", from: "bag", cause: "discard", movedBy: "discard" }], {}, settings, FIXTURE_TABLE));
  run.same(
    "usure : une Fêlure qui retire une bille déjà au maximum se fait entendre",
    ["crack"],
    eventCues([wearEvent("cracked", "apex", "one_shot", 0, 3)], {}, settings, FIXTURE_TABLE).map((cue) => cue.sound)
  );

  // Stéréo : chaque bille piochée s'entend à sa place dans la main, de gauche à
  // droite ; les places rendent leur panoramique.
  run.same(
    "repères : les billes piochées, les dernières de la main, dans l'ordre",
    [handPlace(3, 5), handPlace(4, 5)],
    eventCues(draws.slice(0, 2), { handAfter: ["final_pocket", "awaken_draw", "all_rounder", "aging_flick", "hit_polish"] }, settings, FIXTURE_TABLE).map((cue) => cue.place)
  );
  run("repères : sans main connue, la pioche au centre", undefined, eventCues(draws.slice(0, 1), {}, settings, FIXTURE_TABLE)[0].place);
  const round = (value) => Math.round(value * 100) / 100;
  run.same(
    "stéréo : la main de gauche à droite",
    [-0.6, -0.3, 0, 0.3, 0.6],
    [0, 1, 2, 3, 4].map((index) => round(positionOf(handPlace(index, 5), places).x))
  );
  run("stéréo : une bille seule au milieu", 0, positionOf(handPlace(0, 1), places).x);
  run.same("stéréo : les emplacements", [-0.4, 0.4, 0], ["leftBase", "rightBase", "apex"].map((slot) => positionOf(slotPlace(slot), places).x));
  run("stéréo : panoramique hors bornes refusé", true, throws(() => validateSoundPlaces({ ...places, apex: { x: 1.5, y: 1 } })));
  run("stéréo : place manquante refusée", true, throws(() => validateSoundPlaces({ hand: places.hand, leftBase: places.leftBase })));
  run("stéréo : défausse manquante refusée", true, throws(() => validateSoundPlaces({ ...places, discard: undefined })));
  run("stéréo : places complètes acceptées", false, throws(() => validateSoundPlaces(places)));
  run("stéréo : pot manquant refusé", true, throws(() => validateSoundPlaces({ ...places, pot: undefined })));
  run("stéréo : le pot, en face de la défausse", -places.discard.x, positionOf(potPlace(), places).x);
  run.same("stéréo : la défausse a sa place", { x: 0.8, y: 1 }, positionOf(discardPlace(), places));
  run("profondeur : profondeur hors bornes refusée", true, throws(() => validateSoundPlaces({ ...places, apex: { x: 0, y: 2 } })));

  // Profondeur : volume, passe-bas et réverbération suivent y, de la main à la pointe.
  const depth = { farGainDb: -6, nearLowpassHz: 20000, farLowpassHz: 7000, nearReverbSend: 0.05, farReverbSend: 0.35, reverb: { durationSec: 1, decay: 3, wet: 0.5 } };
  const at = (place) => renderAt(place, places, depth);
  run.same("profondeur : sans place, centre, plein volume, sec", { pan: 0, gain: 1, lowpassHz: undefined, reverbSend: 0 }, at(undefined));
  run.same("profondeur : la main, au plus près, sans filtre", { pan: -0.6, gain: 1, lowpassHz: undefined, reverbSend: 0.05 }, at(handPlace(0, 5)));
  run("profondeur : la pointe, au volume le plus bas", -6, round(20 * Math.log10(at(slotPlace("apex")).gain)));
  run("profondeur : la pointe, passe-bas au plus bas", 7000, Math.round(at(slotPlace("apex")).lowpassHz));
  run("profondeur : la pointe, le plus de réverbération", 0.35, round(at(slotPlace("apex")).reverbSend));
  run("profondeur : les bases à mi-chemin, en décibels", -3, round(20 * Math.log10(at(slotPlace("leftBase")).gain)));
  run("profondeur : passe-bas logarithmique à mi-chemin", Math.round(Math.sqrt(20000 * 7000)), Math.round(at(slotPlace("rightBase")).lowpassHz));
  run.same(
    "profondeur : de plus en plus loin, de plus en plus bas et réverbéré",
    [true, true],
    [
      at(handPlace(0, 5)).gain > at(slotPlace("leftBase")).gain && at(slotPlace("leftBase")).gain > at(slotPlace("apex")).gain,
      at(handPlace(0, 5)).reverbSend < at(slotPlace("leftBase")).reverbSend && at(slotPlace("leftBase")).reverbSend < at(slotPlace("apex")).reverbSend,
    ]
  );
  run("profondeur : gain positif refusé", true, throws(() => validateSoundDepth({ ...depth, farGainDb: 3 })));
  run("profondeur : envoi hors bornes refusé", true, throws(() => validateSoundDepth({ ...depth, farReverbSend: 2 })));
  run("profondeur : réverbération sans durée refusée", true, throws(() => validateSoundDepth({ ...depth, reverb: { decay: 3, wet: 0.5 } })));
  run.same(
    "démonstration : six places, de la main à la pointe, espacées",
    ["hand@0", "hand@700", "hand@1400", "leftBase@2100", "rightBase@2800", "apex@3500"],
    placesDemoCues("aging_flick", 5).map((cue) => `${cue.place.slot ?? cue.place.kind}@${cue.atMs}`)
  );
  run.same("repères : une phase sur un emplacement vide reste muette", [], eventCues([{ type: "phaseSkipped", slot: "apex" }], {}, settings, FIXTURE_TABLE));

  // La file : les immédiats aussitôt, les autres à leur échéance, dans l'ordre.
  let queue = enqueueCues(EMPTY_SOUND_QUEUE, eventCues(draws, { shuffleFirst: true }, settings, FIXTURE_TABLE));
  const step = (deltaMs) => {
    const result = advanceSoundQueue(queue, deltaMs);
    queue = result.queue;
    return result.due.map((cue) => cue.marble ?? cue.sound);
  };
  run.same("file : l'immédiat part aussitôt", ["shuffle"], step(0));
  run.same("file : rien avant l'échéance", [], step(899));
  run.same("file : la première balise à son échéance", ["aging_flick"], step(1));
  run.same("file : une longue absence rend tout ce qui est dû, dans l'ordre", ["hit_polish", "one_shot"], step(5000));
  run("file : vide une fois tout joué", 0, queue.length);

  // La main au moment d'une étape : ce que chaque évènement y fait entrer ou sortir.
  run(
    "main d'une étape : pioche +1, pose et mise en poche depuis la main −1, ailleurs rien",
    0,
    handSizeChange([
      { type: "draw", marble: "aging_flick", cause: "effect" },
      { type: "draw", marble: "hit_polish", cause: "effect" },
      { type: "placed", slot: "apex", marble: "final_pocket" },
      { type: "pocketed", marble: "awaken_draw", from: "hand", index: 0 },
      { type: "pocketed", marble: "aging_flick", from: "triangle", slot: "apex" },
    ])
  );
  // Une pioche dite à une étape où la main compte 2 billes, même si la main finale en
  // compte 4 : sa balise est à la dernière place d'une main de 2.
  const midDraw = eventCues([{ type: "draw", marble: "aging_flick", cause: "effect" }], { handAfter: [{}, {}, {}, {}], handSize: 2 }, undefined, FIXTURE_TABLE);
  run.same("pioche d'une étape : placée dans la main de ce moment", handPlace(1, 2), midDraw.find((cue) => cue.sound === "beacon").place);
}

export default function checkMarblesView(run) {
  const sample = sampleEvents();
  run.section("journal et sons", (r) => checkJournalCoverage(r, sample));
  run.section("sons", checkSounds);
  run.section("fiches", checkCards);
  run.section("sac et défausse", checkBagOrder);
  run.section("menu des valeurs", checkTallyMenu);
  run.section("mots-clés", checkKeywords);
  run.section("touche P", checkPotStatus);
  run.section("choix", checkChoiceInterface);
  run.section("aide", checkHelpMenu);
  run.section("étapes", (r) => checkSteps(r, sample));
  run.section("chaque langue", (r) => checkLocales(r, sample));
  run.section("ce qui se dit", (r) => checkSaid(r, sample));
  run.section("confirmation et curseur", checkConfirmationAndCursor);
  run.section("témoins", checkWitnesses);
  run.section("statuts", checkStatusNarration);
  run.section("objectif et règles", checkGoalNarration);
}

// LES STATUTS en mots (marbles/view/narration/statuses.js, journal.js, forecast.js),
// par les clés : leur étiquette, ce qui leur reste, leur fiche et leur origine, la
// clause qui les donne, le journal (renforcé, déjà là, une charge, la fin, une
// réaction), la question d'un choix ouvert par un statut, la confirmation et R.
function checkStatusNarration(run) {
  const instance = statusInstance;
  // Ce qui reste, selon la sorte de durée.
  run.same(
    "reste : ce tour, 3 tours, en attente, en attente sur 2 tours, toute la partie, 1 charge",
    [
      "statuses.duration.turn",
      "statuses.duration.turns{count: 3}",
      "statuses.remaining.pending",
      "statuses.remaining.pending_turns{count: 2}",
      "statuses.duration.game",
      "statuses.duration.charges{count: 1}",
    ],
    [
      remainingText(instance("x"), "turns", t),
      remainingText(instance("x", { remaining: 3 }), "turns", t),
      remainingText(instance("x", { pending: true }), "nextTurn", t),
      remainingText(instance("x", { pending: true, remaining: 2 }), "nextTurn", t),
      remainingText(instance("x", { remaining: null }), "game", t),
      remainingText(instance("x", { remaining: 1 }), "charges", t),
    ]
  );
  // L'intensité : seulement en cumul d'intensité, au-delà de 1.
  run.same(
    "étiquette : l'intensité dite en cumul d'intensité au-delà de 1, jamais sinon",
    [
      "statuses.label_intensity{status: status.loss_cushion.name, duration: statuses.duration.turns{count: 3}, intensity: 2}",
      "statuses.label{status: status.loss_cushion.name, duration: statuses.duration.turns{count: 3}}",
      "statuses.label{status: status.gain_charge.name, duration: statuses.duration.charges{count: 1}}",
    ],
    [
      instanceLabel(instance("loss_cushion", { intensity: 2, remaining: 3 }), rules, t),
      instanceLabel(instance("loss_cushion", { remaining: 3 }), rules, t),
      instanceLabel(instance("gain_charge", { intensity: 2 }), rules, t),
    ]
  );
  // La fiche : l'effet à son intensité, ce qui reste, l'origine.
  const card = statusCard(instance("loss_cushion", { intensity: 2, remaining: 3, origin: { trigger: "hit", slot: "apex", marble: "aging_flick" } }), "main", rules, t);
  run.same(
    "fiche : effet, reste, origine, au-dessous",
    [
      "statuses.card.effect{effect: effect.combined{parts: [statuses.behavior.add{point: statuses.point.speedLoss, value: −2}]}}",
      "statuses.card.remaining{duration: statuses.duration.turns{count: 3}}",
      "statuses.card.origin{origin: statuses.origin.hit{marble: <aging_flick>}}",
    ],
    card.below
  );
  run(
    "fiche : un multiplicateur à l'intensité 2, au carré",
    "statuses.card.effect{effect: effect.combined{parts: [statuses.behavior.multiply{point: statuses.point.speedGain, value: 4}]}}",
    statusCard(instance("gain_charge", { intensity: 2 }), "main", rules, t).below[0]
  );
  run(
    "fiche : une réaction, que l'intensité ne module pas",
    "statuses.card.effect{effect: effect.combined{parts: [statuses.behavior.reaction{occurrence: tally.flick.each, effect: effect.combined{parts: [effect.combined{parts: [effect.speed_up{amount: 2}]}]}}]}}",
    statusCard(instance("flick_react", { intensity: 3 }), "main", rules, t).below[0]
  );
  // Un modificateur filtré sur sa source, une fraction : « gains de Vitesse des calots ÷2 ».
  const filtered = {
    statuses: {
      sourced: {
        stacking: "unique",
        duration: { kind: "game" },
        behaviors: [
          { type: "modifier", point: "speedGain", operation: "multiply", value: 0.5, filters: [{ type: "size", size: LARGE }] },
          { type: "modifier", point: "massGain", operation: "multiply", value: 1.5 },
        ],
      },
    },
  };
  run.same(
    "fiche d'un statut : un filtre de source, une division, une fraction",
    "statuses.card.effect{effect: effect.combined{parts: [statuses.behavior.divide{point: statuses.source.size{size: <size.large.name>, point: statuses.point.speedGain}, value: 2} | statuses.behavior.multiply{point: statuses.point.massGain, value: 1number.decimal_separator5}]}}",
    statusCard(instance("sourced"), "main", filtered, t).below[0]
  );
  // Un refus de verrou nomme son statut, ou sa règle ; un autre refus, rien de plus.
  const locked = (statuses) => ({ ...marblesPlayState(rules, {}), statuses });
  run.same(
    "refus : un verrou nomme le statut, ou la règle",
    ["error.swapLocked{source: lock.source.status{status: X}}", "error.swapLocked{source: lock.source.rule{status: X}}", "error.mustDraw"].map((text) => text.replaceAll("X", t("marbles.status.no_swap.name"))),
    [
      refusalText("swapLocked", locked([instance("no_swap", { remaining: 1 })]), rules, t),
      refusalText("swapLocked", locked([ruleInstance("no_swap")]), rules, t),
      refusalText("mustDraw", locked([]), rules, t),
    ]
  );
  run.same(
    "fiche d'un statut : les verrous",
    ["statuses.behavior.lock.swap", "statuses.behavior.lock.trigger{trigger: keyword.flick.name}", "statuses.behavior.lock.pot"].map((part) => `statuses.card.effect{effect: effect.combined{parts: [${part}]}}`),
    ["no_swap", "no_flick", "no_pot"].map((status) => statusCard(instance(status), "main", rules, t).below[0])
  );
  run.same(
    "origine : une phase, une entrée au pot, une réaction du pot, un statut, aucune",
    [
      "statuses.origin.phase{slot: slot.leftBase, marble: <aging_flick>}",
      "statuses.origin.pot_entry{marble: <fragile>}",
      "statuses.origin.pot{marble: <all_rounder>}",
      "statuses.origin.status{status: status.flick_react.name}",
      "statuses.origin.none",
    ],
    [
      originText({ trigger: "phase", slot: "leftBase", marble: "aging_flick" }, t),
      originText({ trigger: "pocketEntry", slot: null, marble: "fragile" }, t),
      originText({ trigger: "pocketReaction", slot: null, marble: "all_rounder" }, t),
      originText({ trigger: "statusReaction", slot: null, marble: null, status: "flick_react" }, t),
      originText(null, t),
    ]
  );

  // Les quantités : sans virgule, à l'intensité ; un multiplicateur nul.
  run.same(
    "fiche : les quantités, pioche du tour, pioche par effet, Polissage, Fêlure, usure de phase",
    [
      "statuses.card.effect{effect: effect.combined{parts: [statuses.behavior.add_quantity{point: statuses.point.turnDraw, value: +2}]}}",
      "statuses.card.effect{effect: effect.combined{parts: [statuses.behavior.add_quantity{point: statuses.point.effectDraw, value: +1}]}}",
      "statuses.card.effect{effect: effect.combined{parts: [statuses.behavior.add_quantity{point: statuses.point.polish, value: −1}]}}",
      "statuses.card.effect{effect: effect.combined{parts: [statuses.behavior.add_quantity{point: statuses.point.crack, value: +1}]}}",
      "statuses.card.effect{effect: effect.combined{parts: [statuses.behavior.multiply{point: statuses.point.phaseWear, value: 0}]}}",
    ],
    [
      instance("turn_draw_more", { intensity: 2 }),
      instance("effect_draw_charge"),
      instance("polish_less", { remaining: null }),
      instance("crack_more", { remaining: 3 }),
      instance("wear_none"),
    ].map((one) => statusCard(one, "main", rules, t).below[0])
  );
  // La confirmation et R : les quantités finales, sans rien de plus.
  const polishing = fabricatedRules({ polisher: { flick: [polish(1, "apex")] }, target: { base: [speed(1)], apex: [speed(1)] } });
  const polishState = { ...marblesPlayState(polishing, { hand: inHand(["polisher"]), triangle: { leftBase: null, rightBase: null, apex: { marble: "target", wear: 2 } } }), statuses: [instance("polish_more", { remaining: null })] };
  const flickLine = placementLines(polishState, 0, "leftBase", polishing, t).find(({ key }) => key === "marbles.place.flick");
  run("confirmation : la Chiquenaude dit Polissage 2", true, flickLine.params.effect.includes("effect.polish{amount: 2}"));
  const drawing = fabricatedRules({ drawer: { base: [draw(1)], apex: [draw(1)] } });
  const overviewDraw = describeOverview({ ...marblesPlayState(drawing, { bag: ["drawer", "drawer"], triangle: { leftBase: null, rightBase: { marble: "drawer", wear: 0 }, apex: null } }), statuses: [instance("effect_draw_charge")] }, drawing, t);
  run("R : la phase dit Pioche 2", true, overviewDraw.includes("effect.draw{amount: 2}"));

  // La clause sur une fiche : le nom, l'intensité s'il le faut, la durée de la clause.
  const giving = fabricatedRules({ giver: { flick: [{ action: "applyStatus", status: "loss_cushion", amount: 2, duration: 1 }, { action: "applyStatus", status: "throws_next", amount: 1 }] } });
  run(
    "fiche d'une bille : la clause dit le statut, son intensité et sa durée",
    "effect.combined{parts: [effect.apply_status_intensity{status: status.loss_cushion.name, duration: statuses.duration.turns{count: 1}, intensity: 2} | effect.apply_status{status: status.throws_next.name, duration: statuses.duration.nextTurn}]}",
    describePrinted(giving.types.giver.flick, null, t, giving.statuses)
  );

  // Le journal : reçu muet (l'effet le dit), renforcé, déjà là, une charge, la fin,
  // une réaction dite par son nom.
  const played = giving.reduce({ ...marblesPlayState(giving, { hand: inHand(["giver"]) }), statuses: [instance("loss_cushion", { remaining: 3 })] }, { type: "place", handIndex: 0, slot: "apex" });
  const texts = buildSteps(played.events, t).map((step) => step.text);
  run(
    "journal : renforcé, avec son étiquette",
    true,
    texts.includes("event.status_strengthened{status: statuses.label_intensity{status: status.loss_cushion.name, duration: statuses.duration.turns{count: 3}, intensity: 3}}")
  );
  run.same(
    "journal : un statut reçu ne se dit pas à part, l'effet le dit",
    [],
    buildSteps([{ type: "statusGained", status: "loss_cushion", intensity: 1, remaining: 3, pending: false, kind: "turns", stacking: "intensity", by: { trigger: "flick", slot: "apex", marble: "giver" } }], t).flatMap((step) => step.messages)
  );
  run.same(
    "journal : déjà là, une charge, la fin",
    ["event.status_unchanged{status: status.flick_react.name}", "event.status_charge{status: status.gain_charge.name}", "event.status_expired{status: status.gain_charge.name}"],
    buildSteps(
      [
        { type: "statusUnchanged", status: "flick_react", by: { trigger: "flick", slot: "apex", marble: "aging_flick" } },
        { type: "statusCharge", status: "gain_charge", remaining: 0 },
        { type: "statusExpired", status: "gain_charge" },
      ],
      t
    ).map((step) => step.text)
  );
  const reacting = mustReduce(rules, { ...marblesPlayState(rules, { hand: inHand(["aging_flick"]) }), statuses: [instance("flick_react", { remaining: 2 })] }, { type: "place", handIndex: 0, slot: "apex" });
  run(
    "journal : une réaction, dite avec le nom du statut",
    true,
    buildSteps(reacting.events, t).some((step) => step.text.startsWith("event.effect_status{status: status.flick_react.name, effect: effect.combined{parts: [effect.speed_up{amount: 2}]}}"))
  );
  // La question d'un choix ouvert par la réaction d'un statut.
  const question = describeChoicePrompt(
    { action: "polish", amount: 1, zones: ["triangle"], pick: "marble", count: 1, mode: "required", chosen: [], remaining: 1, by: { trigger: "statusReaction", slot: null, marble: null, status: "flick_react" } },
    t
  );
  run("choix : ouvert par un statut, son nom en tête", true, question.startsWith("choice.by_status{status: status.flick_react.name, question:"));

  // La confirmation : la ligne des statuts dès que la partie en a, après celle du pot.
  const keys = (state) => placementLines(state, 0, "apex", rules, t).map(({ key }) => key);
  run("confirmation : sans statut, pas de ligne des statuts", false, keys(marblesPlayState(rules, { hand: inHand(["aging_flick"]) })).includes("marbles.place.statuses"));
  const lines = placementLines({ ...marblesPlayState(rules, { hand: inHand(["aging_flick"]) }), statuses: [instance("flick_react", { remaining: 2 })] }, 0, "apex", rules, t);
  run.same(
    "confirmation : avec un statut, sa réaction prévue, après le pot",
    ["marbles.place.pot", "marbles.place.statuses"],
    lines.slice(-2).map(({ key }) => key)
  );
  run("confirmation : la réaction de Ferveur prévue", "place.status_effect{status: status.flick_react.name, effect: effect.combined{parts: [effect.speed_up{amount: 2}]}}", lines.at(-1).params.reactions);
  // R : une réaction pendant la résolution, après le pot.
  const reactingRules = fabricatedRules({ phaseFlicker: { base: [{ action: "speed", amount: 1 }] } });
  const overview = describeOverview(
    { ...marblesPlayState(reactingRules, { triangle: { leftBase: null, rightBase: { marble: "phaseFlicker", wear: 0 }, apex: null } }), statuses: [instance("throw_react", { remaining: null })] },
    reactingRules,
    t
  );
  run("R : sans réaction pendant la résolution, aucune ligne de statut", false, overview.includes("effect_status"));
}

// La couverture : chaque évènement du journal (JOURNAL_EVENTS) a son point
// d'accroche sonore, et figure parmi les évènements d'exemple.
function checkJournalCoverage(run, { events }) {
  const journalTypes = Object.keys(JOURNAL_EVENTS).sort();
  run.same("sons : un point d'accroche par évènement du journal (JOURNAL_EVENTS)", journalTypes, Object.keys(MARBLE_EVENT_CUES).sort());
  // Les évènements d'exemple couvrent le journal : chaque type se dit (plus bas,
  // dans chaque langue) et se découpe en étapes.
  run.same("exemples : chaque évènement du journal (JOURNAL_EVENTS) y figure", journalTypes, [...new Set(events.map((event) => event.type))].sort());
}

// Le découpage en étapes du journal.
function checkSteps(run, { events }) {
  run("narration : évènement inconnu refusé", true, throws(() => buildSteps([{ type: "nope" }], (key) => key)));

  // Le découpage en étapes : tous les évènements, chacun une fois, dans l'ordre.
  run.same("étapes : aucun évènement perdu", events, buildSteps(events, (key) => key).flatMap((step) => step.events));
  // Un sac sans Éveil : les pioches se disent en une liste, et seulement elles.
  const turn = rules.createGame(4, { bag: ["aging_flick", "hit_polish", "final_pocket", "fragile", "hit_pocket", "size_count"] });
  const drawn = rules.reduce(turn, { type: "draw" });
  run.same(
    "étapes : la pioche, puis le début de tour",
    ["marbles.event.draw", "marbles.event.turn_started"],
    buildSteps(drawn.events, (key) => key).map((step) => step.text)
  );
}

// Chaque langue : chaque texte déclaré existe, et rien ne reste brut, dans les
// vrais textes (realT), les évènements prenant le nom d'une vraie bille.
function checkLocales(run, { events, state }) {
  const previousLocale = getLocale();
  try {
    for (const locale of Object.keys(LOCALE_TABLES)) {
      setLocale(locale);
      const missingErrors = MARBLE_ERRORS.filter((code) => !Object.hasOwn(LOCALE_TABLES[locale], `marbles.error.${code}`));
      run.same(`${locale} : chaque refus a son texte`, [], missingErrors);
      run(`${locale} : la fin de partie a son texte`, true, Object.hasOwn(LOCALE_TABLES[locale], "marbles.event.game_over"));
      const missingTriggerTexts = MARBLE_TRIGGERS.flatMap((trigger) => Object.values(trigger.texts)).filter((key) => !Object.hasOwn(LOCALE_TABLES[locale], key));
      run.same(`${locale} : chaque déclencheur a ses textes`, [], missingTriggerTexts);
      // Un gabarit qui dépend de la source (le nombre de billes, filtré ou non) : chaque
      // zone, sans filtre et avec chaque type de filtre.
      const sourceSamples = Object.keys(GAME_ZONES).flatMap((zone) => [undefined, ...Object.keys(TARGET_FILTERS)].map((filter) => ({ zone, ...(filter === undefined ? {} : { filters: [{ type: filter }] }) })));
      const sourceKeys = Object.values(AMOUNT_SOURCES).flatMap((source) => (typeof source.text === "function" ? sourceSamples.map(source.text) : [source.text]));
      const missingSourceTexts = [...new Set(sourceKeys)].filter((key) => !Object.hasOwn(LOCALE_TABLES[locale], key));
      run.same(`${locale} : chaque source de montant a son texte`, [], missingSourceTexts);
      const tallyKeys = [
        ...TALLY_COUNTERS.flatMap((counter) => [`marbles.tally.${counter.id}.name`, `marbles.tally.${counter.id}.unit`]),
        ...TALLY_CATEGORIES.map((category) => `marbles.tally.category.${category}`),
        "marbles.tally.scope.turn",
        "marbles.tally.scope.game",
      ];
      const missingTallyTexts = tallyKeys.filter((key) => !Object.hasOwn(LOCALE_TABLES[locale], key));
      run.same(`${locale} : chaque valeur de partie a ses textes`, [], missingTallyTexts);
      const missingVerbs = Object.entries(CLAUSE_ACTIONS)
        .filter(([, action]) => action.choice !== undefined)
        .map(([id]) => `marbles.choice.verb.${id}`)
        .filter((key) => !Object.hasOwn(LOCALE_TABLES[locale], key));
      run.same(`${locale} : chaque action au choix a le verbe de sa question`, [], missingVerbs);
      const missingEach = REACTION_KEYS.map((id) => `marbles.tally.${id}.each`).filter((key) => !Object.hasOwn(LOCALE_TABLES[locale], key));
      run.same(`${locale} : chaque occurrence écoutable a son « à chaque »`, [], missingEach);

      const dirtySteps = buildSteps(withRealNames(events), realT).map((step) => step.text).filter((text) => !isCleanText(text));
      run.same(`${locale} : chaque étape du journal se dit`, [], dirtySteps.slice(0, 3));

      const emptyTriangle = { leftBase: null, rightBase: null, apex: null };
      const lines = [
        describeTurn(state, true, rules, realT),
        describeTurn(state, false, rules, realT),
        describeBag(state, rules, realT),
        describeDiscard(state, realT),
        describeTurn({ ...state, speed: -3, mass: -1 }, true, rules, realT),
        stepsText(buildSteps([{ type: "impact", speed: -3, mass: -1, impact: 0, score: 0 }], realT)),
        describeHandFocus({ ...state, hand: inHand([]) }, 0, rules, realT),
        ...SLOTS.map((slot) => describeSlotFocus({ ...state, triangle: emptyTriangle }, slot, rules, realT)),
        ...SLOTS.map((slot) => describeSlotForPlacement({ ...state, triangle: emptyTriangle }, slot, rules, realT)),
        realT("marbles.zone.hand"),
        realT("marbles.zone.triangle"),
        realT("marbles.place.menu_title"),
        realT("marbles.pile.bag"),
        realT("marbles.pile.discard"),
        realT("marbles.pile.back"),
      ];
      run.same(`${locale} : chaque ligne du curseur se dit`, [], lines.filter((text) => !isCleanText(text)).slice(0, 3));

      run(`${locale} : aucun effet`, realT("marbles.effect.none"), describeEffect({}, realT));
      run(`${locale} : point final du nom de zone, pour la pause`, true, realT("marbles.zone.hand").endsWith(".") && realT("marbles.zone.triangle").endsWith("."));
    }
  } finally {
    setLocale(previousLocale);
  }
}

// Ce que le joueur entend, gabarits et valeurs (helpers.js/keyText).
function checkSaid(run, { events, state }) {
  {
    run("texte : effet positif", "effect.combined{parts: [effect.speed_up{amount: 4}]}", describeEffect({ speed: 4 }, t));
    run("texte : effet négatif, vrai signe moins collé au nombre", "effect.combined{parts: [effect.speed_down{amount: 3}]}", describeEffect({ speed: -3 }, t));
    run("texte : Masse négative", "effect.combined{parts: [effect.mass_down{amount: 2}]}", describeEffect({ mass: -2 }, t));
    // Défausser : chaque forme de cible, et la défausse prévue avec sa Chute.
    const discardText = (target) => describeEffect({ operations: [{ action: "discard", ...(target === undefined ? {} : { target }) }] }, t);
    run.same(
      "texte : Défausser, chaque cible",
      [
        "effect.combined{parts: [effect.discard_self]}",
        "effect.combined{parts: [effect.discard_slot{slot: slot.apex}]}",
        "effect.combined{parts: [effect.discard_hand]}",
        "effect.combined{parts: [effect.discard_choice{target: choice.noun.hand_marble{count: 1}}]}",
        "effect.combined{parts: [effect.discard_all{target: target.all}]}",
        "effect.combined{parts: [effect.discard_bag{count: 2}]}",
      ],
      [undefined, "apex", "firstInHand", { type: "choice", zones: ["hand"], pick: "marble", count: 1, mode: "required" }, { type: "all" }, { type: "bag", count: 2 }].map(discardText)
    );
    run(
      "texte : Défausser prévu, la bille défaussée et sa Chute, une bille du sac inconnue",
      "pocket.then{effect: effect.combined{parts: [effect.discard_bag{count: 2}]}, pockets: effect.combined{parts: [discard.discarded_effect{marble: <aging_flick>, effect: effect.combined{parts: [effect.speed_up{amount: 2}]}} | discard.discarded_unknown]}}",
      describeEffect(
        {
          operations: [{ action: "discard", target: { type: "bag", count: 2 } }],
          discards: [
            { marble: "aging_flick", drop: { marble: "aging_flick", speed: 2, mass: 0, draw: 0, operations: [], given: [] } },
            { marble: null, drop: null },
          ],
        },
        t
      )
    );
    run("texte : compteur négatif", "−3", formatCounter(-3));
    run("texte : compteur positif", "3", formatCounter(3));
    run(
      "texte : effet de phase négatif",
      "outcome.slot{slot: slot.apex, marble: <flick_strike>, effect: effect.combined{parts: [effect.speed_down{amount: 3}]}}",
      stepsText(buildSteps([{ type: "phase", slot: "apex", marble: "flick_strike" }, { type: "effect", trigger: "phase", slot: "apex", marble: "flick_strike", speedDelta: -3, massDelta: 0, given: [], speed: -3, mass: 1 }], t))
    );
    run("texte : deux effets", "effect.combined{parts: [effect.speed_up{amount: 1} | effect.mass_up{amount: 2}]}", describeEffect({ speed: 1, mass: 2 }, t));
    run("texte : effet donné", "effect.combined{parts: [effect.given{effect: effect.combined{parts: [effect.speed_up{amount: 4}]}, slot: slot.apex}]}", describeEffect({ speed: 0, mass: 0, given: [{ slot: "apex", marble: "hit_pocket", speed: 4, mass: 0 }] }, t));
    run(
      "texte : effet imprimé de tally_flick",
      "effect.combined{parts: [effect.conditional{effect: effect.given{effect: effect.combined{parts: [effect.speed_up{amount: 4}]}, slot: slot.apex}, condition: condition.printedStat{slot: slot.apex, effect: effect.combined{parts: [effect.speed_up{amount: 1}]}}}]}",
      describePrinted(FIXTURE_TYPES.tally_flick.baseVariant.leftBase, cardSituation("tally_flick"), t)
    );
    run("texte : Impact", "event.impact{impact: 6, score: 14}", stepsText(buildSteps([{ type: "impact", speed: 3, mass: 2, impact: 6, score: 14 }], t)));

    // Annonces principales : courtes, le détail est dans la fiche.
    const holding = { ...state, hand: inHand(["aging_flick", "split_base", "hit_pocket"]) };
    run("texte : bille en main", "list.line{name: <aging_flick>, size: size.medium.name, families: [family.classics.name], rarity: rarity.common.name, maxWear: 3}. menu.position{index: 1, total: 3}", describeHandFocus(holding, 0, rules, t));
    run("texte : usure maximale propre", "list.line{name: <one_shot>, size: size.large.name, families: [family.classics.name], rarity: rarity.common.name, maxWear: 1}. menu.position{index: 2, total: 5}", describeMarbleInList("one_shot", 1, 5, rules, t));

    const lensed = {
      ...state,
      stage: "play",
      turn: 2,
      speed: 0,
      mass: 1,
      hand: inHand(["aging_flick", "final_pocket", "hit_polish"]),
      throwsUsed: 1,
      triangle: { leftBase: { marble: "tally_flick", wear: 0 }, rightBase: null, apex: { marble: "hit_pocket", wear: 1 } },
    };
    run("texte : bille active", "slot_line.occupied{slot: slot.apex, name: <hit_pocket>, size: size.large.name, wear: 1, maxWear: 3}", describeSlotFocus(lensed, "apex", rules, t));
    run("texte : emplacement vide", "slot_line.empty{slot: slot.rightBase}", describeSlotFocus(lensed, "rightBase", rules, t));
    // Pendant une pose, la prévision reste.
    run("texte : pose, emplacement occupé", "slot_line.placing_occupied{slot: slot.apex, name: <hit_pocket>, effect: effect.combined{parts: [effect.speed_up{amount: 10}]}}", describeSlotForPlacement(lensed, "apex", rules, t));
    run("texte : pose, emplacement vide", "slot_line.placing_empty{slot: slot.rightBase}", describeSlotForPlacement(lensed, "rightBase", rules, t));
    // Une bille que la prévision retire avant sa phase (base_pocket empoche la pointe) :
    // dite retirée, sans planter.
    const emptied = { ...state, triangle: { leftBase: { marble: "base_pocket", wear: 0 }, rightBase: null, apex: { marble: "aging_flick", wear: 0 } } };
    run("texte : pose, bille retirée avant sa phase", "outcome.removed{slot: slot.apex, marble: <aging_flick>}", describeSlotForPlacement(emptied, "apex", rules, t));

    // S et D : les nombres et leurs accords.
    const counts = (bag, discard, drawPerTurn = 1) => overState(state, { bag: Array(bag).fill("aging_flick"), discard: Array(discard).fill("aging_flick"), drawPerTurn });
    run("texte : sac, pluriel", "state.bag{count: 8, draw: 1}", describeBag(counts(8, 0), rules, t));
    run("texte : sac, une bille", "state.bag{count: 1, draw: 1}", describeBag(counts(1, 0), rules, t));
    run("texte : sac vide", "state.bag{count: 0, draw: 1}", describeBag(counts(0, 0), rules, t));
    run("texte : sac, pioche en vigueur", "state.bag{count: 8, draw: 2}", describeBag(counts(8, 0, 2), rules, t));
    run("texte : défausse, pluriel", "state.discard{count: 3}", describeDiscard(counts(0, 3), t));
    run("texte : défausse, une bille", "state.discard{count: 1}", describeDiscard(counts(0, 1), t));
    run("texte : défausse vide", "state.discard{count: 0}", describeDiscard(counts(0, 0), t));

    // Confirmation d'une pose : structure et texte exacts.
    const menuLines = (handIndex, slot) => placementLines(lensed, handIndex, slot, rules, t).map(({ key, params }) => t(key, params));
    run.same(
      "confirmation sur vide : la question, les valeurs prévues, puis la Chiquenaude",
      [
        "place.question{marble: <aging_flick>, slot: slot.rightBase}",
        "place.values{effect: effect.combined{parts: [effect.speed_up{amount: 1}]}}",
        "place.flick{marble: <aging_flick>, effect: effect.none}",
        "place.pot{reactions: effect.none}",
      ],
      menuLines(0, "rightBase")
    );
    run.same(
      "confirmation sur occupé : dans l'ordre réel, élision comprise, bonus reçu compté",
      [
        "place.question{marble: <aging_flick>, slot: slot.apex}",
        "place.values{effect: effect.combined{parts: [effect.speed_up{amount: 8}]}}",
        "place.flick{marble: <aging_flick>, effect: effect.none}",
        "place.hit{marble: <aging_flick>, effect: effect.combined{parts: [effect.speed_up{amount: 2}]}}",
        "place.knockout{marble: <hit_pocket>, effect: effect.combined{parts: [effect.speed_up{amount: 3}]}}",
        "place.pot{reactions: effect.none}",
      ],
      menuLines(0, "apex")
    );
    run.same(
      "confirmation : aucun effet dit, même structure ; un Polissage au choix chez qui le produit, selon votre choix",
      [
        "place.question{marble: <hit_polish>, slot: slot.leftBase}",
        "place.values{effect: effect.combined{parts: [effect.mass_up{amount: 1}]}}",
        "place.flick{marble: <hit_polish>, effect: effect.none}",
        "place.hit{marble: <hit_polish>, effect: forecast_choice.after{effect: effect.combined{parts: [effect.given_choice{effect: effect.polish{amount: 1}, target: choice.noun.triangle_marble{count: 1}, upTo: no}]}}}",
        "place.knockout{marble: <tally_flick>, effect: effect.combined{parts: [effect.speed_up{amount: 3}]}}",
        "place.pot{reactions: effect.none}",
      ],
      menuLines(2, "leftBase")
    );
    // Les valeurs prévues au format de R : ce que tally_flick donne s'entend chez le
    // hit_pocket, pas chez elle.
    // Aucune chiquenaude encore ce tour : celle de tally_flick se compte elle-même.
    const lensToPlace = { ...lensed, hand: inHand(["tally_flick"]), triangle: { ...lensed.triangle, leftBase: null }, tally: emptyTally(TALLY_COUNTERS) };
    run.same(
      "confirmation : le don dit chez la bille qui le fait",
      [
        "place.question{marble: <tally_flick>, slot: slot.leftBase}",
        "place.values{effect: effect.combined{parts: [effect.given{effect: effect.combined{parts: [effect.speed_up{amount: 4}]}, slot: slot.apex}]}}",
        "place.flick{marble: <tally_flick>, effect: effect.combined{parts: [effect.speed_up{amount: 2}]}}",
        "place.pot{reactions: effect.none}",
      ],
      placementLines(lensToPlace, 0, "leftBase", rules, t).map(({ key, params }) => t(key, params))
    );
    // Le menu entier : question, valeurs, Chiquenaude, Tic, Éjection, le pot, puis
    // Annuler avant Confirmer ; seules ces deux-là agissent.
    const entries = confirmationEntries(() => {}, placementLines(lensed, 0, "apex", rules, t));
    run.same(
      "confirmation : ordre complet du menu sur occupé",
      ["marbles.place.question", "marbles.place.values", "marbles.place.flick", "marbles.place.hit", "marbles.place.knockout", "marbles.place.pot", "menu.confirm.cancel", "menu.confirm.confirm"],
      entries.map((entry) => entry.label)
    );
    run.same(
      "confirmation : les entrées d'information sans action",
      [false, false, false, false, false, false, true, true],
      entries.map((entry) => typeof entry.onActivate === "function")
    );
    run.same(
      "confirmation : ordre complet du menu sur vide",
      ["marbles.place.question", "marbles.place.values", "marbles.place.flick", "marbles.place.pot", "menu.confirm.cancel", "menu.confirm.confirm"],
      confirmationEntries(() => {}, placementLines(lensed, 0, "rightBase", rules, t)).map((entry) => entry.label)
    );

    // Ce qui se dit d'une pose et d'une résolution réelles.
    const placing = rules.reduce(lensed, { type: "place", handIndex: 0, slot: "apex" });
    run(
      "texte : pose sur occupé",
      "event.effect_flick{marble: <aging_flick>, effect: effect.none, speed: 0, mass: 1} event.placed{marble: <aging_flick>, slot: slot.apex} event.effect_hit{marble: <aging_flick>, effect: effect.combined{parts: [effect.speed_up{amount: 2}]}, speed: 2, mass: 1} event.effect_knockout{marble: <hit_pocket>, effect: effect.combined{parts: [effect.speed_up{amount: 3}]}, speed: 5, mass: 1} event.discarded.replacement{marble: <hit_pocket>}",
      stepsText(buildSteps(placing.events, t))
    );
    const lensedSteps = buildSteps(rules.reduce(lensed, { type: "resolve" }).events, t).map((step) => step.text);
    // La base droite, vide, ouvre la résolution (lensedSteps[0]).
    run("texte : tally_flick dit son don à la pointe", "outcome.slot{slot: slot.leftBase, marble: <tally_flick>, effect: effect.combined{parts: [effect.given{effect: effect.combined{parts: [effect.speed_up{amount: 4}]}, slot: slot.apex}]}}", lensedSteps[1]);
    run("texte : le bonus s'entend chez qui le reçoit", "outcome.slot{slot: slot.apex, marble: <hit_pocket>, effect: effect.combined{parts: [effect.speed_up{amount: 10}]}}", lensedSteps[2]);
    run.same("étapes : aucune étape silencieuse", [], buildSteps(events, t).filter((step) => step.text === ""));
    run(
      "texte : le tour, compteurs compris",
      "state.turn{turn: 2, turnCount: 10, score: 5, speed: 5, mass: 2} state.throws{count: 4} state.swap_available",
      describeTurn({ ...lensed, score: 5, speed: 5, mass: 2 }, true, rules, t)
    );

  }
}

// La confirmation d'une pose, le curseur et la sélection d'emplacement.
function checkConfirmationAndCursor(run) {
  // La confirmation : l'ordre du modèle, ses lignes de lecture d'abord.
  run.same("confirmation : ordre du modèle", ["menu.confirm.cancel", "menu.confirm.confirm"], confirmationEntries(() => {}).map((entry) => entry.label));
  run.same(
    "confirmation : les lignes à lire d'abord, en lecture seule",
    ["a", "b", "menu.confirm.cancel", "menu.confirm.confirm"],
    confirmationEntries(() => {}, [{ key: "a" }, { key: "b" }]).map((entry) => entry.label)
  );
  run("confirmation : une ligne de lecture ne s'active pas", undefined, confirmationEntries(() => {}, [{ key: "a" }])[0].onActivate);

  // Curseur : la géométrie du triangle, main en dessous.
  const path = (start, ...directions) => {
    let cursor = start;
    for (const direction of directions) {
      cursor = stepCursor(cursor, direction);
      if (cursor === null) return null;
    }
    return cursor.place;
  };
  run("curseur : de la main vers la base gauche", "leftBase", path(INITIAL_CURSOR, "up"));
  run("curseur : de la base vers la pointe", "apex", path(INITIAL_CURSOR, "up", "up"));
  run("curseur : d'une base à l'autre", "rightBase", path(INITIAL_CURSOR, "up", "right"));
  run("curseur : retour à la dernière base depuis la pointe", "rightBase", path(INITIAL_CURSOR, "up", "right", "up", "down"));
  run("curseur : retour à la dernière base depuis la main", "rightBase", path(INITIAL_CURSOR, "up", "right", "down", "up"));
  run("curseur : de la pointe vers une base au choix", "leftBase", path(INITIAL_CURSOR, "up", "right", "up", "left"));
  run("curseur : rien au-dessus de la pointe", null, path(INITIAL_CURSOR, "up", "up", "up"));
  run("curseur : rien à gauche de la base gauche", null, path(INITIAL_CURSOR, "up", "left"));
  run("curseur : rien sous la main", null, path(INITIAL_CURSOR, "down"));
  run("zones : la main", "hand", zoneOf("hand"));
  run.same("zones : le triangle", ["triangle", "triangle", "triangle"], SLOTS.map(zoneOf));
  run("curseur : garde sa place dans la main", 3, stepCursor(stepCursor({ ...INITIAL_CURSOR, handIndex: 3 }, "up"), "down").handIndex);

  // Sélection d'emplacement : la main n'existe plus pour le curseur, le triangle
  // se parcourt comme d'habitude.
  const inTriangle = (place, lastBase = "leftBase") => ({ ...INITIAL_CURSOR, place, lastBase });
  run("sélection : rien sous la base gauche", null, stepCursor(inTriangle("leftBase"), "down", true));
  run("sélection : rien sous la base droite", null, stepCursor(inTriangle("rightBase", "rightBase"), "down", true));
  run("sélection : de la pointe vers la dernière base", "rightBase", stepCursor(inTriangle("apex", "rightBase"), "down", true).place);
  run("sélection : d'une base à l'autre", "rightBase", stepCursor(inTriangle("leftBase"), "right", true).place);
  run("sélection : vers la pointe", "apex", stepCursor(inTriangle("rightBase", "rightBase"), "up", true).place);
  const marble = { marble: "aging_flick", wear: 0 };
  const start = (leftBase, rightBase, apex) => placementStart({ leftBase, rightBase, apex }, SLOTS);
  run("sélection : tout vide, base droite (la première dans l'ordre horaire)", "rightBase", start(null, null, null));
  run("sélection : base gauche occupée, base droite", "rightBase", start(marble, null, null));
  run("sélection : seule la pointe est vide", "apex", start(marble, marble, null));
  run("sélection : base droite occupée, base gauche avant pointe", "leftBase", start(null, marble, null));
  run("sélection : tout occupé, base droite", "rightBase", start(marble, marble, marble));
}

// Les billes TÉMOINS : de vraies billes par leur id, pour leur NOM dans chaque langue
// (genre, élision), avec des effets écrits ici. Rien d'autre ne vient des vraies
// billes : changer leurs valeurs ne change aucun témoin ; les renommer, si.
const WITNESS_RULES = fabricatedRules({
  clay: { base: [speed(1)], apex: [speed(4)], hit: [speed(2)], maxWear: 3, size: MEDIUM },
  dragon: { apex: [speed(6)], knockout: [speed(3)], maxWear: 3, size: LARGE },
  pearl: { apex: [speed(-3)], maxWear: 3, size: LARGE },
  dolphin: { hit: [polish(1, choice({ zones: ["triangle"], mode: "optional" }))], maxWear: 3, size: MEDIUM },
});

// Les phrases attendues des témoins, par langue.
const WITNESSES = {
  fr: {
    confirmation: [
      "Poser argile en pointe ?",
      "Vitesse +4",
      "Chiquenaude d'argile : aucun effet",
      "Tic d'argile : Vitesse +2",
      "Éjection de dragon : Vitesse +3",
      "Pot : aucun effet",
    ],
    placing: "Pose : argile en pointe. Tic d'argile : Vitesse +2. Vitesse 2, Masse 1. Éjection de dragon : Vitesse +3. Vitesse 5, Masse 1. Défausse : dragon.",
    wornOut: [
      "argile est usée et quitte le triangle.",
      "dragon est usé et quitte le triangle.",
    ],
    overview: "Prévision : Vitesse −2, Masse 1, Impact 0. base droite, vide. base gauche, argile : Vitesse +1. pointe, perle : Vitesse −3.",
    card: [
      "Pointe : Vitesse +4.",
      "Base : Vitesse +1.",
    ],
    question: "Tic de dauphin : vous pouvez polir une bille active. T pour ne rien choisir.",
    questions: [
      "Tic de dauphin : vous pouvez polir jusqu'à 2 billes actives. T pour ne rien choisir.",
      "Tic de dauphin : vous devez choisir une bille active à polir.",
      "Tic de dauphin : vous devez choisir 2 billes actives à polir.",
      "Tic de dauphin : vous pouvez éjecter une bille active. T pour ne rien choisir.",
      "Tic de dauphin : vous devez choisir une bille active à éjecter.",
      "Tic de dauphin : vous pouvez donner Vitesse +2 à 2 billes actives au plus. T pour ne rien choisir.",
      "Vous pouvez encore polir une bille active. T pour terminer.",
      "Vous devez encore choisir une bille active.",
    ],
    chosen: [
      "agate choisie.",
      "dragon choisi.",
    ],
    turn: "Tour 2 sur 10. Score 5. Vitesse 5, Masse 2. 4 lancers restants. Échange disponible.",
    bag: [
      "Encore 8 billes dans le sac, 1 bille à piocher en début de tour.",
      "Encore 1 bille dans le sac, 1 bille à piocher en début de tour.",
    ],
    pot: "1 bille sur 3 dans le pot, 2 billes perdues.",
    impact: "Impact 0. Score 14.",
  },
  en: {
    confirmation: [
      "Place clay on the apex?",
      "Speed +4",
      "Flick of clay: no effect",
      "Hit from clay: Speed +2",
      "Knockout of dragon: Speed +3",
      "Pot: no effect",
    ],
    placing: "Placement: clay on the apex. Hit from clay: Speed +2. Speed 2, Mass 1. Knockout of dragon: Speed +3. Speed 5, Mass 1. Discard: dragon.",
    wornOut: [
      "clay is worn out and leaves the triangle.",
      "dragon is worn out and leaves the triangle.",
    ],
    overview: "Forecast: Speed −2, Mass 1, Impact 0. right base, empty. left base, clay: Speed +1. apex, pearl: Speed −3.",
    card: [
      "Apex: Speed +4.",
      "Base: Speed +1.",
    ],
    question: "Hit from dolphin: you may polish an active marble. T to choose nothing.",
    questions: [
      "Hit from dolphin: you may polish up to 2 active marbles. T to choose nothing.",
      "Hit from dolphin: you must choose an active marble to polish.",
      "Hit from dolphin: you must choose 2 active marbles to polish.",
      "Hit from dolphin: you may eject an active marble. T to choose nothing.",
      "Hit from dolphin: you must choose an active marble to eject.",
      "Hit from dolphin: you may give Speed +2 to 2 active marbles at most. T to choose nothing.",
      "You may still polish an active marble. T to finish.",
      "You must still choose an active marble.",
    ],
    chosen: [
      "agate chosen.",
      "dragon chosen.",
    ],
    turn: "Turn 2 of 10. Score 5. Speed 5, Mass 2. 4 throws left. Swap available.",
    bag: [
      "8 marbles left in the bag, 1 marble to draw at the start of the turn.",
      "1 marble left in the bag, 1 marble to draw at the start of the turn.",
    ],
    pot: "1 marble of 3 in the pot, 2 lost marbles.",
    impact: "Impact 0. Score 14.",
  },
};

// Les TÉMOINS : quelques phrases entières par langue, telles que le joueur les
// entend. Les autres vérifications de vue lisent les clés (keyText) : seuls ces
// témoins cassent quand un texte est réécrit, et c'est voulu, une dizaine au plus
// par langue. Chacun couvre une difficulté de la langue : élision, accord, signe
// moins, pluriel, ponctuation.
function checkWitnesses(run) {
  const previousLocale = getLocale();
  const game = (over) => marblesPlayState(WITNESS_RULES, { score: 0, ...over });
  const occupied = game({ hand: inHand(["clay"]), triangle: { leftBase: null, rightBase: null, apex: { marble: "dragon", wear: 0 } } });
  const worn = game({ triangle: { leftBase: { marble: "clay", wear: 2 }, rightBase: null, apex: { marble: "dragon", wear: 2 } } });
  const choosing = WITNESS_RULES.reduce(
    game({ hand: inHand(["dolphin"]), triangle: { leftBase: { marble: "clay", wear: 0 }, rightBase: null, apex: { marble: "dragon", wear: 0 } } }),
    { type: "place", handIndex: 0, slot: "leftBase" }
  ).state;
  const lines = (built) => built.map(({ key, params }) => plain(realT(key, params)));
  // Les variantes d'une question : facultatif et obligatoire, singulier et pluriel,
  // une autre action, un bonus, puis les relances après une première cible.
  const questionVariants = (pending) => [
    { ...pending, count: 2, remaining: 2 },
    { ...pending, mode: "required" },
    { ...pending, mode: "required", count: 2, remaining: 2 },
    { ...pending, action: "eject", amount: undefined },
    { ...pending, action: "eject", amount: undefined, mode: "required" },
    { ...pending, action: "speed", amount: 2, count: 2, remaining: 2 },
    { ...pending, count: 2, remaining: 1, chosen: [pending.eligible[0]] },
    { ...pending, mode: "required", count: 2, remaining: 1, chosen: [pending.eligible[0]] },
  ];
  const said = (locale) => {
    setLocale(locale);
    return {
      confirmation: lines(placementLines(occupied, 0, "apex", WITNESS_RULES, realT)),
      placing: plain(stepsText(buildSteps(WITNESS_RULES.reduce(occupied, { type: "place", handIndex: 0, slot: "apex" }).events, realT))),
      wornOut: WITNESS_RULES.reduce(worn, { type: "resolve" })
        .events.filter((event) => event.type === "removed" && event.cause === "wear")
        .map((event) => plain(stepsText(buildSteps([event], realT)))),
      overview: plain(describeOverview(game({ triangle: { leftBase: { marble: "clay", wear: 0 }, rightBase: null, apex: { marble: "pearl", wear: 0 } } }), WITNESS_RULES, realT)),
      card: marbleCard("clay", "x", WITNESS_RULES, realT).above.map(plain),
      question: plain(describeChoicePrompt(choosing.pendingChoice, realT)),
      questions: questionVariants(choosing.pendingChoice).map((pending) => plain(describeChoicePrompt(pending, realT))),
      chosen: ["agate", "dragon"].map((marble) => plain(realT("marbles.choice.chosen", { marble: nameRef(`marble.${marble}.name`) }))),
      turn: plain(describeTurn(game({ score: 5, speed: 5, mass: 2, throwsUsed: 1 }), true, rules, realT)),
      bag: [8, 1].map((count) => plain(describeBag(game({ bag: Array(count).fill("clay"), drawPerTurn: 1 }), rules, realT))),
      pot: plain(describePot(game({ pot: ["clay"], lost: ["dragon", "dolphin"] }), rules, realT)),
      impact: plain(stepsText(buildSteps([{ type: "impact", speed: -3, mass: 2, impact: 0, score: 14 }], realT))),
    };
  };
  try {
    for (const locale of ["fr", "en"]) {
      const witness = said(locale);
      run.same(`témoin ${locale} : la confirmation d'une pose sur une bille`, WITNESSES[locale].confirmation, witness.confirmation);
      run(`témoin ${locale} : une pose dite`, WITNESSES[locale].placing, witness.placing);
      run.same(`témoin ${locale} : les billes usées, accordées`, WITNESSES[locale].wornOut, witness.wornOut);
      run(`témoin ${locale} : la vue d'ensemble, une Vitesse négative`, WITNESSES[locale].overview, witness.overview);
      run.same(`témoin ${locale} : une fiche`, WITNESSES[locale].card, witness.card);
      run(`témoin ${locale} : la question d'un choix`, WITNESSES[locale].question, witness.question);
      run.same(`témoin ${locale} : les questions selon le mode, au singulier et au pluriel, et les relances`, WITNESSES[locale].questions, witness.questions);
      run.same(`témoin ${locale} : une bille choisie, accordée`, WITNESSES[locale].chosen, witness.chosen);
      run(`témoin ${locale} : le tour`, WITNESSES[locale].turn, witness.turn);
      run.same(`témoin ${locale} : le sac, pluriel et singulier`, WITNESSES[locale].bag, witness.bag);
      run(`témoin ${locale} : le pot et les billes perdues`, WITNESSES[locale].pot, witness.pot);
      run(`témoin ${locale} : l'Impact et le Score`, WITNESSES[locale].impact, witness.impact);
    }
  } finally {
    setLocale(previousLocale);
  }
}

// L'OBJECTIF ET LES RÈGLES (marbles/view/narration/goal.js) : l'ouverture, la touche O
// pour chaque objectif, la fiche de l'objectif, le résultat de fin, le palier atteint.
function checkGoalNarration(run) {
  const game = (over, statuses = []) => ({ ...overState(marblesPlayState(rules, {}), over), statuses });
  const free = game({ turn: 5, score: 25 });
  run(
    "O, libre : objectif, tour, palier atteint et le suivant, aucune règle",
    "goal.free{turns: 10} goal.progress.free{turn: 5, turns: 10, score: 25, reached: goal.progress.tier{tier: tier.bronze}} goal.progress.next_tier{tier: tier.silver, score: 40} goal.rule_count{count: 0}",
    describeGoal(free, t)
  );
  run("O, libre : au plus haut palier, pas de suivant", true, !describeGoal(game({ score: 99 }), t).includes("next_tier") && describeGoal(game({ score: 99 }), t).includes("tier.gold"));
  run(
    "O, cible",
    "goal.target{score: 200, turns: 8} goal.progress.target{score: 120, target: 200, turn: 5, turns: 8} goal.rule_count{count: 2}",
    describeGoal(game({ turn: 5, score: 120, goal: { kind: "target", score: 200 }, turns: 8 }, [ruleInstance("pot_game"), ruleInstance("no_pot")]), t)
  );
  run(
    "O, endurance sans limite : les tours tenus",
    "goal.endurance{minimum: 15, turns: null} goal.progress.endurance{count: 4} goal.rule_count{count: 0}",
    describeGoal(game({ turn: 5, goal: { kind: "endurance", minimum: 15 }, turns: null }), t)
  );
  run("O, endurance au plus 20 tours", true, describeGoal(game({ turn: 5, goal: { kind: "endurance", minimum: 15 }, turns: 20 }), t).includes("goal.progress.endurance_max{count: 4, turns: 20}"));
  run(
    "ouverture : l'objectif, puis chaque règle, son nom et sa description",
    "goal.free{turns: 10} goal.rule_line{status: status.pot_game.name, description: status.pot_game.description}",
    describeOpening(game({}, [ruleInstance("pot_game")]), t)
  );
  run.same(
    "fiche de l'objectif : la progression, ce qui le juge, la pioche impossible",
    ["goal.progress.target{score: 0, target: 50, turn: 2, turns: 8}", "goal.detail.target_win{score: 50}", "goal.detail.target_lose{turns: 8}", "goal.detail.no_marbles"],
    goalCard(game({ goal: { kind: "target", score: 50 }, turns: 8 }), "main", t).below
  );
  run.same(
    "résultat : selon l'objectif",
    ["result.tier{tier: tier.silver}", "result.no_tier", "result.victory", "result.defeat", "result.endurance_success{count: 20}", "result.endurance_ended{count: 4}"],
    [
      { goal: "free", tier: "silver" },
      { goal: "free", tier: "none" },
      { goal: "target", outcome: "victory" },
      { goal: "target", outcome: "defeat" },
      { goal: "endurance", outcome: "success", held: 20 },
      { goal: "endurance", outcome: "ended", held: 4 },
    ].map((result) => resultText(result, t))
  );
  const over = (end) => stepsText(buildSteps([{ type: "gameOver", score: 9, result: { goal: "target", end, score: 9, outcome: "defeat" } }], t));
  run("fin de partie : le résultat puis le score", "event.game_over{score: 9, result: result.defeat}", over("lastTurn"));
  run("fin de partie, plus aucune bille : la raison d'abord", "result.no_marbles event.game_over{score: 9, result: result.defeat}", over("noMarbles"));
  run("palier atteint : dit", "event.tier_reached{tier: tier.bronze}", stepsText(buildSteps([{ type: "tierReached", tier: "bronze", score: 20 }], t)));
  run("tour sans limite : sans « sur »", true, describeTurnLine(game({ goal: { kind: "endurance", minimum: 15 }, turns: null }), true, rules, t).startsWith("state.turn_unlimited{"));
}
