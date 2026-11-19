// Vérifications du core — domaine « marbles-conditions ». Les CONDITIONS d'une clause
// du jeu des billes (marbles/core/effects.js/CONDITIONS, doc/marbles.md, « Conditions »)
// qui ne relèvent pas d'un autre domaine : le SINON (`otherwise`, une chaîne de clauses
// de remplacement), la NÉGATION (`not`), la bille précise d'un emplacement (marbleAt) et
// le filtre « bille » (marbleIs), l'emplacement vide ou occupé (slotIs), le calibre
// d'une bille d'un remplacement (replacementSize), un nombre comparé à une borne
// (count) et les compteurs du tour (stat) : leur validation, leur jeu, leurs textes
// (clés, puis un témoin dans chaque vraie langue) et la prévision. Les conditions de
// zone : domaine marbles-zones ; de famille et de rareté : marbles-families. Sur des
// billes fabriquées. Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js marbles-conditions`).

import { throws } from "../../lib/check.js";
import { nameRef, getLocale, setLocale, t as realT } from "../../data/i18n/index.js";
import { LARGE, MEDIUM, SMALL } from "../config/values.js";
import {
  NEXT_SLOT,
  PREVIOUS_SLOT,
  allActive,
  count,
  crack,
  eject,
  familyAt,
  familyIs,
  marbleAt,
  marbleIs,
  not,
  orElse,
  pocket,
  replacementSize,
  sizeIs,
  slotIs,
  speed,
  mass,
  statIs,
  tally,
  turnsInHand,
  zoneCount,
  familyCount,
} from "../content/effects.js";
import { conditionHolds } from "../core/effects.js";
import { validateMarbleTypes } from "../core/validation.js";
import { describePrinted } from "../view/narration/effects.js";
import { marbleCard } from "../view/card.js";
import { caughtMessage, fabricatedRules, forecastMatches, inHand, keyText as t, marblesPlayState, mustReduce, placed, validateTable, withSizes } from "./helpers.js";

export default function checkMarblesConditions(run) {
  run.section("sinon", checkOtherwise);
  run.section("négation", checkNegation);
  run.section("bille précise", checkMarbleConditions);
  run.section("emplacement vide ou occupé", checkSlotIs);
  run.section("calibre d'un remplacement", checkReplacementSize);
  run.section("nombre comparé à une borne", checkCount);
  run.section("compteurs du tour", checkStat);
  run.section("témoin, vraies langues", checkWitness);
}

// L'effet joué par `marble` pour le déclencheur `trigger` dans des évènements.
const effectOf = (events, trigger, marble) => events.find((event) => event.type === "effect" && event.trigger === trigger && event.marble === marble);

