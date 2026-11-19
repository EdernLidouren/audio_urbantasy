// Vérifications du core — domaine « marbles-amounts ». Les MONTANTS CALCULÉS du jeu des
// billes ajoutés après les premières sources (marbles/core/effects.js/AMOUNT_SOURCES,
// doc/marbles.md, « Montants calculés ») : le pas négatif, le nombre de billes de
// plusieurs zones ensemble, les familles différentes de plusieurs zones, un compteur
// du tour, ce que donne la bille de l'autre base, l'usure d'une bille (la sienne ou
// celle de l'éjectée, gardée par sa trace de départ), les tours passés sur le
// triangle, et la condition sur l'effet imprimé de la bille éjectée : leur
// validation, leur jeu, leurs textes (un témoin dans chaque vraie langue) et la
// prévision. Les sources d'origine (tours en main, valeurs de partie, nombre d'une
// zone, familles du triangle) : domaines marbles, marbles-tally, marbles-zones et
// marbles-families. Sur des billes fabriquées. Lancées par
// core/checks/index.js/runChecks (`node tools/run-checks.js marbles-amounts`).

import { throws } from "../../lib/check.js";
import { getLocale, setLocale, t as realT } from "../../data/i18n/index.js";
import { MEDIUM, SMALL } from "../config/values.js";
import {
  KNOCKED_OUT,
  count,
  familyCount,
  mass,
  orElse,
  otherBase,
  pocket,
  polish,
  sizeIs,
  slotIs,
  speed,
  turnStat,
  turnsOnTriangle,
  wear,
  zoneCount,
} from "../content/effects.js";
import { describePrinted } from "../view/narration/effects.js";
import { placementLines } from "../view/narration.js";
import { marbleCard } from "../view/card.js";
import { caughtMessage, fabricatedRules, forecastMatches, inHand, keyText as t, marblesPlayState, mustReduce, placed, validateTable } from "./helpers.js";

export default function checkMarblesAmounts(run) {
  run.section("pas négatif", checkNegativeStep);
  run.section("plusieurs zones", checkZones);
  run.section("compteur du tour", checkTurnStat);
  run.section("autre base", checkOtherBase);
  run.section("usure et trace de départ", checkWear);
  run.section("tours passés sur le triangle", checkTurnsOnTriangle);
  run.section("effet imprimé de la bille éjectée", checkKnockedOutPrinted);
  run.section("billes cachées dans la prévision", checkHiddenRead);
  run.section("témoin, vraies langues", checkWitness);
}

// UNE BILLE CACHÉE LUE : à l'aveugle, une bille piochée est inconnue ; un montant qui
// lit son identité (une famille, un filtre) ne sait pas ce qu'il aurait compté : la
// prévision le dit (`hiddenRead`), se dit incertaine, et la confirmation l'annonce.
function checkHiddenRead(run) {
  const rules = fabricatedRules({
    plain: {},
    // Pointe : Vitesse +3 par famille différente sur le triangle et en main.
    agate: { apex: [speed(per(3, familyCount(["triangle", "hand"])))] },
    // Tic : Pioche 1.
    drawer: { hit: [{ action: "draw", amount: 1 }] },
  });
  const state = (bag) => marblesPlayState(rules, { hand: inHand(["drawer"]), bag, triangle: { rightBase: placed("plain"), leftBase: null, apex: placed("agate") } });
  const toRight = { type: "place", handIndex: 0, slot: "rightBase" };
  const hidden = rules.forecast(state(["plain"]), toRight);
  run.same("bille cachée : la famille d'une bille piochée à l'aveugle, lue", { hiddenRead: true, uncertain: true }, { hiddenRead: hidden.hiddenRead, uncertain: hidden.uncertain });
  run("bille cachée : rien de pioché, rien de caché", false, rules.forecast(state([]), toRight).hiddenRead);
  run("bille cachée : la confirmation le dit", true, placementLines(state(["plain"]), 0, "rightBase", rules, t).some(({ key }) => key === "marbles.forecast.hidden_read"));
}

// L'effet joué par `marble` pour le déclencheur `trigger` dans des évènements.
const effectOf = (events, trigger, marble) => events.find((event) => event.type === "effect" && event.trigger === trigger && event.marble === marble);

// Un montant calculé, base 0.
const per = (step, source, max) => ({ base: 0, step, source, ...(max === undefined ? {} : { max }) });

