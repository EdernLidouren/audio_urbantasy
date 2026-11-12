// Vérifications — domaine « marbles-view ». Ce que le jeu des billes DIT et
// sonne, sur les vraies tables de textes : chaque bille et chaque refus a son
// texte, chaque évènement du journal se dit et a son point d'accroche sonore,
// aucun gabarit ne reste brut, dans chaque langue. Plus les fiches des billes,
// l'ordre du menu du sac et de la confirmation, le déplacement du curseur et la
// sélection d'emplacement.
// La vue d'ensemble et la séquence de résolution ont leur domaine,
// marbles-sequence. Rien n'est annoncé ni joué ici : runChecks() se lance aussi
// dans le jeu. Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js marbles-view`).

import { LOCALE_TABLES, nameRef, t, setLocale, getLocale } from "../../data/i18n/index.js";
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
} from "../../config/marbles-values.js";
import { detailLine, stepDetail } from "../../lib/detail-card.js";
import { createMarblesGame, MARBLE_ERRORS, SLOTS } from "../marbles.js";
import { emptyTally } from "../marbles-tally.js";
import { MARBLE_KEYWORDS, REACTION_KEYS, TALLY_COUNTERS } from "../marbles.js";
import { TALLY_CATEGORIES } from "../marbles-counters.js";
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
  describeMarbleInList,
  cardSituation,
  describePrinted,
  describeSlotFocus,
  describeSlotForPlacement,
  describeTurn,
  formatCounter,
  placementLines,
} from "../../view/marbles/narration.js";
import { marbleCard } from "../../view/marbles/card.js";
import { tallyMenu } from "../../view/marbles/tally-screen.js";
import { keywordLines, keywordsMenu, keywordsText } from "../../view/marbles/keywords.js";
import { confirmationEntries } from "../../view/menus/confirmation.js";
import { INITIAL_CURSOR, placementStart, stepCursor, zoneOf } from "../../view/marbles/navigation.js";
import {
  MARBLE_EVENT_CUES,
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
} from "../../view/marbles/sounds.js";
import { pathLength, rollAt, rollDurationMs, rollEnvelope } from "../../view/marbles/rolls.js";
import { EMPTY_SOUND_QUEUE, advanceSoundQueue, enqueueCues } from "../../view/marbles/sound-queue.js";
import { throws } from "../../lib/check.js";
import MARBLE_TYPES from "../../marbles/types/index.js";
import { answerChoices, earlierTestTypes, emptyBagMarblesGame, inHand, withSizes } from "./helpers.js";
import { choiceAnswer, choiceCursorAfterAnswer, choiceFocusLine, choiceHandOptions, choiceMarbleAt, choiceStartCursor, stepChoiceCursor } from "../../view/marbles/choice.js";
import { MARBLES_HELP_TOPICS, helpTopicText, marblesHelpMenu } from "../../view/marbles/help-screen.js";
import { createMarblesRules } from "../marbles-rules.js";
import { AMOUNT_SOURCES, CLAUSE_ACTIONS, effectAt } from "../marbles-effects.js";

// Tables fabriquées : complétées d'un calibre (core/checks/helpers.js/withSizes).
const fabricatedRules = (table) => createMarblesRules(withSizes(table));

// Les règles du jeu, liées à la vraie table (core/marbles-rules.js).
const rules = createMarblesRules(MARBLE_TYPES);
// Les billes de test d'avant les cibles au choix et Éjecter (core/checks/helpers.js).
const earlierRules = createMarblesRules(earlierTestTypes(MARBLE_TYPES));

// Un gabarit resté brut (accolade, clé non traduite), ou un nombre négatif écrit
// avec un trait d'union, qu'un lecteur d'écran peut taire.
function isClean(text) {
  return typeof text === "string" && text.length > 0 && !/[{}]|marbles?\.\w|-\d/.test(text);
}

// Les textes français portent des espaces insécables, invisibles dans une
// comparaison : on compare sur l'espace ordinaire.
function plain(text) {
  return text.replace(/[\u00a0\u202f]/g, " ");
}

// Une partie complète, puis une fin par sac épuisé : tous les types d'évènements.
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
  const fullHand = rules.reduce({ ...rules.createGame(4), stage: "draw", turn: 2, hand: inHand(["clay", "glass", "agate", "mica", "tiger"]) }, { type: "draw" });
  events.push(...fullHand.events);
  // Polissage, Fêlure, cible vide : le Tic du verre sur une pointe vide, puis le
  // sulfure qui fêle une porcelaine.
  const polishedNothing = rules.reduce({ ...emptyBagMarblesGame(rules, 6), turn: 2, stage: "play", hand: inHand(["glass"]), triangle: { leftBase: { marble: "clay", wear: 0 }, rightBase: null, apex: null } }, { type: "place", handIndex: 0, slot: "leftBase" });
  events.push(...polishedNothing.events);
  const pocketedApex = rules.reduce({ ...emptyBagMarblesGame(rules, 7), turn: 2, stage: "play", bag: ["clay"], triangle: { leftBase: { marble: "sulphide", wear: 0 }, rightBase: null, apex: { marble: "porcelain", wear: 0 } } }, { type: "resolve" });
  events.push(...pocketedApex.events);
  // La plombée fêle la porcelaine de la pointe ; le gorille, pot plein, perd la
  // bille de la main choisie.
  const cracked = rules.reduce({ ...emptyBagMarblesGame(rules, 7), turn: 2, stage: "play", hand: inHand(["leaded"]), triangle: { leftBase: null, rightBase: null, apex: { marble: "porcelain", wear: 0 } } }, { type: "place", handIndex: 0, slot: "apex" });
  events.push(...cracked.events);
  // Une Fêlure : la plombée d'avant Éjecter (core/checks/helpers.js/earlierTestTypes).
  const crackedBefore = earlierRules.reduce({ ...emptyBagMarblesGame(rules, 7), turn: 2, stage: "play", hand: inHand(["leaded"]), triangle: { leftBase: null, rightBase: null, apex: { marble: "porcelain", wear: 0 } } }, { type: "place", handIndex: 0, slot: "apex" });
  events.push(...crackedBefore.events);
  // Le Tic du gorille fait choisir la bille de la main : l'argile, perdue.
  const lost = answerChoices(rules, rules.reduce({ ...emptyBagMarblesGame(rules, 7), turn: 2, stage: "play", hand: inHand(["gorilla", "clay"]), pot: ["glass", "glass", "glass"], triangle: { leftBase: null, rightBase: null, apex: { marble: "clay", wear: 0 } } }, { type: "place", handIndex: 0, slot: "apex" }));
  events.push(...lost.events);
  const polished = rules.reduce({ ...emptyBagMarblesGame(rules, 8), turn: 2, stage: "play", bag: ["clay"], triangle: { leftBase: null, rightBase: null, apex: { marble: "mica", wear: 1 } } }, { type: "resolve" });
  events.push(...polished.events);
  // Sac vide, défausse pleine : la défausse devient le sac.
  // La tigrée active y trouve (Trouvaille).
  const regenerated = rules.reduce(
    { ...emptyBagMarblesGame(rules, 5), turn: 2, stage: "draw", hand: inHand([]), discard: ["clay", "glass"], triangle: { leftBase: null, rightBase: null, apex: { marble: "tiger", wear: 0 } } },
    { type: "draw" }
  );
  events.push(...regenerated.events);
  // Sac et défausse vides : la pioche s'arrête, la partie finit.
  const end = rules.reduce({ ...emptyBagMarblesGame(rules, 2), turn: 2, stage: "draw", hand: inHand(["clay"]) }, { type: "draw" });
  events.push(...end.events);
  // Un tour avec des emplacements vides, pour les phases sautées.
  const skipped = rules.reduce({ ...emptyBagMarblesGame(rules, 3), turn: 2, stage: "play" }, { type: "resolve" });
  events.push(...skipped.events);
  // La tigrée du pot réagit à la Chiquenaude de l'argile.
  const reacting = rules.reduce({ ...emptyBagMarblesGame(rules, 3), turn: 2, stage: "play", hand: inHand(["clay"]), pot: ["tiger"] }, { type: "place", handIndex: 0, slot: "apex" });
  events.push(...reacting.events);
  // Un choix indécis : à l'aveugle seulement (la prévision), le Tic du verre.
  const undecided = rules.reduce({ ...emptyBagMarblesGame(rules, 3), turn: 2, stage: "play", hand: inHand(["glass"]), triangle: { leftBase: null, rightBase: null, apex: { marble: "clay", wear: 0 } } }, { type: "place", handIndex: 0, slot: "apex" }, { blind: true });
  events.push(...undecided.events);
  // La limite de sécurité, nulle : chaque chaîne est coupée, l'action aboutit.
  const interrupted = rules.reduce(rules.createGame(3), { type: "draw" }, { eventLimit: 0 });
  events.push(...interrupted.events);
  return { events, state: { ...state, stage: "play" } };
}

// Traduction de test : la clé et ses valeurs, pour vérifier ce que lit la fiche
// sans dépendre des textes.
function keyT(key, params) {
  return params ? `${key} ${JSON.stringify(params)}` : key;
}