// SINON : la première branche vraie joue, la suivante sinon ; aucune, rien. Chaque
// branche se valide comme une clause, se lit pour les mots-clés et les boucles, se dit.
function checkOtherwise(run) {
  const table = {
    plain: {},
    big: { size: LARGE },
    small: { size: SMALL },
    // Base : Vitesse +3 si le triangle compte au moins un calot, sinon Vitesse +1.
    moonish: { base: [orElse(speed(3), count(zoneCount("triangle", sizeIs(LARGE)), { atLeast: 1 }), speed(1))] },
    // Tic : selon le calibre de l'éjectée, +3, +2, sinon +1 (une chaîne).
    tiered: {
      hit: [orElse(speed(3), replacementSize("ejected", LARGE), orElse(speed(2), replacementSize("ejected", MEDIUM), speed(1)))],
    },
    // Tic : Empocher la bille suivante ; si l'emplacement est vide, Empocher cette bille.
    agateish: { hit: [orElse(pocket(NEXT_SLOT), slotIs(NEXT_SLOT, "occupied"), pocket())] },
    // Une condition sans sinon, fausse : rien.
    bare: { hit: [{ ...speed(5), when: replacementSize("ejected", LARGE) }] },
  };
  const rules = fabricatedRules(table);
  const state = (over) => marblesPlayState(rules, over);
  const resolveBase = (triangle) => effectOf(mustReduce(rules, state({ triangle }), { type: "resolve" }).events, "phase", "moonish")?.speedDelta;
  run.same(
    "sinon : la condition vraie joue la clause, fausse son remplacement",
    [3, 1],
    [resolveBase({ rightBase: placed("moonish"), leftBase: placed("big"), apex: null }), resolveBase({ rightBase: placed("moonish"), leftBase: placed("plain"), apex: null })]
  );
  const hit = (marble, occupant) => effectOf(mustReduce(rules, state({ hand: inHand([marble]), triangle: { rightBase: null, leftBase: null, apex: placed(occupant) } }), { type: "place", handIndex: 0, slot: "apex" }).events, "hit", marble);
  run.same("sinon, une chaîne : calot +3, normale +2, minibille +1", [3, 2, 1], ["big", "plain", "small"].map((occupant) => hit("tiered", occupant).speedDelta));
  run("sans sinon, condition fausse : l'effet ne produit rien", 0, hit("bare", "plain").speedDelta);

  // Des branches d'actions différentes : Empocher la suivante, ou soi-même.
  const place = (triangle) => mustReduce(rules, state({ hand: inHand(["agateish"]), triangle }), { type: "place", handIndex: 0, slot: "rightBase" });
  run.same("sinon : la suivante occupée, elle est empochée", ["small"], place({ rightBase: placed("plain"), leftBase: placed("small"), apex: null }).state.pot);
  run.same("sinon : la suivante vide, la bille s'empoche elle-même", ["agateish"], place({ rightBase: placed("plain"), leftBase: null, apex: null }).state.pot);
  run(
    "sinon : prévision égale au réel",
    true,
    forecastMatches(rules, state({ hand: inHand(["tiered"]), triangle: { rightBase: null, leftBase: null, apex: placed("big") } }), { type: "place", handIndex: 0, slot: "apex" })
  );

  // Les mots-clés et la boucle lisent toutes les branches.
  run("mots-clés : un Empocher dans un sinon compte", true, rules.keywordsOf("agateish").some((keyword) => keyword.id === "pocket"));
  run("boucle : réagir à l'action d'un sinon est refusé", true, throws(() => validateTable({ x: { pocketed: { pocket: [orElse(speed(1), slotIs("apex", "empty"), pocket("apex"))] } } })));

  // Validation : un sinon demande une condition ; sa clause se valide comme les autres,
  // au même moment.
  run("validation : sinon sans condition refusé", true, /otherwise demande une condition/.test(caughtMessage(() => validateTable({ x: { base: [{ ...speed(1), otherwise: speed(2) }] } }))));
  run("validation : sinon qui n'est pas une clause refusé", true, throws(() => validateTable({ x: { base: [{ ...speed(1), when: slotIs("apex", "empty"), otherwise: [speed(2)] }] } })));
  run("validation : action inconnue dans un sinon refusée", true, throws(() => validateTable({ x: { base: [orElse(speed(1), slotIs("apex", "empty"), { action: "fly" })] } })));
  run("validation : un sinon garde la règle des cibles (bonus au Final refusé)", true, throws(() => validateTable({ x: { final: [orElse(speed(1), slotIs("apex", "empty"), { ...speed(2), target: "apex" })] } })));

  // Le texte : la clause, puis « sinon » et son remplacement.
  run(
    "fiche : « …, sinon … »",
    "card.base{effect: effect.combined{parts: [effect.otherwise{effect: effect.conditional{effect: effect.combined{parts: [effect.speed_up{amount: 3}]}, condition: condition.count.zone.triangle{bound: atLeast, noun: condition.count.noun_size{count: 1, size: <size.large.name>}}}, otherwise: effect.combined{parts: [effect.speed_up{amount: 1}]}}]}}",
    marbleCard("moonish", "x", rules, t, { timeless: true }).above.find((line) => line.startsWith("card.base"))
  );
}