// LE PAS NÉGATIF : « Vitesse +5, −1 par point d'usure de cette bille » ; seulement pour
// la Vitesse et la Masse, sans maximum.
function checkNegativeStep(run) {
  const rules = fabricatedRules({
    plain: {},
    // Chute : Vitesse +5, −1 par point d'usure qu'elle avait (usure maximale 2).
    bubble: { maxWear: 2, drop: [speed({ base: 5, step: -1, source: wear() })] },
    // Tic : Défausser la première bille de la main.
    tosser: { hit: [{ action: "discard", target: "firstInHand" }] },
  });
  const apex = (marble, wearValue = 0) => ({ rightBase: null, leftBase: null, apex: placed(marble, wearValue) });
  const play = (over, action) => mustReduce(rules, marblesPlayState(rules, over), action);
  const toApex = { type: "place", handIndex: 0, slot: "apex" };
  const dropOf = (result) => effectOf(result.events, "drop", "bubble").speedDelta;
  run("pas négatif : usée (2), Vitesse +3", 3, dropOf(play({ triangle: apex("bubble", 1) }, { type: "resolve" })));
  run("pas négatif : remplacée à usure 1, Vitesse +4", 4, dropOf(play({ hand: inHand(["plain"]), triangle: apex("bubble", 1) }, toApex)));
  run("pas négatif : jamais posée (défaussée de la main), Vitesse +5", 5, dropOf(play({ hand: inHand(["tosser", "bubble"]), triangle: apex("plain") }, toApex)));
  run("validation : pas nul refusé", true, throws(() => validateTable({ x: { base: [speed(per(0, zoneCount("hand")))] } })));
  run("validation : pas négatif refusé pour un Polissage", true, /Vitesse et la Masse/.test(caughtMessage(() => validateTable({ x: { base: [polish({ base: 3, step: -1, source: zoneCount("hand") })] } }))));
  run("validation : pas négatif avec un maximum refusé", true, throws(() => validateTable({ x: { base: [speed({ base: 5, step: -1, source: zoneCount("hand"), max: 6 })] } })));
}

// PLUSIEURS ZONES : les billes additionnées, les familles réunies ; au moins deux zones,
// chacune une fois, jamais `zone` et `zones` ensemble.
function checkZones(run) {
  const rules = fabricatedRules({
    plain: {},
    small: { size: SMALL },
    beast: { families: ["bestiary"] },
    star: { families: ["stars"] },
    // Base : Vitesse +2 par bille normale en main et sur le triangle.
    eye: { base: [speed(per(2, zoneCount(["hand", "triangle"], sizeIs(MEDIUM))))] },
    // Pointe : Vitesse +3 par famille différente sur le triangle et en main.
    agate: { apex: [speed(per(3, familyCount(["triangle", "hand"])))] },
  });
  const resolved = (over, marble, trigger = "phase") => effectOf(mustReduce(rules, marblesPlayState(rules, over), { type: "resolve" }).events, trigger, marble).speedDelta;
  // La main (2 normales, 1 minibille) et le triangle (eye, une normale, comptée ; une minibille).
  run("plusieurs zones : 2 normales en main et 2 sur le triangle, Vitesse +8", 8, resolved({ hand: inHand(["plain", "plain", "small"]), triangle: { rightBase: placed("eye"), leftBase: placed("small"), apex: placed("plain") } }, "eye"));
  // Familles : triangle (classiques par défaut, bestiaire), main (astres, bestiaire de nouveau).
  run("familles de plusieurs zones : 3 familles, Vitesse +9", 9, resolved({ hand: inHand(["star", "beast"]), triangle: { rightBase: placed("beast"), leftBase: null, apex: placed("agate") } }, "agate"));
  run("validation : une seule zone en liste refusée", true, throws(() => validateTable({ x: { base: [speed(per(1, zoneCount(["hand"])))] } })));
  run("validation : une zone en double refusée", true, throws(() => validateTable({ x: { base: [speed(per(1, zoneCount(["hand", "hand"])))] } })));
  run("validation : zone et zones ensemble refusées", true, throws(() => validateTable({ x: { base: [speed(per(1, { type: "zoneCount", zone: "hand", zones: ["hand", "pot"] }))] } })));
  run("validation : zone inconnue dans une liste de familles refusée", true, throws(() => validateTable({ x: { base: [speed(per(1, familyCount(["triangle", "moon"])))] } })));
  run(
    "condition : un nombre de plusieurs zones",
    true,
    marbleCard("x", "x", fabricatedRules({ x: { base: [{ ...speed(1), when: count(zoneCount(["hand", "triangle"]), { atLeast: 3 }) }] } }), t, { timeless: true }).above.some((line) => line.includes("condition.count.zones{bound: atLeast, noun: condition.count.noun{count: 3}, zones: [zone_where.hand | zone_where.triangle]}"))
  );
}