// Les fiches d'une bille : ce que le modèle déclare, avec les vrais textes.
function checkCards(run) {
  const previousLocale = getLocale();
  try {
    setLocale("fr");
    const fields = (marble) => {
      const card = marbleCard(marble, "principal", rules, t);
      return { above: card.above.map(plain), below: card.below.map(plain) };
    };
    run.same(
      "fiche : pointe puis base au-dessus, chiquenaude puis tic au-dessous, montant calculé à 0 hors de la main",
      {
        above: ["Pointe : Vitesse +4.", "Base : Vitesse +1."],
        below: ["Chiquenaude : Vitesse +1 par tour en main, maximum +5, actuellement 0.", "Tic : Vitesse +2."],
      },
      fields("clay")
    );
    run.same(
      "fiche : éjection au-dessous, base sans effet",
      {
        above: ["Pointe : Vitesse +6.", "Base : aucun effet."],
        below: ["Tic : Vitesse +4 si la bille éjectée est plus petite et Empocher une bille de votre main au choix.", "Éjection : Vitesse +3."],
      },
      fields("gorilla")
    );
    run.same(
      "fiche : Empocher en base, une Fêlure ciblée, En poche en dernier",
      {
        above: ["Pointe : Masse +3.", "Base : Empocher la bille en pointe."],
        below: ["Trouvaille : Fêlure 1 à la base droite.", "En poche, à chaque résolution : Vitesse +2 par minibille active."],
      },
      fields("sulphide")
    );
    run.same(
      "fiche : effet négatif avec le vrai signe moins",
      ["Pointe : Vitesse −3.", "Base : Masse +2."],
      fields("leaded").above
    );
    run.same(
      "fiche : variante de base, un seul champ",
      ["Pointe : Vitesse +3.", "Base gauche : Vitesse +3. Base droite : Masse +1."],
      fields("cats_eye").above
    );
    run(
      "fiche : effet imprimé conditionnel de la loupe",
      "Base gauche : Vitesse +4 à la pointe si son effet de pointe donne au moins Vitesse +1. Base droite : Vitesse +1.",
      fields("magnifier").above[1]
    );
    run.same(
      "fiche : la Pioche en base, un Polissage sur soi, une Éjection conditionnée au calibre",
      {
        above: ["Pointe : Vitesse +2 et Polissage 1.", "Base : Pioche 1."],
        below: ["Éveil : Pioche 1.", "Éjection : Pioche 1 si la bille posée est plus grosse.", "En poche, à chaque mélange : Polissage 1 à la pointe."],
      },
      fields("mica")
    );
    // Les conditions de calibre, lisibles à l'oreille.
    run("fiche : comptage par calibre", "Base : Vitesse +1 par minibille active.", fields("stoneware").above[1]);
    run("fiche : calibre d'un emplacement", "Pointe : Masse +1 et Masse +2 si la base gauche est un calot.", fields("agate").above[0]);
    run.same("fiche : un Polissage au choix au Tic", ["Tic : Polissage 1 à une bille active au choix."], fields("glass").below);
    run.same(
      "fiche : un Polissage ciblé au Final, une Trouvaille entre Tic et Final",
      ["Tic : Masse +1.", "Trouvaille : Polissage 1.", "Final : Polissage 1 à la pointe et Empocher cette bille.", "En poche, à chaque résolution : Masse +1."],
      fields("agate").below
    );
    run.same("fiche : la Pioche au tic", ["Tic : Pioche 1."], fields("cats_eye").below);
    run.same("fiche : la Pioche à l'éjection, puis sa réaction en poche", ["Éjection : Pioche 1.", "En poche, à chaque bille éjectée : Masse +1."], fields("stoneware").below);
    run("fiche : la réaction de la tigrée, en dernier", "En poche, à chaque chiquenaude : Vitesse +2.", fields("tiger").below.at(-1));
    // Plusieurs occurrences écoutées : une ligne chacune, dans l'ordre des valeurs de
    // partie, après les moments fixes.
    const listening = fabricatedRules({
      many: { pocketed: { shuffles: [{ action: "mass", amount: 1 }], resolution: [{ action: "speed", amount: 1 }], flick: [{ action: "speed", amount: 2 }] } },
    });
    run.same(
      "fiche : moments fixes, puis une ligne par occurrence, dans l'ordre des valeurs de partie",
      ["En poche, à chaque résolution : Vitesse +1.", "En poche, à chaque chiquenaude : Vitesse +2.", "En poche, à chaque mélange : Masse +1."],
      marbleCard("many", "x", listening, t).below.map(plain)
    );
    run.same(
      "fiche : la Chiquenaude, le Final, puis En poche à l'entrée de la porcelaine",
      ["Chiquenaude : Masse +1.", "Final : Vitesse +4 et Polissage 1 à jusqu'à 2 billes actives au choix.", "En poche, à l'entrée : Vitesse +10."],
      fields("porcelain").below
    );
    // Un montant calculé, avec sa valeur actuelle : en main, celle de son compteur.
    const flickLine = (turnsInHand) => plain(marbleCard("clay", "principal", rules, t, { turnsInHand }).below[0]);
    run("fiche : montant calculé en main, valeur actuelle", "Chiquenaude : Vitesse +1 par tour en main, maximum +5, actuellement +2.", flickLine(2));
    run("fiche : montant calculé en main, plafonné", "Chiquenaude : Vitesse +1 par tour en main, maximum +5, actuellement +5.", flickLine(8));
    run("fiche : Éjecter la bille en pointe, la plombée", "Chiquenaude : Éjecter la bille en pointe.", fields("leaded").below[0]);
    run("fiche : Éjecter toutes les minibilles actives, la géante", "Final : Pioche 1 et Éjecter toutes les minibilles actives.", fields("giant").below.at(-1));
    run("fiche : Éjecter une bille active au choix, la tigrée", "Base : Éjecter une bille active au choix.", fields("tiger").above[1]);
    // Une valeur de partie : la valeur actuelle se lit dans le registre de la partie,
    // où que soit la bille ; hors de toute partie, à zéro.
    const withTally = (marble, values) => marbleCard(marble, "principal", rules, t, { tally: { ...emptyTally(TALLY_COUNTERS), ...values } });
    run(
      "fiche : valeur de partie, chiquenaudes ce tour",
      "Chiquenaude : Vitesse +2 par chiquenaude ce tour, maximum +6, actuellement +4.",
      plain(withTally("magnifier", { flick: { turn: 2, game: 6 } }).below[0])
    );
    run(
      "fiche : valeur de partie, plafonnée",
      "Chiquenaude : Vitesse +2 par chiquenaude ce tour, maximum +6, actuellement +6.",
      plain(withTally("magnifier", { flick: { turn: 5, game: 5 } }).below[0])
    );
    run(
      "fiche : valeur de partie, trouvailles cette partie",
      "Pointe : Vitesse +1 par trouvaille cette partie, maximum +10, actuellement +2.",
      plain(withTally("glass", { windfall: { turn: 0, game: 2 }, shuffles: { turn: 1, game: 9 } }).above[0])
    );
    run(
      "fiche : hors de toute partie, valeur actuelle à zéro",
      "Pointe : Vitesse +1 par trouvaille cette partie, maximum +10, actuellement 0.",
      plain(marbleCard("glass", "principal", rules, t).above[0])
    );
    // Sur le triangle, en pose : sans prévision possible, l'effet imprimé, avec le
    // registre de la partie.
    run(
      "texte : effet imprimé d'une bille active, avec le registre",
      "pointe, verre : Vitesse +1 par trouvaille cette partie, maximum +10, actuellement +3.",
      plain(
        describeSlotForPlacement(
          { ...createMarblesGame(1, {}, MARBLE_TYPES), stage: "over", triangle: { leftBase: null, rightBase: null, apex: { marble: "glass", wear: 0 } }, tally: { ...emptyTally(TALLY_COUNTERS), windfall: { turn: 1, game: 3 } } },
          "apex",
          rules,
          t
        )
      )
    );
    // Les autres formes d'un montant calculé : avec une base, sans plafond, négatif,
    // une action non signée.
    const source = { type: "turnsInHand" };
    const computedCard = (amount, action, turnsInHand) =>
      plain(marbleCard("x", "principal", fabricatedRules({ x: { flick: [{ action, amount }] } }), t, { turnsInHand }).below[0]);
    run("fiche : montant calculé avec une base", "Chiquenaude : Vitesse +2, +1 par tour en main, actuellement +3.", computedCard({ base: 2, step: 1, source }, "speed", 1));
    run(
      "fiche : montant calculé négatif",
      "Chiquenaude : Masse −2, +1 par tour en main, maximum +1, actuellement −2.",
      computedCard({ base: -2, step: 1, source, max: 1 }, "mass", 0)
    );
    run("fiche : montant calculé d'une Pioche", "Chiquenaude : Pioche 1 par tour en main, maximum 3, actuellement 3.", computedCard({ base: 0, step: 1, source, max: 3 }, "draw", 4));
    run.same("fiche : l'Éveil en premier, puis le Final de la géante", ["Éveil : Polissage 1 à la pointe.", "Final : Pioche 1 et Éjecter toutes les minibilles actives."], fields("giant").below);
    run.same(
      "fiche : tic, éjection, final, dans cet ordre",
      ["Tic : Vitesse +1.", "Éjection : Masse +2.", "Final : Pioche 1."],
      marbleCard(
        "all",
        "x",
        fabricatedRules({ all: { final: [{ action: "draw", amount: 1 }], knockout: [{ action: "mass", amount: 2 }], hit: [{ action: "speed", amount: 1 }] } }),
        t
      ).below.map(plain)
    );
    setLocale("en");
    run.same("fiche, anglais : la Pioche et le Polissage", ["Apex: Speed +2 and Polish 1.", "Base: Draw 1."], fields("mica").above);
    run.same("fiche, anglais : Empocher en base", ["Apex: Mass +3.", "Base: Pocket the marble at the apex."], fields("sulphide").above);
    run.same(
      "fiche, anglais : comparaison de calibre au Tic, Empocher une bille de la main au choix",
      ["Hit: Speed +4 if the knocked-out marble is smaller and Pocket a marble from your hand of your choice.", "Knockout: Speed +3."],
      fields("gorilla").below
    );
    run.same("fiche, anglais : En poche", ["Final: Polish 1 to the apex and Pocket this marble.", "Pocketed, each resolution: Mass +1."], fields("agate").below.slice(-2));
    run.same(
      "fiche, anglais : comparaison de calibre à l'Éjection, réaction en poche",
      ["Awaken: Draw 1.", "Knockout: Draw 1 if the placed marble is larger.", "Pocketed, each shuffle: Polish 1 to the apex."],
      fields("mica").below
    );
    run("fiche, anglais : la réaction de la tigrée", "Pocketed, each flick: Speed +2.", fields("tiger").below.at(-1));
    run("fiche, anglais : Éjecter toutes les minibilles actives", "Final: Draw 1 and Eject all active peewees.", fields("giant").below.at(-1));
    run("fiche, anglais : Éjecter la bille en pointe", "Flick: Eject the marble at the apex.", fields("leaded").below[0]);
    run("fiche, anglais : comptage par calibre", "Base: Speed +1 per active peewee.", fields("stoneware").above[1]);
    run("fiche, anglais : calibre d'un emplacement", "Apex: Mass +1 and Mass +2 if the left base is a boulder.", fields("agate").above[0]);
    run("anglais : bille en liste, calibre après le nom", "gorilla, boulder, wear 3. 1 of 2", describeMarbleInList("gorilla", 0, 2, rules, t));
    setLocale("fr");
    run.same(
      "fiche : tic et éjection dans l'ordre",
      ["Tic : Vitesse +1.", "Éjection : Masse +2."],
      marbleCard("both", "x", fabricatedRules({ both: { knockout: [{ action: "mass", amount: 2 }], hit: [{ action: "speed", amount: 1 }] } }), t).below.map(
        plain
      )
    );
  } finally {
    setLocale(previousLocale);
  }

  // Parcours sur une vraie fiche, comme au clavier.
  const card = marbleCard("clay", "principal", rules, keyT);
  const walk = (...directions) => {
    let position = 0;
    return directions.map((direction) => {
      position = stepDetail(position, card, direction);
      return detailLine(card, position).split(" ")[0];
    });
  };
  run.same(
    "fiche : pointe, base, réannonce, retour, annonce principale, chiquenaude",
    ["marbles.card.apex", "marbles.card.base", "marbles.card.base", "marbles.card.apex", "principal", "marbles.card.flick"],
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
    marbleCard("spinner", "x", cardRules(spinner), keyT, { model: extendedModel }).below[0].startsWith("spin.label")
  );
  run.same(
    "fiche : un champ déclaré, absent de la bille, n'existe pas",
    [MARBLE_CARD_MODEL.emptyBelowKey],
    marbleCard("plain", "x", cardRules({ plain: {} }), keyT, { model: extendedModel }).below
  );
  run("fiche : champ obligatoire vide, aucun effet", 2, marbleCard("plain", "x", cardRules({ plain: {} }), keyT).above.length);
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
  const locale = getLocale();
  const tally = { ...emptyTally(TALLY_COUNTERS), flick: { turn: 2, game: 5 }, shuffles: { turn: 0, game: 1 } };
  const menu = tallyMenu(tally);
  const lines = (built) => built.entries.map((entry) => plain(t(entry.label, entry.labelParams)));
  setLocale("fr");
  const said = lines(menu);
  run("menu des valeurs : titre", "Valeurs de partie", t(menu.title));
  run.same(
    "menu des valeurs : le début, la catégorie puis ses compteurs",
    ["Déclenchements", "éveils : 0 ce tour, 0 cette partie.", "chiquenaudes : 2 ce tour, 5 cette partie."],
    said.slice(0, 3)
  );
  run.same(
    "menu des valeurs : les titres des catégories, dans l'ordre",
    ["Déclenchements", "Actions", "Vitesse et Masse", "Évènements"],
    said.filter((line) => !line.includes(":") && line !== "Fermer")
  );
  run("menu des valeurs : un mélange", true, said.includes("mélanges : 0 ce tour, 1 cette partie."));
  run("menu des valeurs : Fermer en dernier", "Fermer", said.at(-1));
  run("menu des valeurs : une ligne par compteur, un titre par catégorie, Fermer", TALLY_COUNTERS.length + TALLY_CATEGORIES.length + 1, menu.entries.length);
  run("menu des valeurs : Échap ferme", true, menu.closable);
  run.same("menu des valeurs : seule Fermer agit", [menu.entries.length - 1], menu.entries.flatMap((entry, index) => (typeof entry.onActivate === "function" ? [index] : [])));
  run("menu des valeurs : un compteur absent du registre lève", true, throws(() => tallyMenu({})));
  setLocale("en");
  run.same("menu des valeurs, anglais", ["Triggers", "awakenings: 0 this turn, 0 this game.", "flicks: 2 this turn, 5 this game."], lines(menu).slice(0, 3));
  setLocale(locale);
}