// LA NÉGATION : vraie quand le test est faux, emplacement vide compris ; refusée là où
// la condition ne la déclare pas.
function checkNegation(run) {
  const rules = fabricatedRules({
    plain: {},
    beast: { families: ["bestiary"] },
    // Base : Fêlure 1 à la suivante si elle n'est pas de la famille Bestiaire.
    stinger: { base: [{ ...crack(1, NEXT_SLOT), when: not(familyAt(NEXT_SLOT, "bestiary")) }] },
  });
  const wearOfNext = (next) => {
    const result = mustReduce(rules, marblesPlayState(rules, { triangle: { rightBase: placed("stinger"), leftBase: placed(next), apex: null } }), { type: "resolve" });
    return result.events.filter((event) => event.type === "cracked").length;
  };
  run.same("négation : la suivante hors Bestiaire est fêlée, une Bestiaire non", [1, 0], [wearOfNext("plain"), wearOfNext("beast")]);
  const situation = { triangle: { rightBase: null, leftBase: null, apex: null } };
  run("négation : emplacement vide, « n'est pas Bestiaire » est vrai", true, conditionHolds(not(familyAt("apex", "bestiary")), situation, rules.types));
  run("validation : not refusé sur une condition qui ne le déclare pas", true, throws(() => validateTable({ x: { base: [{ ...speed(1), when: not(slotIs("apex", "empty")) }] } })));
  run("validation : not vaut true ou s'omet", true, throws(() => validateTable({ x: { base: [{ ...speed(1), when: { ...familyAt("apex", "bestiary"), not: false } }] } })));
  run(
    "texte : la négation dans le gabarit",
    true,
    marbleCard("stinger", "x", rules, t, { timeless: true }).above.some((line) => line.includes("condition.familyAt_relative{relative: next, family: <family.bestiary.name>, not: yes}"))
  );
}

// LA BILLE PRÉCISE : la condition marbleAt, le filtre « bille » (marbleIs), et les
// billes citées, que la table doit contenir.
function checkMarbleConditions(run) {
  const table = {
    plain: {},
    bee: {},
    // Pointe : Empocher cette bille si la précédente est une abeille, sinon Vitesse +3.
    hive: { apex: [orElse(pocket(), marbleAt(PREVIOUS_SLOT, "bee"), speed(3))] },
    // En poche, à chaque résolution : Vitesse +2 par abeille dans le pot.
    keeper: { pocketed: { resolution: [speed({ base: 0, step: 2, source: zoneCount("pot", marbleIs("bee")) })] } },
    // Tic : Éjecter toutes les abeilles actives.
    swatter: { hit: [eject(allActive(marbleIs("bee")))] },
  };
  const rules = fabricatedRules(table);
  const resolveApex = (left) => mustReduce(rules, marblesPlayState(rules, { triangle: { rightBase: null, leftBase: placed(left), apex: placed("hive") } }), { type: "resolve" });
  run.same(
    "marbleAt : la précédente est une abeille, la bille s'empoche ; sinon Vitesse +3",
    [["hive"], 0, [], 3],
    [resolveApex("bee").state.pot, effectOf(resolveApex("bee").events, "phase", "hive").speedDelta, resolveApex("plain").state.pot, effectOf(resolveApex("plain").events, "phase", "hive").speedDelta]
  );
  const counted = mustReduce(rules, marblesPlayState(rules, { pot: ["keeper", "bee", "bee", "plain"], potCapacity: 4 }), { type: "resolve" });
  run("filtre « bille » : par abeille dans le pot", 4, effectOf(counted.events, "pocketResolution", "keeper").speedDelta);
  const swatted = mustReduce(rules, marblesPlayState(rules, { hand: inHand(["swatter"]), triangle: { rightBase: placed("bee"), leftBase: placed("plain"), apex: placed("bee") } }), { type: "place", handIndex: 0, slot: "leftBase" });
  run.same("filtre « bille » : toutes les abeilles actives éjectées, seulement elles", { rightBase: null, leftBase: "swatter", apex: null }, {
    rightBase: swatted.state.triangle.rightBase,
    leftBase: swatted.state.triangle.leftBase.marble,
    apex: swatted.state.triangle.apex,
  });

  // Les billes citées : une bille inconnue refusée, chez une bille comme chez un statut.
  run("validation : marbleAt d'une bille inconnue refusé", true, /cite la bille inconnue "ghost"/.test(caughtMessage(() => validateTable({ x: { base: [{ ...speed(1), when: marbleAt("apex", "ghost") }] } }))));
  run("validation : filtre d'une bille inconnue refusé, même dans un sinon", true, throws(() => validateTable({ x: { base: [orElse(speed(1), slotIs("apex", "empty"), speed({ base: 0, step: 1, source: zoneCount("pot", marbleIs("ghost")) }))] } })));
  const citingStatus = { s: { stacking: "unique", duration: { kind: "turn" }, behaviors: [{ type: "modifier", point: "speedGain", operation: "add", value: 1, filters: [marbleIs("ghost")] }] } };
  run("validation : un statut qui cite une bille inconnue refusé", true, /statut "s" : cite la bille inconnue/.test(caughtMessage(() => validateMarbleTypes(withSizes({ plain: {} }), citingStatus))));
  run("validation : un id vide refusé", true, throws(() => validateTable({ x: { base: [{ ...speed(1), when: marbleAt("apex", "") }] } })));
}