// UN COMPTEUR DU TOUR : au déclenchement, avant l'effet qui le lit ; négatif, 0.
function checkTurnStat(run) {
  const make = (flickSpeed) =>
    fabricatedRules({
      plain: {},
      // Chiquenaude : Vitesse `flickSpeed` ; Tic : Vitesse égale à la Vitesse du tour, maximum +8.
      fireball: { flick: [speed(flickSpeed)], hit: [speed(per(1, turnStat("speed"), 8))] },
    });
  const hit = (flickSpeed) => {
    const rules = make(flickSpeed);
    return effectOf(mustReduce(rules, marblesPlayState(rules, { hand: inHand(["fireball"]), triangle: { rightBase: null, leftBase: null, apex: placed("plain") } }), { type: "place", handIndex: 0, slot: "apex" }).events, "hit", "fireball").speedDelta;
  };
  run.same("compteur du tour : la Vitesse lue au Tic (3, 10 plafonnée à 8, −2 comptée 0)", [3, 8, 0], [3, 10, -2].map(hit));
  run("validation : compteur inconnu refusé", true, throws(() => validateTable({ x: { base: [speed(per(1, turnStat("impact")))] } })));
}

// L'AUTRE BASE : ce que donne sa bille, joué comme maintenant, malus compris ; vide, ou
// une copie pendant une copie, 0 ; dans un effet de base seulement, tel quel.
function checkOtherBase(run) {
  const table = {
    plain: {},
    copper: { base: [speed(per(1, otherBase("speed")))] },
    giver: { base: [speed(4)] },
    malus: { base: [speed(-2)] },
    // Base : Vitesse +5 si la pointe est vide, sinon Vitesse +1.
    moody: { base: [orElse(speed(5), slotIs("apex", "empty"), speed(1))] },
    // Base gauche : Vitesse +3 ; base droite : Masse +1.
    sided: { baseVariant: { leftBase: [speed(3)], rightBase: [mass(1)] } },
  };
  const rules = fabricatedRules(table);
  const copied = (triangle, copperSlot = "rightBase") => effectOf(mustReduce(rules, marblesPlayState(rules, { triangle }), { type: "resolve" }).events, "phase", "copper")?.speedDelta;
  const bases = (right, left, apex = null) => ({ rightBase: placed(right), leftBase: left === null ? null : placed(left), apex: apex === null ? null : placed(apex) });
  run.same("autre base : la base gauche donne Vitesse +4, copiée ; depuis la gauche aussi", [4, 4], [copied(bases("copper", "giver")), copied(bases("giver", "copper"))]);
  run("autre base : un malus copié", -2, copied(bases("copper", "malus")));
  run("autre base : vide, rien", 0, copied(bases("copper", null)));
  run.same("autre base : deux cuivres, rien de part et d'autre", [0, 0], (() => {
    const events = mustReduce(rules, marblesPlayState(rules, { triangle: bases("copper", "copper") }), { type: "resolve" }).events;
    return events.filter((event) => event.type === "effect" && event.marble === "copper").map((event) => event.speedDelta);
  })());
  run.same("autre base : sa condition jouée comme maintenant (pointe vide : +5 ; occupée : +1)", [5, 1], [copied(bases("copper", "moody")), copied(bases("copper", "moody", "plain"))]);
  run("autre base : la variante du côté où elle est (base gauche : Vitesse +3)", 3, copied(bases("copper", "sided")));
  run("autre base : prévision égale au réel", true, forecastMatches(rules, marblesPlayState(rules, { triangle: bases("copper", "giver") }), null));
  run("validation : à la pointe refusée", true, throws(() => validateTable({ x: { apex: [speed(per(1, otherBase("speed")))] } })));
  run("validation : au Tic refusée", true, throws(() => validateTable({ x: { hit: [speed(per(1, otherBase("speed")))] } })));
  run("validation : pas 2 refusé (telle quelle)", true, throws(() => validateTable({ x: { base: [speed(per(2, otherBase("speed")))] } })));
  run("validation : pour un Polissage refusée (signée)", true, throws(() => validateTable({ x: { base: [polish(per(1, otherBase("speed")))] } })));
  run(
    "fiche : « Vitesse égale à la Vitesse que donne la bille de l'autre base »",
    "card.base{effect: effect.combined{parts: [effect.equal_other_base{action: speed, stat: speed}]}}",
    marbleCard("copper", "x", rules, t, { timeless: true }).above.find((line) => line.startsWith("card.base"))
  );
}