// L'aide des mots-clés (touches E et Maj+E) : seulement ceux présents sur la bille,
// dans l'ordre (déclencheurs, En poche, actions, puis pointe et base), chacun une
// fois ; les cas vides.
function checkKeywords(run) {
  const locale = getLocale();
  const ids = (marble, marbles = rules) => marbles.keywordsOf(marble).map((keyword) => keyword.id);
  run.same("mots-clés : la géante, déclencheurs, actions, puis pointe et base", ["awaken", "final", "draw", "polish", "eject", "apex", "base"], ids("giant"));
  run.same("mots-clés : le mica, la Pioche une seule fois (base, éveil, éjection) ; En poche par sa réaction", ["awaken", "knockout", "pocketed", "draw", "polish", "apex", "base"], ids("mica"));
  run.same("mots-clés : le sulfure, En poche avant les actions, Fêlure puis Empocher", ["windfall", "pocketed", "crack", "pocket", "apex", "base"], ids("sulphide"));
  run.same("mots-clés : la porcelaine, En poche par son seul effet d'entrée, Polissage par son Final", ["flick", "final", "pocketed", "polish", "apex", "base"], ids("porcelain"));
  run.same("mots-clés : ni Vitesse ni Masse, ni calibre", ["flick", "hit", "apex", "base"], ids("clay"));
  const made = fabricatedRules({ sided: { baseVariant: { leftBase: [{ action: "mass", amount: 1 }] } }, bare: {} });
  run.same("mots-clés : une variante de base seule compte comme base", ["base"], ids("sided", made));
  run.same("mots-clés : une bille sans effet n'en a aucun", [], ids("bare", made));
  run.same(
    "mots-clés : l'ordre de la liste, déclencheurs, En poche, actions, puis phases",
    ["awaken", "flick", "hit", "windfall", "knockout", "final", "pocketed", "draw", "polish", "crack", "pocket", "eject", "apex", "base"],
    MARBLE_KEYWORDS.map((keyword) => keyword.id)
  );

  setLocale("fr");
  run(
    "touche E : la tigrée, d'une seule annonce, pointe et base en dernier",
    "Éveil : se déclenche quand la bille est piochée. " +
      "Trouvaille : se déclenche quand le sac est reconstitué à partir de la défausse, si la bille est sur le triangle. " +
      "Final : se déclenche quand la bille est usée et quitte le triangle. Elle est alors déjà dans la défausse : si son Final l'empoche, elle passe de la défausse au pot. " +
      "En poche : effets actifs uniquement lorsque la bille est dans le pot : à son entrée, à chaque résolution, ou en réaction à ce qui se passe pendant la partie. " +
      "Éjecter : chasse une bille du triangle. Elle part à la défausse, et son effet d'éjection se déclenche. " +
      "Pointe : effet joué pendant la phase de pointe, quand la bille est posée en pointe. " +
      "Base : effet joué pendant la phase de base, quand la bille est posée en base gauche ou en base droite. Il peut différer selon le côté.",
    plain(keywordsText("tiger", rules, t))
  );
  run("touche E : aucune bille", "Aucune bille.", keywordsText(undefined, rules, t));
  run(
    "touche E : En poche et Empocher, tels que déclarés",
    true,
    plain(keywordsText("agate", rules, t)).includes(
      "En poche : effets actifs uniquement lorsque la bille est dans le pot : à son entrée, à chaque résolution, ou en réaction à ce qui se passe pendant la partie. Polissage : retire de l'usure à une bille, qui reste ainsi plus longtemps sur le triangle. " +
        "Empocher : envoie une bille au pot, où qu'elle soit : sur le triangle, en main ou dans la défausse. Si le pot est plein, la bille est perdue pour la partie. Pointe : "
    )
  );
  run("touche E : aucun mot-clé", "Aucun mot-clé.", keywordsText("bare", made, t));
  const menu = keywordsMenu("giant", rules);
  const lines = (built) => built.entries.map((entry) => plain(t(entry.label, entry.labelParams)));
  run("Maj+E : titre", "Mots-clés de géante", plain(t(menu.title, menu.titleParams)));
  run.same(
    "Maj+E : une entrée par mot-clé, puis Fermer",
    ["Éveil", "Final", "Pioche", "Polissage", "Éjecter", "Pointe", "Base", "Fermer"],
    lines(menu).map((line) => line.split(" : ")[0])
  );
  run("Maj+E : la description de la Pioche", "Pioche : pioche des billes du sac. Si le sac est vide, la défausse est mélangée pour le reconstituer.", lines(menu)[2]);
  run("Maj+E : Échap ferme", true, menu.closable);
  run.same("Maj+E : seule Fermer agit", [menu.entries.length - 1], menu.entries.flatMap((entry, index) => (typeof entry.onActivate === "function" ? [index] : [])));
  run.same("Maj+E : aucun mot-clé", ["Aucun mot-clé.", "Fermer"], lines(keywordsMenu("bare", made)));
  run.same("Maj+E : aucune bille", ["Aucune bille.", "Fermer"], lines(keywordsMenu(undefined, rules)));
  run("Maj+E : aucune bille, titre", "Mots-clés", t(keywordsMenu(undefined, rules).title));
  setLocale("en");
  run("touche E, anglais : la première ligne", "Awaken: triggers when the marble is drawn.", plain(t(keywordLines("tiger", rules)[0].key, keywordLines("tiger", rules)[0].params)));
  run(
    "touche E, anglais : pointe en avant-dernier",
    "Apex: effect played during the apex phase, when the marble sits at the apex.",
    plain(t(keywordLines("tiger", rules).at(-2).key, keywordLines("tiger", rules).at(-2).params))
  );
  run("touche E, anglais : aucune bille", "No marble.", keywordsText(undefined, rules, t));
  run(
    "touche E, anglais : En poche et Empocher",
    true,
    plain(keywordsText("sulphide", rules, t)).includes(
      "Pocketed: effects active only while the marble is in the pot: on entering it, at each resolution, or in reaction to what happens during the game. Crack: adds wear to a marble. If it reaches its maximum, the marble is worn out and leaves the triangle at once. " +
        "Pocket: sends a marble to the pot, wherever it is: on the triangle, in hand or in the discard. If the pot is full, the marble is lost for the rest of the game. Apex: "
    )
  );
  run("Maj+E, anglais : titre", "Keywords of giant", plain(t(menu.title, menu.titleParams)));
  run.same("Maj+E, anglais : aucun mot-clé", ["No keyword.", "Close"], lines(keywordsMenu("bare", made)));
  setLocale(locale);

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
      "But du jeu",
      "Score : Vitesse, Masse et Impact",
      "Le triangle et la rotation",
      "L'usure",
      "Main, lancers et pioche",
      "Les zones : sac, défausse, pot, billes perdues",
      "Les mots-clés",
      "Les touches",
      "Fermer",
    ],
    labels.map((label) => plain(t(label)))
  );
  run("aide H : son titre", "Aide du jeu des billes", t(menu.title));
  run("aide H : Échap ferme", true, menu.closable);
  run("aide H : chaque entrée agit", true, menu.entries.every((entry) => typeof entry.onActivate === "function"));
  menu.entries.at(-2).onActivate();
  run("aide H : « Les touches » ouvre l'aide des touches", 1, keyHelpOpened);
  run.same("aide H : une rubrique par texte, dans l'ordre", ["goal", "score", "triangle", "wear", "hand", "zones", "keywords"], MARBLES_HELP_TOPICS);
  run(
    "aide H : le but du jeu",
    "Posez des billes sur le triangle pour marquer le plus de points en 10 tours. Chaque tour se termine par une résolution, qui produit un Impact. L'Impact s'ajoute à votre score.",
    plain(helpTopicText("goal", t))
  );
  run("aide H : la main cite les réglages", true, plain(helpTopicText("hand", t)).includes("5 billes au premier tour, puis 1 bille à chaque tour") && plain(helpTopicText("hand", t)).includes("5 lancers par tour"));
  run("aide H : le pot cite sa capacité", true, plain(helpTopicText("zones", t)).includes("jusqu'à 3 billes"));
  run("aide H : les mots-clés renvoient à E et Maj+E", true, plain(helpTopicText("keywords", t)).includes("touche E") && plain(helpTopicText("keywords", t)).includes("Maj+E"));
  for (const lang of ["fr", "en"]) {
    setLocale(lang);
    const short = MARBLES_HELP_TOPICS.filter((id) => {
      const text = helpTopicText(id, t);
      const sentences = text.split(/[.!?]\s/).length;
      return text.length === 0 || sentences > 4;
    });
    run.same(`aide H, ${lang} : chaque texte court, de quelques phrases`, [], short);
  }
  setLocale("en");
  run("aide H, anglais : la première rubrique", "Goal of the game", t(menu.entries[0].label));
  run("aide H, anglais : Fermer", "Close", t(menu.entries.at(-1).label));
  run("aide H, anglais : l'usure", true, helpTopicText("wear", t).startsWith("A marble on the triangle takes 1 wear at each phase."));
  setLocale(locale);
}