// L'EMPLACEMENT VIDE OU OCCUPÉ, fixe ou relatif ; sans référence, ni l'un ni l'autre.
function checkSlotIs(run) {
  const rules = fabricatedRules({ plain: {} });
  const triangle = { rightBase: placed("plain"), leftBase: null, apex: null };
  const holds = (condition) => conditionHolds(condition, { triangle }, rules.types);
  run.same("slotIs : base droite occupée, base gauche vide", [true, false, true, false], [
    holds(slotIs("rightBase", "occupied")),
    holds(slotIs("rightBase", "empty")),
    holds(slotIs("leftBase", "empty")),
    holds(slotIs("leftBase", "occupied")),
  ]);
  run.same("slotIs : sans référence, ni vide ni occupé", [false, false], [holds(slotIs(null, "empty")), holds(slotIs(null, "occupied"))]);
  run("validation : état d'emplacement inconnu refusé", true, throws(() => validateTable({ x: { base: [{ ...speed(1), when: slotIs("apex", "full") }] } })));
  run("validation : slotIs relatif refusé à l'Éveil", true, throws(() => validateTable({ x: { awaken: [{ ...speed(1), when: slotIs(NEXT_SLOT, "empty") }] } })));
}

// LE CALIBRE D'UNE BILLE D'UN REMPLACEMENT : l'éjectée au Tic, celle qui éjecte à
// l'Éjection, par une pose ou par Éjecter ; refusé hors d'un remplacement.
function checkReplacementSize(run) {
  const table = {
    plain: {},
    big: { size: LARGE },
    small: { size: SMALL },
    // Tic : Vitesse +4 si la bille éjectée est une minibille.
    pearlish: { hit: [{ ...speed(4), when: replacementSize("ejected", SMALL) }] },
    // Éjection : Empocher cette bille si la bille qui l'éjecte est un calot.
    turtleish: { size: LARGE, knockout: [{ ...pocket(), when: replacementSize("placed", LARGE) }] },
    // Tic : Éjecter la pointe (la bille qui éjecte, pour la turtleish).
    bigEjector: { size: LARGE, hit: [eject("apex")] },
  };
  const rules = fabricatedRules(table);
  const place = (marble, occupant, slot = "apex", triangle = {}) =>
    mustReduce(rules, marblesPlayState(rules, { hand: inHand([marble]), triangle: { rightBase: null, leftBase: null, apex: null, [slot]: placed(occupant), ...triangle } }), { type: "place", handIndex: 0, slot });
  run.same("replacementSize : au Tic, l'éjectée minibille ou non", [4, 0], [effectOf(place("pearlish", "small").events, "hit", "pearlish").speedDelta, effectOf(place("pearlish", "plain").events, "hit", "pearlish").speedDelta]);
  run.same("replacementSize : à l'Éjection, chassée par un calot posé, au pot ; par une normale, à la défausse", [["turtleish"], []], [place("big", "turtleish").state.pot, place("plain", "turtleish").state.pot]);
  const byEffect = place("bigEjector", "plain", "rightBase", { apex: placed("turtleish") });
  run.same("replacementSize : chassée par un Éjecter d'un calot, au pot", ["turtleish"], byEffect.state.pot);
  run("validation : replacementSize hors d'un remplacement refusé", true, throws(() => validateTable({ x: { base: [{ ...speed(1), when: replacementSize("ejected", SMALL) }] } })));
  run("validation : bille de remplacement inconnue refusée", true, throws(() => validateTable({ x: { hit: [{ ...speed(1), when: replacementSize("thrower", SMALL) }] } })));
  run("texte : la bille qui éjecte, niée", "condition.replacementSize{marble: placed, size: <size.large.name>, not: yes}", t("marbles.condition.replacementSize", { marble: "placed", size: nameRef("marbles.size.large.name"), not: "yes" }));
}