// L'USURE ET LA TRACE DE DÉPART : la sienne sur le triangle, celle qu'elle avait en
// partant (Final, Éjection, Chute), celle de l'éjectée au Tic, ce qui lui reste.
function checkWear(run) {
  const atMostOneLeft = count(wear({ marble: "ejected", remaining: true }), { atMost: 1 });
  const table = {
    plain: {},
    // Tic : si l'éjectée était à 1 point de son maximum, Vitesse +7 et l'empocher.
    dragon: { hit: [{ ...speed(7), when: atMostOneLeft }, { ...pocket(KNOCKED_OUT), when: atMostOneLeft }] },
    // Base : Vitesse +1 par point d'usure ; Éjection : Masse +1 par point d'usure.
    worn: { base: [speed(per(1, wear()))], knockout: [mass(per(1, wear()))] },
  };
  const rules = fabricatedRules(table);
  const place = (occupantWear) => mustReduce(rules, marblesPlayState(rules, { hand: inHand(["dragon"]), triangle: { rightBase: null, leftBase: null, apex: placed("plain", occupantWear) } }), { type: "place", handIndex: 0, slot: "apex" });
  run.same(
    "usure de l'éjectée : à 2 sur 3, Vitesse +7 et au pot ; à 1 sur 3, rien",
    [{ speed: 7, pot: ["plain"] }, { speed: 0, pot: [] }],
    [2, 1].map((occupantWear) => ({ speed: place(occupantWear).state.speed, pot: place(occupantWear).state.pot }))
  );
  run("usure de l'éjectée : prévision égale au réel", true, forecastMatches(rules, marblesPlayState(rules, { hand: inHand(["dragon"]), triangle: { rightBase: null, leftBase: null, apex: placed("plain", 2) } }), { type: "place", handIndex: 0, slot: "apex" }));
  const resolved = mustReduce(rules, marblesPlayState(rules, { triangle: { rightBase: null, leftBase: placed("worn", 2), apex: null } }), { type: "resolve" });
  run("usure sur le triangle : sa phase lit son usure du moment (2)", 2, effectOf(resolved.events, "phase", "worn").speedDelta);
  const knocked = mustReduce(rules, marblesPlayState(rules, { hand: inHand(["plain"]), triangle: { rightBase: null, leftBase: null, apex: placed("worn", 2) } }), { type: "place", handIndex: 0, slot: "apex" });
  run("usure en partance : son Éjection lit l'usure qu'elle avait (2)", 2, effectOf(knocked.events, "knockout", "worn").massDelta);
  run("validation : l'usure de l'éjectée hors d'un remplacement refusée", true, throws(() => validateTable({ x: { base: [speed(per(1, wear({ marble: "ejected" })))] } })));
  run("validation : sa propre usure à l'Éveil refusée", true, throws(() => validateTable({ x: { awaken: [speed(per(1, wear()))] } })));
  run("validation : remaining vaut true", true, throws(() => validateTable({ x: { base: [speed(per(1, { type: "wear", remaining: false }))] } })));
}

// LES TOURS PASSÉS SUR LE TRIANGLE : les phases jouées, gardées dans la rotation et
// l'échange, lues au Final par la trace de départ.
function checkTurnsOnTriangle(run) {
  const rules = fabricatedRules({
    plain: {},
    // Final : Vitesse +2 par tour passé sur le triangle, maximum +10 (usure maximale 5).
    soda: { maxWear: 5, final: [speed(per(2, turnsOnTriangle(), 10))] },
  });
  // Posée, puis cinq résolutions : à la cinquième, usée, son Final.
  let state = marblesPlayState(rules, { turns: 20, hand: inHand(["soda"]), bag: Array(10).fill("plain") });
  state = mustReduce(rules, state, { type: "place", handIndex: 0, slot: "apex" }).state;
  const phases = [];
  let final = null;
  for (let turn = 0; turn < 5; turn++) {
    const resolved = mustReduce(rules, state, { type: "resolve" });
    final = effectOf(resolved.events, "final", "soda") ?? final;
    const where = Object.values(resolved.state.triangle).find((slot) => slot?.marble === "soda");
    if (where !== undefined) phases.push(where.phases);
    state = resolved.state.stage === "draw" ? mustReduce(rules, resolved.state, { type: "draw" }).state : resolved.state;
  }
  run.same("tours sur le triangle : une phase de plus à chaque résolution, gardée dans la rotation", [1, 2, 3, 4], phases);
  run("tours sur le triangle : au Final, les cinq phases jouées, Vitesse +10", 10, final?.speedDelta);
  const swapped = mustReduce(rules, marblesPlayState(rules, { triangle: { rightBase: { marble: "plain", wear: 1, phases: 3 }, leftBase: null, apex: null } }), { type: "swap", a: "rightBase", b: "leftBase" });
  run("tours sur le triangle : gardés dans un échange", 3, swapped.state.triangle.leftBase.phases);
  run("validation : à l'Éveil refusée", true, throws(() => validateTable({ x: { awaken: [speed(per(1, turnsOnTriangle()))] } })));
}