// L'INTERFACE DE CHOIX (view/marbles/choice.js) et ses textes : la main limitée aux
// billes éligibles (Terminer en dernier en mode « jusqu'à N »), le triangle entier
// avec ses emplacements non éligibles dits et bloqués, la navigation entre zones,
// la question, ce qui reste, les cibles choisies.
function checkChoiceInterface(run) {
  const locale = getLocale();
  const choose = (zones, extra = {}) => ({ type: "choice", zones, pick: "marble", count: 1, ...extra });
  const made = fabricatedRules({
    plain: { apex: [{ action: "speed", amount: 1 }] },
    anyPocket: { hit: [{ action: "pocket", target: choose(["hand", "triangle"]) }] },
    upToPolish: { hit: [{ action: "polish", amount: 1, target: choose(["triangle"], { count: 2, upTo: true }) }] },
    twoCrack: { hit: [{ action: "crack", amount: 1, target: choose(["triangle"], { count: 2 }) }] },
    booster: { hit: [{ action: "speed", amount: 2, target: choose(["triangle"]) }] },
  });
  const pending = (marble, triangle, hand = []) =>
    made.reduce({ ...emptyBagMarblesGame(made, 2), turn: 2, stage: "play", hand: inHand([marble, ...hand]), triangle }, { type: "place", handIndex: 0, slot: "apex" }).state;
  const cursor = (place, handIndex = 0) => ({ place, handIndex, lastBase: "leftBase" });
  setLocale("fr");

  // Le gorille : la main seule, ses billes éligibles.
  const gorilla = rules.reduce({ ...emptyBagMarblesGame(rules, 2), turn: 2, stage: "play", hand: inHand(["gorilla", "clay", "agate"]), triangle: { leftBase: null, rightBase: null, apex: { marble: "clay", wear: 0 } } }, { type: "place", handIndex: 0, slot: "apex" }).state;
  const handOnly = gorilla.pendingChoice;
  // La question des billes fabriquées, sans nom : ce qui suit le moment.
  const question = (pending, separator = " : ") => plain(describeChoicePrompt(pending, t)).split(separator).slice(1).join(separator);
  run("choix, question : la bille et le moment, puis la main", "Tic de gorille : choisissez une bille de votre main à empocher.", plain(describeChoicePrompt(handOnly, t)));
  run.same("choix, main : les billes éligibles seulement", ["clay", "agate"], choiceHandOptions(handOnly).map((option) => option.marble));
  run.same("choix, main : le curseur s'y ouvre", { place: "hand", handIndex: 0 }, (({ place, handIndex }) => ({ place, handIndex }))(choiceStartCursor(handOnly, cursor("apex"))));
  run("choix, main : la position dans le menu du choix", "agate, normale, usure 3. 2 sur 2", plain(choiceFocusLine(gorilla, cursor("hand", 1), rules, t)));
  run("choix, main seule : pas de triangle", null, stepChoiceCursor(handOnly, cursor("hand"), "up"));
  run.same("choix, main : Entrée répond par la place dans la main", { type: "choose", target: { zone: "hand", index: 1 } }, choiceAnswer(handOnly, cursor("hand", 1)).action);
  run.same("choix, main : la fiche de la bille sous le curseur", "agate", choiceMarbleAt(gorilla, cursor("hand", 1)).marble);

  // Le triangle seul, « jusqu'à 2 » : la question, Terminer, les non éligibles.
  const upTo = pending("upToPolish", { leftBase: { marble: "plain", wear: 1 }, rightBase: null, apex: { marble: "plain", wear: 0 } });
  const upToChoice = upTo.pendingChoice;
  run("choix, question : jusqu'à 2, Terminer annoncé", "choisissez jusqu'à 2 billes actives à polir. T pour terminer.", question(upToChoice));
  run.same("choix, triangle seul : le curseur sur le premier éligible", "leftBase", choiceStartCursor(upToChoice, cursor("hand")).place);
  run("choix, triangle seul : pas de main", null, stepChoiceCursor(upToChoice, cursor("leftBase"), "down"));
  run("choix, triangle : la navigation habituelle", "apex", stepChoiceCursor(upToChoice, cursor("leftBase"), "up").place);
  run("choix, triangle : un emplacement vide reste accessible", "rightBase", stepChoiceCursor(upToChoice, cursor("leftBase"), "right").place);
  run("choix, triangle : non éligible, dit", "base droite : vide. Non éligible.", plain(choiceFocusLine(upTo, cursor("rightBase"), made, t)));
  run.same("choix, triangle : non éligible, bloqué", { refusal: "notEligible" }, choiceAnswer(upToChoice, cursor("rightBase")));
  run.same("choix, triangle : éligible, Entrée répond", { type: "choose", target: { zone: "triangle", slot: "leftBase" } }, choiceAnswer(upToChoice, cursor("leftBase")).action);
  run.same("choix, triangle seul : pas de menu de main", [], choiceHandOptions(upToChoice));
  const afterOne = made.reduce(upTo, { type: "choose", target: { zone: "triangle", slot: "leftBase" } }).state.pendingChoice;
  run("choix, après un : ce qui reste, en mode jusqu'à N", "Vous pouvez choisir encore une bille active, ou terminer avec T.", plain(describeChoicePrompt(afterOne, t)));
  run("choix, après un : la cible choisie n'est plus éligible", true, plain(choiceFocusLine({ ...upTo, pendingChoice: afterOne }, cursor("leftBase"), made, t)).endsWith("usure 1 sur 3. Non éligible."));

  // Obligatoire, 2 : la question, puis ce qui reste.
  const two = pending("twoCrack", { leftBase: { marble: "plain", wear: 0 }, rightBase: { marble: "plain", wear: 0 }, apex: { marble: "plain", wear: 0 } });
  run("choix, question : 2 billes actives", "choisissez 2 billes actives à fêler.", question(two.pendingChoice));
  const oneDone = made.reduce(two, { type: "choose", target: { zone: "triangle", slot: "rightBase" } }).state.pendingChoice;
  run("choix, après un : ce qui reste", "Choisissez encore une bille active.", plain(describeChoicePrompt(oneDone, t)));

  // Un bonus au choix : sa valeur dans la question.
  const boost = pending("booster", { leftBase: { marble: "plain", wear: 0 }, rightBase: null, apex: { marble: "plain", wear: 0 } });
  run("choix, question : un bonus", "choisissez une bille active pour Vitesse +2.", question(boost.pendingChoice));

  // Les deux zones : la main (avec Terminer s'il y a lieu), puis le triangle.
  const both = pending("anyPocket", { leftBase: null, rightBase: null, apex: { marble: "plain", wear: 0 } }, ["plain"]);
  run("choix, question : main ou active", "choisissez une bille de votre main ou active à empocher.", question(both.pendingChoice));
  // Chaque moment : une phase, un Final, une réaction du pot.
  const tigerBase = rules.reduce({ ...emptyBagMarblesGame(rules, 2), turn: 2, stage: "play", triangle: { leftBase: { marble: "tiger", wear: 0 }, rightBase: null, apex: { marble: "clay", wear: 0 } } }, { type: "resolve" }).state;
  run("choix, question : en phase, l'emplacement et la bille", "base gauche, tigrée : choisissez une bille active à éjecter.", plain(describeChoicePrompt(tigerBase.pendingChoice, t)));
  const porcelainFinal = rules.reduce({ ...emptyBagMarblesGame(rules, 2), turn: 2, stage: "play", bag: ["clay"], triangle: { leftBase: { marble: "clay", wear: 0 }, rightBase: null, apex: { marble: "porcelain", wear: 1 } } }, { type: "resolve" }).state;
  run("choix, question : au Final", "Final de porcelaine : choisissez jusqu'à 2 billes actives à polir. T pour terminer.", plain(describeChoicePrompt(porcelainFinal.pendingChoice, t)));
  run("choix, question : en réaction du pot", "Pot, mica : choisissez une bille active à polir.", plain(describeChoicePrompt({ ...two.pendingChoice, action: "polish", count: 1, by: { trigger: "pocketReaction", slot: null, marble: "mica" } }, t)));
  run("choix, question : à l'entrée au pot", true, plain(describeChoicePrompt({ ...two.pendingChoice, by: { trigger: "pocketEntry", slot: null, marble: "porcelain" } }, t)).startsWith("Entrée au pot de porcelaine : choisissez"));
  run("choix, deux zones : de la main vers le triangle", "leftBase", stepChoiceCursor(both.pendingChoice, cursor("hand"), "up").place);
  run("choix, deux zones : du triangle vers la main", "hand", stepChoiceCursor(both.pendingChoice, cursor("leftBase"), "down").place);
  // Deux zones, mais plus aucune bille éligible en main (aucune au départ, ou la
  // dernière déjà choisie) : le curseur n'entre jamais dans une main sans option.
  const triangleLeft = { ...both.pendingChoice, eligible: both.pendingChoice.eligible.filter((target) => target.zone === "triangle") };
  run("choix, deux zones, main sans option : le curseur s'ouvre sur le triangle", "apex", choiceStartCursor(triangleLeft, cursor("hand")).place);
  run("choix, deux zones, main sans option : on n'y descend pas", false, ["leftBase", "rightBase"].some((slot) => stepChoiceCursor(triangleLeft, cursor(slot), "down")?.place === "hand"));
  run("choix, deux zones, main sans option : après une réponse, le curseur la quitte", "apex", choiceCursorAfterAnswer(triangleLeft, cursor("hand")).place);
  run("choix, deux zones, après une réponse : le curseur reste là où il a des options", "hand", choiceCursorAfterAnswer(both.pendingChoice, cursor("hand")).place);

  // « Terminer » en fin de menu de la main, en mode « jusqu'à N ».
  const upToHand = { ...handOnly, upTo: true };
  run.same("choix, main, jusqu'à N : Terminer en dernier", ["marble", "marble", "finish"], choiceHandOptions(upToHand).map((option) => option.kind));
  run("choix, main, jusqu'à N : Terminer dit", "Terminer. 3 sur 3", plain(choiceFocusLine({ ...gorilla, pendingChoice: upToHand }, cursor("hand", 2), rules, t)));
  run.same("choix, main, jusqu'à N : Terminer répond", { type: "choose", done: true }, choiceAnswer(upToHand, cursor("hand", 2)).action);
  run("choix, Terminer : aucune fiche", null, choiceMarbleAt({ ...gorilla, pendingChoice: upToHand }, cursor("hand", 2)));

  // Les cibles choisies se disent, accord compris ; la fin, quand elle n'est pas d'avoir
  // fait les N choix ; rien à choisir.
  run("choix, dit : une bille choisie", "agate choisie.", plain(t("marbles.choice.chosen", { marble: nameRef("marble.agate.name") })));
  run("choix, dit : un gorille choisi", "gorille choisi.", plain(t("marbles.choice.chosen", { marble: nameRef("marble.gorilla.name") })));
  run(
    "choix, dit : la réponse du gorille",
    "agate choisie. agate est mise en poche.",
    plain(stepsText(buildSteps(rules.reduce(gorilla, { type: "choose", target: { zone: "hand", index: 1 } }).events, t)))
  );
  run("choix, dit : Terminer", "Choix terminé.", plain(stepsText(buildSteps(made.reduce(upTo, { type: "choose", done: true }).events, t))));

  setLocale("en");
  run("choix, anglais : la main", "Hit of gorilla: choose a marble from your hand to pocket.", describeChoicePrompt(handOnly, t));
  run("choix, anglais : jusqu'à 2", "choose up to 2 active marbles to polish. T to finish.", question(upToChoice, ": "));
  run("choix, anglais : en phase", "left base, tiger: choose an active marble to eject.", describeChoicePrompt(tigerBase.pendingChoice, t));
  run("choix, anglais : ce qui reste", "Still to choose: an active marble.", describeChoicePrompt(oneDone, t));
  run("choix, anglais : non éligible", "right base: empty. Not eligible.", choiceFocusLine(upTo, cursor("rightBase"), made, t));
  setLocale(locale);
}