// UN NOMBRE COMPARÉ À UNE BORNE, pour chaque sorte de source, aux limites.
function checkCount(run) {
  const rules = fabricatedRules({ plain: {}, beast: { families: ["bestiary"] }, star: { families: ["stars"] } });
  const game = (over) => marblesPlayState(rules, over);
  const holds = (condition, over, holder = { turnsInHand: 0 }) => {
    const state = game(over);
    return conditionHolds(condition, { triangle: state.triangle, state, tally: state.tally, holder }, rules.types);
  };
  const hand = (size) => ({ hand: inHand(Array(size).fill("plain")) });
  run.same("count, main : au plus 3, avec 3 et 4", [true, false], [3, 4].map((size) => holds(count(zoneCount("hand"), { atMost: 3 }), hand(size))));
  run.same("count, main : au moins 3, avec 3 et 2", [true, false], [3, 2].map((size) => holds(count(zoneCount("hand"), { atLeast: 3 }), hand(size))));
  const triangle = { triangle: { rightBase: placed("beast"), leftBase: placed("star"), apex: placed("plain") } };
  run("count, familles : au moins 3 sur le triangle", true, holds(count(familyCount(), { atLeast: 3 }), triangle));
  run("count, filtré : au moins 1 Bestiaire active", true, holds(count(zoneCount("triangle", familyIs("bestiary")), { atLeast: 1 }), triangle));
  run("count, tours en main : au moins 2", true, holds(count(turnsInHand(), { atLeast: 2 }), {}, { turnsInHand: 2 }));
  const flicked = mustReduce(rules, game({ hand: inHand(["plain"]) }), { type: "place", handIndex: 0, slot: "apex" }).state;
  run("count, valeur de partie : une bille lancée ce tour", true, conditionHolds(count(tally("thrownMarbles", "turn"), { atLeast: 1 }), { triangle: flicked.triangle, state: flicked, tally: flicked.tally, holder: { turnsInHand: 0 } }, rules.types));
  run("validation : sans borne refusé", true, throws(() => validateTable({ x: { base: [{ ...speed(1), when: { type: "count", source: zoneCount("hand") } }] } })));
  run("validation : deux bornes refusées", true, throws(() => validateTable({ x: { base: [{ ...speed(1), when: count(zoneCount("hand"), { atLeast: 1, atMost: 3 }) }] } })));
  run("validation : borne non entière refusée", true, throws(() => validateTable({ x: { base: [{ ...speed(1), when: count(zoneCount("hand"), { atLeast: 1.5 }) }] } })));
  run("validation : source inconnue refusée", true, throws(() => validateTable({ x: { base: [{ ...speed(1), when: count({ type: "moons" }, { atLeast: 1 }) }] } })));
}