// L'EFFET IMPRIMÉ DE LA BILLE ÉJECTÉE : à l'emplacement qu'elle quitte, dans un Tic
// seulement.
function checkKnockedOutPrinted(run) {
  const heavyIfMass = { type: "printedStat", slot: KNOCKED_OUT, stat: "mass", atLeast: 1 };
  const rules = fabricatedRules({
    plain: {},
    // Pointe : Masse +1.
    heavy: { apex: [mass(1)] },
    fireball: { hit: [{ ...speed(4), when: heavyIfMass }] },
  });
  const hit = (occupant, slot = "apex") =>
    effectOf(mustReduce(rules, marblesPlayState(rules, { hand: inHand(["fireball"]), triangle: { rightBase: null, leftBase: null, apex: null, [slot]: placed(occupant) } }), { type: "place", handIndex: 0, slot }).events, "hit", "fireball").speedDelta;
  run.same("effet imprimé de l'éjectée : Masse +1 à la pointe, oui ; rien, non ; en base, non", [4, 0, 0], [hit("heavy"), hit("plain"), hit("heavy", "leftBase")]);
  run("validation : hors d'un Tic refusée", true, throws(() => validateTable({ x: { knockout: [{ ...speed(1), when: heavyIfMass }] } })));
}

// LE TÉMOIN : ce que la fiche dit dans chaque vraie langue.
function checkWitness(run) {
  const clauses = [
    speed({ base: 5, step: -1, source: wear() }),
    speed(per(2, zoneCount(["hand", "triangle"], sizeIs(MEDIUM)), 8)),
    speed(per(3, familyCount(["triangle", "hand"]), 12)),
    speed(per(1, turnStat("speed"), 8)),
    speed(per(1, otherBase("speed"))),
    speed(per(2, turnsOnTriangle(), 10)),
    { ...speed(7), when: count(wear({ marble: "ejected", remaining: true }), { atMost: 1 }) },
    { ...speed(4), when: { type: "printedStat", slot: KNOCKED_OUT, stat: "mass", atLeast: 1 } },
    { ...mass(1), when: count(familyCount(["triangle", "hand"]), { atLeast: 3 }) },
  ];
  const expected = {
    fr: [
      "Vitesse +5, −1 par point d'usure de cette bille",
      "Vitesse +2 par bille normale en main et sur le triangle, maximum +8",
      "Vitesse +3 par famille différente sur le triangle et en main, maximum +12",
      "Vitesse égale à la Vitesse du tour, maximum +8",
      "Vitesse égale à la Vitesse que donne la bille de l'autre base",
      "Vitesse +2 par tour passé sur le triangle, maximum +10",
      "Vitesse +7 si la bille éjectée a au plus 1 point d'usure restant",
      "Vitesse +4 si l'effet de la bille éjectée donne au moins Masse +1",
      "Masse +1 si l'on compte au moins 3 familles différentes sur le triangle et en main",
    ],
    en: [
      "Speed +5, −1 per point of wear on this marble",
      "Speed +2 per standard marble in hand and on the triangle, maximum +8",
      "Speed +3 per different family on the triangle and in hand, maximum +12",
      "Speed equal to the turn's Speed, maximum +8",
      "Speed equal to the Speed given by the marble in the other base",
      "Speed +2 per turn spent on the triangle, maximum +10",
      "Speed +7 if the knocked-out marble has at most 1 point of wear left",
      "Speed +4 if the knocked-out marble's effect gives at least Mass +1",
      "Mass +1 if you count at least 3 different families on the triangle and in hand",
    ],
  };
  const before = getLocale();
  try {
    for (const [locale, lines] of Object.entries(expected)) {
      setLocale(locale);
      const said = clauses.map((clause) => describePrinted([clause], null, realT).replace(/[  ]/g, " "));
      run.same(`témoin ${locale} : les nouveaux montants dits`, lines, said);
    }
  } finally {
    setLocale(before);
  }
}