// La touche P : le pot et les billes perdues, accords compris.
function checkPotStatus(run) {
  const locale = getLocale();
  const game = (pot, lost) => ({ ...rules.createGame(1), pot, lost });
  setLocale("fr");
  run("touche P : vide", "0 bille sur 3 dans le pot, 0 bille perdue.", plain(describePot(game([], []), t)));
  run("touche P : une de chaque", "1 bille sur 3 dans le pot, 1 bille perdue.", plain(describePot(game(["clay"], ["glass"]), t)));
  run("touche P : pluriels", "3 billes sur 3 dans le pot, 2 billes perdues.", plain(describePot(game(["clay", "glass", "agate"], ["mica", "tiger"]), t)));
  run("Maj+P : le titre du menu", "Pot", t("marbles.pile.pot"));
  setLocale("en");
  run("touche P, anglais", "2 marbles of 3 in the pot, 1 lost marble.", plain(describePot(game(["clay", "glass"], ["mica"]), t)));
  setLocale(locale);
}

function checkBagOrder(run) {
  // L'ordre affiché ne dépend que du contenu : deux ordres de pioche, une liste.
  const bag = ["tiger", "clay", "giant", "agate", "clay"];
  run.same("sac : l'ordre affiché ne dépend pas de l'ordre de pioche", bagDisplayOrder(bag, t), bagDisplayOrder([...bag].reverse(), t));
  run.same("sac : rien de perdu, doublons compris", [...bag].sort(), [...bagDisplayOrder(bag, t)].sort());
  const original = [...bag];
  bagDisplayOrder(bag, t);
  run.same("sac : la liste reçue n'est pas touchée", original, bag);

  // Sur les vraies parties : une graine, un ordre de pioche, jamais révélé.
  const previousLocale = getLocale();
  try {
    setLocale("fr");
    run.same("sac : alphabétique sur le nom dit", ["agate", "clay", "clay", "giant", "tiger"], bagDisplayOrder(bag, t));
    const order = (seed) => bagDisplayOrder(rules.createGame(seed).bag, t).join();
    run("sac : même liste quelle que soit la graine", order(1), order(2));
    run("sac : deux graines, deux vrais ordres de pioche", false, rules.createGame(1).bag.join() === rules.createGame(2).bag.join());
  } finally {
    setLocale(previousLocale);
  }

  // Consulter ne change rien à la partie : même journal, même état, générateur
  // compris, que les menus aient été ouverts ou non.
  const plainGame = playWithLookups(21, () => {});
  const looked = playWithLookups(21, (state) => {
    Object.freeze(state);
    Object.freeze(state.bag);
    Object.freeze(state.discard);
    bagDisplayOrder(state.bag, t);
    describeBag(state, t);
    describeDiscard(state, t);
    for (const marble of [...state.bag, ...state.discard]) marbleCard(marble, "x", rules, t);
  });
  run.same("sac : consulter ne change pas le journal", plainGame.journal, looked.journal);
  run.same("sac : consulter ne change pas l'état final", plainGame.state, looked.state);
  run("sac : la partie comparée pioche bien", true, plainGame.journal.some((event) => event.type === "draw"));

  // La défausse : l'ordre d'arrivée, celui que tient l'état.
  let state = { ...emptyBagMarblesGame(rules, 1), turn: 2, stage: "play", hand: inHand(["clay", "glass", "agate"]) };
  state = { ...state, triangle: { leftBase: { marble: "porcelain", wear: 0 }, rightBase: { marble: "tiger", wear: 0 }, apex: { marble: "giant", wear: 0 } } };
  for (const slot of ["apex", "leftBase", "rightBase"]) state = answerChoices(rules, rules.reduce(state, { type: "place", handIndex: 0, slot })).state;
  run.same("défausse : de la plus ancienne à la plus récente", ["giant", "porcelain", "tiger"], state.discard);
}