// LES COMPTEURS DU TOUR : la Vitesse et la Masse au déclenchement, avant l'effet qui
// les lit ; en jeu, la base gauche lit ce qu'a donné la base droite.
function checkStat(run) {
  const holds = (condition, speedValue, massValue) => conditionHolds(condition, { state: { speed: speedValue, mass: massValue } }, {});
  run.same("stat : Vitesse d'au moins 10, avec 10 et 9", [true, false], [10, 9].map((value) => holds(statIs("speed", { atLeast: 10 }), value, 1)));
  run.same("stat : Masse d'au plus 1, avec 1 et 2", [true, false], [1, 2].map((value) => holds(statIs("mass", { atMost: 1 }), 0, value)));
  const rules = fabricatedRules({
    giver: { base: [speed(10)] },
    // Base : Masse +1 si la Vitesse est d'au moins 10, sinon Vitesse +2.
    spiderish: { base: [orElse(mass(1), statIs("speed", { atLeast: 10 }), speed(2))] },
  });
  const resolved = (right) => effectOf(mustReduce(rules, marblesPlayState(rules, { triangle: { rightBase: placed(right), leftBase: placed("spiderish"), apex: null } }), { type: "resolve" }).events, "phase", "spiderish");
  run.same("stat : en jeu, la base gauche lit la Vitesse donnée par la base droite", [1, 2], [resolved("giver").massDelta, resolved("spiderish").speedDelta]);
  run("validation : compteur inconnu refusé", true, throws(() => validateTable({ x: { base: [{ ...speed(1), when: statIs("impact", { atLeast: 1 }) }] } })));
}

// LE TÉMOIN : ce que la fiche dit dans chaque vraie langue, accords et formes de nom
// compris (pluriel, indéfini, genre).
function checkWitness(run) {
  const clauses = [
    orElse(speed(3), count(zoneCount("triangle", sizeIs(LARGE)), { atLeast: 1 }), speed(1)),
    { ...crack(1, NEXT_SLOT), when: not(familyAt(NEXT_SLOT, "bestiary")) },
    { ...pocket(), when: marbleAt(PREVIOUS_SLOT, "bee") },
    { ...speed(2), when: count(zoneCount("hand"), { atMost: 3 }) },
    { ...speed(4), when: statIs("mass", { atMost: 1 }) },
    { ...pocket(), when: replacementSize("placed", LARGE) },
    { ...speed(-2), when: slotIs(NEXT_SLOT, "empty") },
    speed({ base: 0, step: 2, source: zoneCount("pot", marbleIs("bee")) }),
    { ...mass(1), when: count(zoneCount("pot", marbleIs("bee")), { atLeast: 3 }) },
    { ...speed(1), when: count(tally("awaken", "game"), { atLeast: 2 }) },
  ];
  const expected = {
    fr: [
      "Vitesse +3 si le triangle compte au moins 1 calot, sinon Vitesse +1",
      "Fêlure 1 à la bille de l'emplacement suivant si la bille de l'emplacement suivant n'est pas de la famille Bestiaire",
      "Empocher cette bille si la bille de l'emplacement précédent est une abeille",
      "Vitesse +2 si vous avez au plus 3 billes en main",
      "Vitesse +4 si la Masse est d'au plus 1",
      "Empocher cette bille si la bille qui l'éjecte est un calot",
      "Vitesse −2 si l'emplacement suivant est vide",
      "Vitesse +2 par abeille dans le pot",
      "Masse +1 si le pot compte au moins 3 abeilles",
      "Vitesse +1 si cette partie compte au moins 2 éveils",
    ],
    en: [
      "Speed +3 if the triangle holds at least 1 boulder, otherwise Speed +1",
      "Crack 1 to the marble in the next slot if the marble in the next slot does not belong to the Bestiary family",
      "Pocket this marble if the marble in the previous slot is a bee",
      "Speed +2 if you have at most 3 marbles in hand",
      "Speed +4 if Mass is at most 1",
      "Pocket this marble if the marble knocking it out is a boulder",
      "Speed −2 if the next slot is empty",
      "Speed +2 per bee in the pot",
      "Mass +1 if the pot holds at least 3 bees",
      "Speed +1 if this game has at least 2 awakenings",
    ],
  };
  const before = getLocale();
  try {
    for (const [locale, lines] of Object.entries(expected)) {
      setLocale(locale);
      const said = clauses.map((clause) => describePrinted([clause], null, realT).replace(/[  ]/g, " "));
      run.same(`témoin ${locale} : les nouvelles conditions dites`, lines, said);
    }
  } finally {
    setLocale(before);
  }
}