// Les sons : profils, repères d'un geste et leur ligne de temps, file de sons.
// Rien n'est joué : on vérifie QUAND chaque son partirait.
function checkSounds(run) {
  // Le son suit le calibre : un profil par calibre, aucun champ sonore par bille.
  run("profils : chaque calibre a son profil", true, Object.keys(MARBLE_SIZES).every((size) => Object.hasOwn(MARBLE_SOUND_PROFILES, size)));
  run("profils : les réglages du jeu sont valides", false, throws(() => validateMarbleSounds(MARBLE_SIZES, MARBLE_SOUND_PROFILES, MARBLES_SETTINGS)));
  run("profils : calibre sans profil refusé", true, throws(() => validateMarbleSounds(MARBLE_SIZES, { [SMALL]: MARBLE_SOUND_PROFILES[SMALL] }, MARBLES_SETTINGS)));
  run("profils : profil sans chute refusé", true, throws(() => validateMarbleSounds({ [SMALL]: "small" }, { [SMALL]: { beacon: "a" } }, MARBLES_SETTINGS)));
  run("profils : plus aucun champ sonore sur une bille", true, Object.values(MARBLE_TYPES).every((type) => !Object.hasOwn(type, "sound")));
  run(
    "profils : le son d'une bille est celui de son calibre",
    "assets/sounds/marbles/marble_large_1_beacon assets/sounds/marbles/marble_small_1_beacon",
    [MARBLE_SOUND_PROFILES[MARBLE_TYPES.giant.size].beacon, MARBLE_SOUND_PROFILES[MARBLE_TYPES.porcelain.size].beacon].join(" ")
  );
  run("collision : réglages du jeu valides", false, throws(() => validateCollision(MARBLES_COLLISION)));
  run("collision : écart négatif refusé", true, throws(() => validateCollision({ ...MARBLES_COLLISION, flamMs: -1 })));
  run("collision : calibre sans poids refusé", true, throws(() => validateCollision({ ...MARBLES_COLLISION, weights: { [SMALL]: 1, [LARGE]: 3 } })));
  run("collision : poids nul refusé", true, throws(() => validateCollision({ ...MARBLES_COLLISION, weights: { ...MARBLES_COLLISION.weights, [MEDIUM]: 0 } })));
  // Comme avant pour des tailles équivalentes : poids 1, 2, 3, exposant 0,3.
  run(
    "collision : un calot sur une minibille, 1,39 ; l'inverse, 0,72 ; même calibre, 1",
    "1.39 0.72 1",
    [
      collisionStrength("giant", "porcelain"),
      collisionStrength("porcelain", "giant"),
      collisionStrength("giant", "leaded"),
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

  const settings = { shuffleToDrawMs: 900, drawSoundIntervalMs: 350, swapSoundDelayMs: 150 };
  const draws = ["clay", "glass", "giant"].map((marble) => ({ type: "draw", marble }));
  run.same(
    "repères : ouverture, le brassage puis une balise après l'autre",
    [
      { atMs: 0, sound: "shuffle" },
      { atMs: 900, sound: "beacon", marble: "clay" },
      { atMs: 1250, sound: "beacon", marble: "glass" },
      { atMs: 1600, sound: "beacon", marble: "giant" },
    ],
    eventCues([{ type: "turnStarted", turn: 1, turnCount: 9 }, ...draws], { shuffleFirst: true }, settings)
  );
  run.same(
    "repères : une pioche sans brassage part aussitôt",
    [0, 350],
    eventCues(draws.slice(0, 2), {}, settings).map((cue) => cue.atMs)
  );
  run.same(
    "repères : sac régénéré, le brassage avant la pioche",
    ["shuffle@0", "beacon@900"],
    eventCues([{ type: "bagRegenerated", size: 4 }, draws[0]], {}, settings).map((cue) => `${cue.sound}@${cue.atMs}`)
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
  const motion = { rolls, places };
  const placeName = (place) => place.slot ?? place.kind;
  const rolled = (cues) =>
    cues.map((cue) =>
      cue.sound === "roll"
        ? `roll ${cue.marble} ${cue.path.map(placeName).join(">")} @${cue.atMs}+${Math.round(cue.durationMs)}`
        : `${cue.sound} ${cue.marble}${cue.struck ? `>${cue.struck}` : ""} ${placeName(cue.place)} @${Math.round(cue.atMs)}${cue.gain === undefined ? "" : ` x${cue.gain}`}`
    );
  run.same(
    "repères : une pose, la bille roule de la main à l'emplacement, puis y tombe",
    ["roll agate hand>apex @0+1000", "drop agate apex @1000"],
    rolled(eventCues([{ type: "placed", slot: "apex", marble: "agate" }], { placeFrom: handPlace(1, 3) }, settings, motion))
  );
  run.same(
    "repères : une pose part de la place de la bille dans la main",
    handPlace(4, 5),
    eventCues([{ type: "placed", slot: "apex", marble: "agate" }], { placeFrom: handPlace(4, 5) }, settings, motion)[0].path[0]
  );
  run.same(
    "repères : sans place connue, la pose part du milieu de la main",
    { x: 0, y: 0 },
    positionOf(eventCues([{ type: "placed", slot: "apex", marble: "agate" }], {}, settings, motion)[0].path[0], places)
  );
  // Remplacement, dans l'ordre du journal : l'éjection, le retrait, la défausse,
  // la pose, le tic. La bille posée est tirée (deux fois plus vite ici) ; la
  // collision attend son arrivée, à la force du choc (une grosse, poids 2, sur une
  // petite, poids 1 : 2) ; la délogée part 30 ms après, lancée deux fois plus vite.
  // L'écart entre les deux sons de la collision se programme à la lecture.
  const knockedOut = { slot: "apex", marble: "mica" };
  const replacement = [
    { type: "knockout", ...knockedOut },
    { type: "removed", ...knockedOut, cause: "replacement" },
    { type: "discarded", ...knockedOut, cause: "replacement" },
    { type: "placed", slot: "apex", marble: "agate" },
    { type: "hit", slot: "apex", marble: "agate" },
  ];
  const collisionMotion = {
    ...motion,
    collision: { flamMs: 10, weights: { [SMALL]: 1, [LARGE]: 2 }, weightExponent: 1 },
    types: { agate: { size: LARGE }, mica: { size: SMALL } },
  };
  run.same(
    "repères : un remplacement, la bille tirée, la collision des deux billes, puis la délogée lancée à la défausse",
    [
      "roll agate hand>apex @0+500",
      "collision agate>mica apex @500 x2",
      "roll mica apex>discard @530+500",
      "drop mica discard @1030",
    ],
    rolled(eventCues(replacement, {}, settings, collisionMotion))
  );
  run.same(
    "repères : la bille qui frappe est tirée, celle qui se pose ne l'est pas",
    ["strike", "place"],
    [
      eventCues(replacement, {}, settings, collisionMotion)[0].style,
      eventCues([{ type: "placed", slot: "apex", marble: "agate" }], {}, settings, collisionMotion)[0].style,
    ]
  );
  run(
    "repères : la délogée part à la défausse en style knocked, l'usée en style out",
    "knocked out",
    [
      eventCues(replacement, {}, settings, collisionMotion).find((cue) => cue.marble === "mica" && cue.sound === "roll").style,
      eventCues([{ type: "discarded", slot: "apex", marble: "mica", cause: "wear" }], {}, settings, collisionMotion)[0].style,
    ].join(" ")
  );
  // Échange : la bille choisie (en `a` avant l'échange, en `b` après), puis l'autre.
  const swapped = { type: "swapped", a: "leftBase", b: "rightBase" };
  run.same(
    "repères : un échange, la bille choisie roule puis l'autre, chacune tombe à l'arrivée",
    ["roll giant leftBase>rightBase @0+800", "drop giant rightBase @800", "roll mica rightBase>leftBase @150+800", "drop mica leftBase @950"],
    rolled(
      eventCues([swapped], { triangleAfter: { leftBase: { marble: "mica", wear: 0 }, rightBase: { marble: "giant", wear: 1 }, apex: null } }, settings, motion)
    )
  );
  run.same(
    "repères : un déplacement vers un vide, une seule bille roule, aussitôt",
    ["roll giant leftBase>rightBase @0+800", "drop giant rightBase @800"],
    rolled(eventCues([swapped], { triangleAfter: { leftBase: null, rightBase: { marble: "giant", wear: 0 }, apex: null } }, settings, motion))
  );
  run.same(
    "repères : les billes usées roulent à la défausse l'une après l'autre",
    ["roll clay apex>discard @0+1000", "drop clay discard @1000", "roll tiger apex>discard @200+1000", "drop tiger discard @1200"],
    rolled(
      eventCues(
        ["clay", "tiger"].flatMap((marble) => [
          { type: "removed", slot: "apex", marble, cause: "wear" },
          { type: "discarded", slot: "apex", marble, cause: "wear" },
        ]),
        {},
        settings,
        motion
      )
    )
  );
  // Rotation : chaque bille roule vers l'emplacement suivant, toutes ensemble ; un
  // emplacement vide reste muet. Les chutes, plus discrètes, à l'arrivée.
  const rotation = (triangle) => ({ type: "rotation", triangle });
  run.same(
    "repères : une rotation, les billes tournent ensemble, puis se calent",
    [
      "roll clay leftBase>apex @0+700",
      "drop clay apex @700 x0.5",
      "roll tiger rightBase>leftBase @0+700",
      "drop tiger leftBase @700 x0.5",
      "roll mica apex>rightBase @0+700",
      "drop mica rightBase @700 x0.5",
    ],
    rolled(
      eventCues(
        [rotation({ apex: { marble: "clay", wear: 1 }, rightBase: { marble: "mica", wear: 1 }, leftBase: { marble: "tiger", wear: 1 } })],
        {},
        settings,
        motion
      )
    )
  );
  run.same(
    "repères : une rotation avec un seul emplacement occupé, une seule bille tourne",
    ["roll giant rightBase>leftBase @0+700", "drop giant leftBase @700 x0.5"],
    rolled(eventCues([rotation({ apex: null, rightBase: null, leftBase: { marble: "giant", wear: 0 } })], {}, settings, motion))
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
    [{ atMs: 0, sound: "beacon", marble: "clay", place: slotPlace("apex") }],
    eventCues([{ type: "phase", slot: "apex", marble: "clay" }], {}, settings)
  );

  // Stéréo : chaque bille piochée s'entend à sa place dans la main, de gauche à
  // droite ; les places rendent leur panoramique.
  run.same(
    "repères : les billes piochées, les dernières de la main, dans l'ordre",
    [handPlace(3, 5), handPlace(4, 5)],
    eventCues(draws.slice(0, 2), { handAfter: ["agate", "mica", "tiger", "clay", "glass"] }, settings).map((cue) => cue.place)
  );
  run("repères : sans main connue, la pioche au centre", undefined, eventCues(draws.slice(0, 1), {}, settings)[0].place);
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
    placesDemoCues("clay").map((cue) => `${cue.place.slot ?? cue.place.kind}@${cue.atMs}`)
  );
  run.same("repères : une phase sur un emplacement vide reste muette", [], eventCues([{ type: "phaseSkipped", slot: "apex" }], {}, settings));

  // La file : les immédiats aussitôt, les autres à leur échéance, dans l'ordre.
  let queue = enqueueCues(EMPTY_SOUND_QUEUE, eventCues(draws, { shuffleFirst: true }, settings));
  const step = (deltaMs) => {
    const result = advanceSoundQueue(queue, deltaMs);
    queue = result.queue;
    return result.due.map((cue) => cue.marble ?? cue.sound);
  };
  run.same("file : l'immédiat part aussitôt", ["shuffle"], step(0));
  run.same("file : rien avant l'échéance", [], step(899));
  run.same("file : la première balise à son échéance", ["clay"], step(1));
  run.same("file : une longue absence rend tout ce qui est dû, dans l'ordre", ["glass", "giant"], step(5000));
  run("file : vide une fois tout joué", 0, queue.length);

  // La main au moment d'une étape : ce que chaque évènement y fait entrer ou sortir.
  run(
    "main d'une étape : pioche +1, pose et mise en poche depuis la main −1, ailleurs rien",
    0,
    handSizeChange([
      { type: "draw", marble: "clay", cause: "effect" },
      { type: "draw", marble: "glass", cause: "effect" },
      { type: "placed", slot: "apex", marble: "agate" },
      { type: "pocketed", marble: "mica", from: "hand", index: 0 },
      { type: "pocketed", marble: "clay", from: "triangle", slot: "apex" },
    ])
  );
  // Une pioche dite à une étape où la main compte 2 billes, même si la main finale en
  // compte 4 : sa balise est à la dernière place d'une main de 2.
  const midDraw = eventCues([{ type: "draw", marble: "clay", cause: "effect" }], { handAfter: [{}, {}, {}, {}], handSize: 2 });
  run.same("pioche d'une étape : placée dans la main de ce moment", handPlace(1, 2), midDraw.find((cue) => cue.sound === "beacon").place);
}

export default function checkMarblesView(run) {
  const { events, state } = sampleEvents();
  const seenTypes = [...new Set(events.map((event) => event.type))].sort();

  run.same("sons : un point d'accroche par évènement du journal", Object.keys(MARBLE_EVENT_CUES).sort(), seenTypes);
  checkSounds(run);
  checkCards(run);
  checkBagOrder(run);
  checkTallyMenu(run);
  checkKeywords(run);
  checkPotStatus(run);
  checkChoiceInterface(run);
  checkHelpMenu(run);
  run("narration : évènement inconnu refusé", true, throws(() => buildSteps([{ type: "nope" }], (key) => key)));

  // Le découpage en étapes : tous les évènements, chacun une fois, dans l'ordre.
  run.same("étapes : aucun évènement perdu", events, buildSteps(events, (key) => key).flatMap((step) => step.events));
  // Un sac sans Éveil : les pioches se disent en une liste, et seulement elles.
  const turn = rules.createGame(4, { bag: ["clay", "glass", "agate", "porcelain", "gorilla", "stoneware"] });
  const drawn = rules.reduce(turn, { type: "draw" });
  run.same(
    "étapes : la pioche, puis le début de tour",
    ["marbles.event.draw", "marbles.event.turn_started"],
    buildSteps(drawn.events, (key) => key).map((step) => step.text)
  );

  const previousLocale = getLocale();
  try {
    for (const locale of Object.keys(LOCALE_TABLES)) {
      setLocale(locale);
      const missingNames = Object.keys(MARBLE_TYPES).filter((id) => !Object.hasOwn(LOCALE_TABLES[locale], `marble.${id}.name`));
      run.same(`${locale} : chaque bille a son nom`, [], missingNames);
      const orphanNames = Object.keys(LOCALE_TABLES[locale])
        .filter((key) => key.startsWith("marble."))
        .filter((key) => !Object.hasOwn(MARBLE_TYPES, key.split(".")[1]));
      run.same(`${locale} : aucun nom sans bille`, [], orphanNames);
      const missingErrors = MARBLE_ERRORS.filter((code) => !Object.hasOwn(LOCALE_TABLES[locale], `marbles.error.${code}`));
      run.same(`${locale} : chaque refus a son texte`, [], missingErrors);
      run(`${locale} : la fin de partie a son texte`, true, Object.hasOwn(LOCALE_TABLES[locale], "marbles.event.game_over"));
      const missingTriggerTexts = MARBLE_TRIGGERS.flatMap((trigger) => Object.values(trigger.texts)).filter((key) => !Object.hasOwn(LOCALE_TABLES[locale], key));
      run.same(`${locale} : chaque déclencheur a ses textes`, [], missingTriggerTexts);
      const missingSourceTexts = Object.values(AMOUNT_SOURCES).map((source) => source.text).filter((key) => !Object.hasOwn(LOCALE_TABLES[locale], key));
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

      const dirtySteps = buildSteps(events, t).map((step) => step.text).filter((text) => !isClean(text));
      run.same(`${locale} : chaque étape du journal se dit`, [], dirtySteps.slice(0, 3));

      const emptyTriangle = { leftBase: null, rightBase: null, apex: null };
      const ids = Object.keys(MARBLE_TYPES);
      const lines = [
        describeTurn(state, true, t),
        describeTurn(state, false, t),
        describeBag(state, t),
        describeDiscard(state, t),
        describeTurn({ ...state, speed: -3, mass: -1 }, true, t),
        stepsText(buildSteps([{ type: "impact", speed: -3, mass: -1, impact: 0, score: 0 }], t)),
        describeHandFocus({ ...state, hand: inHand([]) }, 0, rules, t),
        // Chaque champ de chaque fiche, et le repli.
        ...ids.flatMap((id) => {
          const card = marbleCard(id, "x", rules, t);
          return [...card.above, ...card.below];
        }),
        ...ids.map((id) => describeHandFocus({ ...state, hand: inHand([id]) }, 0, rules, t)),
        ...SLOTS.map((slot) => describeSlotFocus({ ...state, triangle: emptyTriangle }, slot, rules, t)),
        ...SLOTS.map((slot) => describeSlotForPlacement({ ...state, triangle: emptyTriangle }, slot, rules, t)),
        ...ids.flatMap((id) =>
          SLOTS.flatMap((slot) => {
            const game = { ...state, triangle: { ...emptyTriangle, [slot]: { marble: id, wear: 1 } } };
            return [describeSlotFocus(game, slot, rules, t), describeSlotForPlacement(game, slot, rules, t)];
          })
        ),
        // Chaque bille posée, sur un vide et en remplaçant chaque bille : toutes
        // les formes de nom demandées par les gabarits.
        ...ids.flatMap((id) =>
          ids.flatMap((old) =>
            placementLines({ ...state, turn: 2, hand: inHand([id]), triangle: { ...emptyTriangle, apex: { marble: old, wear: 0 } } }, 0, "apex", rules, t).map(({ key, params }) => t(key, params))
          )
        ),
        ...ids.flatMap((id) => placementLines({ ...state, turn: 2, hand: inHand([id]), triangle: emptyTriangle }, 0, "leftBase", rules, t).map(({ key, params }) => t(key, params))),
        t("marbles.zone.hand"),
        t("marbles.zone.triangle"),
        t("marbles.place.menu_title"),
        t("marbles.pile.bag"),
        t("marbles.pile.discard"),
        t("marbles.pile.back"),
      ];
      run.same(`${locale} : chaque ligne du curseur se dit`, [], lines.filter((text) => !isClean(text)).slice(0, 3));

      run(`${locale} : aucun effet`, t("marbles.effect.none"), describeEffect({}, t));
      run(`${locale} : point final du nom de zone, pour la pause`, true, t("marbles.zone.hand").endsWith(".") && t("marbles.zone.triangle").endsWith("."));
    }

    // Ce que le joueur entend, en français (espaces insécables à part, voir plain).
    setLocale("fr");
    const said = (text) => plain(text);
    run("texte : effet positif", "Vitesse +4", said(describeEffect({ speed: 4 }, t)));
    run("texte : effet négatif, vrai signe moins collé au nombre", "Vitesse −3", said(describeEffect({ speed: -3 }, t)));
    run("texte : Masse négative", "Masse −2", said(describeEffect({ mass: -2 }, t)));
    run("texte : compteur négatif", "−3", formatCounter(-3));
    run("texte : compteur positif", "3", formatCounter(3));
    run(
      "texte : effet de phase négatif",
      "pointe, plombée : Vitesse −3.",
      said(stepsText(buildSteps([{ type: "phase", slot: "apex", marble: "leaded" }, { type: "effect", trigger: "phase", slot: "apex", marble: "leaded", speedDelta: -3, massDelta: 0, given: [], speed: -3, mass: 1 }], t)))
    );
    run("texte : deux effets", "Vitesse +1 et Masse +2", said(describeEffect({ speed: 1, mass: 2 }, t)));
    run("texte : effet donné", "Vitesse +4 à la pointe", said(describeEffect({ speed: 0, mass: 0, given: [{ slot: "apex", marble: "gorilla", speed: 4, mass: 0 }] }, t)));
    run(
      "texte : effet imprimé de la loupe",
      "Vitesse +4 à la pointe si son effet de pointe donne au moins Vitesse +1",
      said(describePrinted(MARBLE_TYPES.magnifier.baseVariant.leftBase, cardSituation("magnifier"), t))
    );
    run("texte : Impact", "Impact 6. Score 14.", said(stepsText(buildSteps([{ type: "impact", speed: 3, mass: 2, impact: 6, score: 14 }], t))));

    // Annonces principales : courtes, le détail est dans la fiche.
    const holding = { ...state, hand: inHand(["clay", "cats_eye", "gorilla"]) };
    run("texte : bille en main", "argile, normale, usure 3. 1 sur 3", said(describeHandFocus(holding, 0, rules, t)));
    run("texte : usure maximale propre", "géante, calot, usure 1. 2 sur 5", said(describeMarbleInList("giant", 1, 5, rules, t)));

    const lensed = {
      ...state,
      stage: "play",
      turn: 2,
      speed: 0,
      mass: 1,
      hand: inHand(["clay", "agate", "glass"]),
      throwsUsed: 1,
      triangle: { leftBase: { marble: "magnifier", wear: 0 }, rightBase: null, apex: { marble: "gorilla", wear: 1 } },
    };
    run("texte : bille active", "gorille, calot, pointe, usure 1 sur 3.", said(describeSlotFocus(lensed, "apex", rules, t)));
    run("texte : emplacement vide", "base droite : vide.", said(describeSlotFocus(lensed, "rightBase", rules, t)));
    // Pendant une pose, la prévision reste.
    run("texte : pose, emplacement occupé", "pointe, gorille : Vitesse +10.", said(describeSlotForPlacement(lensed, "apex", rules, t)));
    run("texte : pose, emplacement vide", "base droite", said(describeSlotForPlacement(lensed, "rightBase", rules, t)));

    // S et D : les nombres et leurs accords.
    const counts = (bag, discard, drawPerTurn = 1) => ({ ...state, bag: Array(bag).fill("clay"), discard: Array(discard).fill("clay"), drawPerTurn });
    run("texte : sac, pluriel", "Encore 8 billes dans le sac, 1 bille à piocher en début de tour.", said(describeBag(counts(8, 0), t)));
    run("texte : sac, une bille", "Encore 1 bille dans le sac, 1 bille à piocher en début de tour.", said(describeBag(counts(1, 0), t)));
    run("texte : sac vide", "Encore 0 bille dans le sac, 1 bille à piocher en début de tour.", said(describeBag(counts(0, 0), t)));
    run("texte : sac, pioche en vigueur", "Encore 8 billes dans le sac, 2 billes à piocher en début de tour.", said(describeBag(counts(8, 0, 2), t)));
    run("texte : défausse, pluriel", "3 billes dans la défausse.", said(describeDiscard(counts(0, 3), t)));
    run("texte : défausse, une bille", "1 bille dans la défausse.", said(describeDiscard(counts(0, 1), t)));
    run("texte : défausse vide", "0 bille dans la défausse.", said(describeDiscard(counts(0, 0), t)));

    // Confirmation d'une pose : structure et texte exacts.
    const menuLines = (handIndex, slot) => placementLines(lensed, handIndex, slot, rules, t).map(({ key, params }) => said(t(key, params)));
    run.same(
      "confirmation sur vide : la question, les valeurs prévues, puis la Chiquenaude",
      ["Poser argile en base droite ?", "Vitesse +1", "Chiquenaude d'argile : aucun effet", "Pot : aucun effet"],
      menuLines(0, "rightBase")
    );
    run.same(
      "confirmation sur occupé : dans l'ordre réel, élision comprise, bonus reçu compté",
      ["Poser argile en pointe ?", "Vitesse +8", "Chiquenaude d'argile : aucun effet", "Éjection de gorille : Vitesse +3", "Tic d'argile : Vitesse +2", "Pot : aucun effet"],
      menuLines(0, "apex")
    );
    run.same(
      "confirmation : aucun effet dit, même structure ; un Polissage au choix chez qui le produit, selon votre choix",
      ["Poser verre en base gauche ?", "Masse +1", "Chiquenaude de verre : aucun effet", "Éjection de loupe : Vitesse +3", "Tic de verre : Polissage 1 à une bille active au choix, selon votre choix", "Pot : aucun effet"],
      menuLines(2, "leftBase")
    );
    // Les valeurs prévues au format de R : ce que la loupe donne s'entend chez le
    // gorille, pas chez elle.
    // Aucune chiquenaude encore ce tour : celle de la loupe se compte elle-même.
    const lensToPlace = { ...lensed, hand: inHand(["magnifier"]), triangle: { ...lensed.triangle, leftBase: null }, tally: emptyTally(TALLY_COUNTERS) };
    run.same(
      "confirmation : valeurs produites seulement, sans bonus donné",
      ["Poser loupe en base gauche ?", "aucun effet", "Chiquenaude de loupe : Vitesse +2", "Pot : aucun effet"],
      placementLines(lensToPlace, 0, "leftBase", rules, t).map(({ key, params }) => said(t(key, params)))
    );
    // Le menu entier : question, valeurs, Chiquenaude, Éjection, Tic, le pot, puis
    // Annuler avant Confirmer ; seules ces deux-là agissent.
    const entries = confirmationEntries(() => {}, placementLines(lensed, 0, "apex", rules, t));
    run.same(
      "confirmation : ordre complet du menu sur occupé",
      ["marbles.place.question", "marbles.place.values", "marbles.place.flick", "marbles.place.knockout", "marbles.place.hit", "marbles.place.pot", "menu.confirm.cancel", "menu.confirm.confirm"],
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
      "Chiquenaude d'argile : aucun effet. Vitesse 0, Masse 1. Éjection de gorille : Vitesse +3. Vitesse 3, Masse 1. Défausse : gorille. Pose : argile en pointe. Tic d'argile : Vitesse +2. Vitesse 5, Masse 1.",
      said(stepsText(buildSteps(placing.events, t)))
    );
    const lensedSteps = buildSteps(rules.reduce(lensed, { type: "resolve" }).events, t).map((step) => said(step.text));
    run("texte : la loupe ne produit rien elle-même", "base gauche, loupe : aucun effet.", lensedSteps[0]);
    run("texte : le bonus s'entend chez qui le reçoit", "pointe, gorille : Vitesse +10.", lensedSteps[2]);
    run.same("étapes : aucune étape silencieuse", [], buildSteps(events, t).filter((step) => step.text === ""));
    run(
      "texte : le tour, compteurs compris",
      "Tour 2 sur 10. Score 5. Vitesse 5, Masse 2. 4 lancers restants. Échange disponible.",
      said(describeTurn({ ...lensed, score: 5, speed: 5, mass: 2 }, true, t))
    );

    // Anglais : les mêmes lignes, sans forme de nom à demander.
    setLocale("en");
    run.same(
      "anglais : confirmation sur occupé",
      ["Place clay on the apex?", "Speed +8", "Flick of clay: no effect", "Knockout of gorilla: Speed +3", "Hit from clay: Speed +2", "Pot: no effect"],
      placementLines(lensed, 0, "apex", rules, t).map(({ key, params }) => t(key, params))
    );
    run("anglais : bille en main", "clay, standard, wear 3. 1 of 3", describeHandFocus(holding, 0, rules, t));
    run("anglais : bille active", "gorilla, boulder, apex, wear 1 of 3.", describeSlotFocus(lensed, "apex", rules, t));
    run("anglais : effet négatif", "Speed −3", describeEffect({ speed: -3 }, t));
    run("anglais : sac, une bille", "1 marble left in the bag, 1 marble to draw at the start of the turn.", describeBag({ ...state, bag: ["clay"], drawPerTurn: 1 }, t));
    run("anglais : sac vide", "0 marbles left in the bag, 1 marble to draw at the start of the turn.", describeBag({ ...state, bag: [], drawPerTurn: 1 }, t));
    run("anglais : défausse", "2 marbles in the discard.", describeDiscard({ ...state, discard: ["clay", "glass"] }, t));
    run.same("anglais : fiche", ["Apex: Speed +4.", "Base: Speed +1."], marbleCard("clay", "x", rules, t).above);
    run("anglais : montant calculé", "Flick: Speed +1 per turn in hand, maximum +5, currently +2.", marbleCard("clay", "x", rules, t, { turnsInHand: 2 }).below[0]);
  } finally {
    setLocale(previousLocale);
  }

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
  const marble = { marble: "clay", wear: 0 };
  const start = (leftBase, rightBase, apex) => placementStart({ leftBase, rightBase, apex }, SLOTS);
  run("sélection : tout vide, base gauche", "leftBase", start(null, null, null));
  run("sélection : premier vide, base droite", "rightBase", start(marble, null, null));
  run("sélection : seule la pointe est vide", "apex", start(marble, marble, null));
  run("sélection : base gauche avant pointe", "leftBase", start(null, marble, null));
  run("sélection : tout occupé, base gauche", "leftBase", start(marble, marble, marble));
}
