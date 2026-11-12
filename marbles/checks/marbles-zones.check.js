// Vérifications du core — domaine « marbles-zones ». Les ZONES DE LA PARTIE du jeu
// des billes (marbles/core/effects.js/GAME_ZONES, doc/marbles.md, « Conditions » et
// « Montants calculés ») : les conditions d'état (`zone` : triangle plein, main
// vide, pot plein…) et le nombre de billes par zone (`zoneCount`), aux limites, avec
// les billes en transit exclues et les caractéristiques en vigueur, dans la fiche et
// dans la prévision. Sur des billes fabriquées. Lancées par
// core/checks/index.js/runChecks (`node tools/run-checks.js marbles-zones`).

import { throws } from "../../lib/check.js";
import { zoneCount, zoneIs } from "../content/effects.js";
import { LOCALE_TABLES } from "../../data/i18n/index.js";
import { CONDITIONS, amountOf } from "../core/effects.js";
import { GAME_ZONES } from "../core/zones.js";
import { marbleCard } from "../view/card.js";
import { fabricatedRules, forecastMatches, inHand, keyText as t, marblesPlayState, mustReduce, placed, validateTable } from "./helpers.js";


export default function checkMarblesZones(run) {
  run.section("conditions d'état", checkZoneConditions);
  run.section("nombre de billes par zone", checkZoneCounts);
}

function checkZoneConditions(run) {
  const rules = fabricatedRules({ plain: {} });
  const game = (over) => marblesPlayState(rules, over);
  const test = (zone, state, over) => CONDITIONS.zone.test(zoneIs(zone, state), { state: game(over) });
  const filled = (count) => ({ rightBase: count > 0 ? placed("plain") : null, leftBase: count > 1 ? placed("plain") : null, apex: count > 2 ? placed("plain") : null });

  // Le triangle : plein, vide, une seule bille, aux limites.
  run.same("triangle plein : 3 oui, 2 non", [true, false], [3, 2].map((count) => test("triangle", "full", { triangle: filled(count) })));
  run.same("triangle vide : 0 oui, 1 non", [true, false], [0, 1].map((count) => test("triangle", "empty", { triangle: filled(count) })));
  run.same("une seule bille sur le triangle : 1 oui, 0 et 2 non", [true, false, false], [1, 0, 2].map((count) => test("triangle", "single", { triangle: filled(count) })));
  // La main : vide, pleine selon la taille de main en vigueur.
  run.same("main vide : 0 oui, 1 non", [true, false], [0, 1].map((count) => test("hand", "empty", { hand: inHand(Array(count).fill("plain")) })));
  run.same("main pleine : 5 sur 5 oui, 4 sur 5 non", [true, false], [5, 4].map((count) => test("hand", "full", { hand: inHand(Array(count).fill("plain")), maxHandSize: 5 })));
  run("main pleine : la taille en vigueur, 3 sur 3", true, test("hand", "full", { hand: inHand(["plain", "plain", "plain"]), maxHandSize: 3 }));
  // Sac et défausse vides.
  run.same("sac vide : 0 oui, 1 non", [true, false], [[], ["plain"]].map((bag) => test("bag", "empty", { bag })));
  run.same("défausse vide : 0 oui, 1 non", [true, false], [[], ["plain"]].map((discard) => test("discard", "empty", { discard })));
  // Le pot : plein selon sa capacité en vigueur, vide.
  run.same("pot plein : 3 sur 3 oui, 2 sur 3 non", [true, false], [3, 2].map((count) => test("pot", "full", { pot: Array(count).fill("plain"), potCapacity: 3 })));
  run("pot plein : la capacité en vigueur, 1 sur 1", true, test("pot", "full", { pot: ["plain"], potCapacity: 1 }));
  run.same("pot vide : 0 oui, 1 non", [true, false], [[], ["plain"]].map((pot) => test("pot", "empty", { pot })));

  // Les billes en transit ne comptent nulle part : pendant sa Chiquenaude, la bille
  // lancée n'est plus en main ; pendant son Éjection, la seule bille active n'est
  // plus sur le triangle.
  const table = {
    plain: {},
    lonelyFlick: { flick: [{ action: "speed", amount: 1, when: zoneIs("hand", "empty") }] },
    lonelyKnock: { knockout: [{ action: "speed", amount: 2, when: zoneIs("triangle", "empty") }] },
    potWatcher: { pocketed: { resolution: [{ action: "mass", amount: 2, when: zoneIs("pot", "full") }] } },
  };
  const made = fabricatedRules(table);
  const flicked = mustReduce(made, marblesPlayState(made, { hand: inHand(["lonelyFlick"]) }), { type: "place", handIndex: 0, slot: "apex" });
  run("transit : en Chiquenaude, la main de la bille lancée est vide", 1, flicked.state.speed);
  const knocked = mustReduce(made, marblesPlayState(made, { hand: inHand(["plain"]), triangle: { rightBase: null, leftBase: null, apex: placed("lonelyKnock") } }), { type: "place", handIndex: 0, slot: "apex" });
  run("transit : en partance, à son Éjection, le triangle est vide", 2, knocked.state.speed);
  // En poche, à chaque résolution : le pot plein, à la capacité en vigueur.
  const potFull = mustReduce(made, marblesPlayState(made, { bag: ["plain"], pot: ["potWatcher", "plain"], potCapacity: 2 }), { type: "resolve" });
  run("en poche : pot plein, Masse +2", 3, potFull.events.find((event) => event.type === "impact").mass);
  const potRoom = mustReduce(made, marblesPlayState(made, { bag: ["plain"], pot: ["potWatcher", "plain"], potCapacity: 3 }), { type: "resolve" });
  run("en poche : pot non plein, rien", 1, potRoom.events.find((event) => event.type === "impact").mass);

  // Validation : une zone et un état déclarés seulement.
  run("validation : triangle plein permis", false, throws(() => validateTable({ x: { apex: [{ action: "speed", amount: 1, when: zoneIs("triangle", "full") }] } })));
  run("validation : zone inconnue refusée", true, throws(() => validateTable({ x: { apex: [{ action: "speed", amount: 1, when: zoneIs("garden", "empty") }] } })));
  run("validation : état non déclaré pour la zone refusé (sac plein)", true, throws(() => validateTable({ x: { apex: [{ action: "speed", amount: 1, when: zoneIs("bag", "full") }] } })));

  // Textes : chaque zone et chaque état déclarés ont leur texte, dans chaque langue ;
  // la fiche dit la condition.
  const keys = Object.entries(GAME_ZONES).flatMap(([zone, { states }]) => states.map((state) => `marbles.condition.zone.${zone}.${state}`));
  for (const [locale, table] of Object.entries(LOCALE_TABLES)) {
    run.same(`${locale} : chaque état de zone a son texte`, [], keys.filter((key) => !Object.hasOwn(table, key)));
  }
  run(
    "fiche : « Pointe : Vitesse +6 si le triangle est plein »",
    "card.apex{effect: effect.combined{parts: [effect.conditional{effect: effect.combined{parts: [effect.speed_up{amount: 6}]}, condition: condition.zone.triangle.full}]}}",
    marbleCard("full", "x", fabricatedRules({ full: { apex: [{ action: "speed", amount: 6, when: zoneIs("triangle", "full") }] } }), t).above[0]
  );

  // Prévision : égale au réel.
  const watcher = fabricatedRules({ plain: {}, fuller: { apex: [{ action: "speed", amount: 6, when: zoneIs("triangle", "full") }] } });
  const full = marblesPlayState(watcher, { hand: inHand(["plain"]), triangle: { rightBase: placed("plain"), leftBase: null, apex: placed("fuller") } });
  run("prévision : la pose qui remplit le triangle, égale au réel", true, forecastMatches(watcher, full, { type: "place", handIndex: 0, slot: "leftBase" }));
  run("prévision : la pose qui remplit le triangle, Vitesse +6 prévue", 6, watcher.forecast(full, { type: "place", handIndex: 0, slot: "leftBase" }).phases.apex.speed);
}

function checkZoneCounts(run) {
  const rules = fabricatedRules({ plain: {} });
  const count = (zone, over) => amountOf({ base: 0, step: 1, source: zoneCount(zone) }, { state: marblesPlayState(rules, over) });
  run.same(
    "nombre de billes : actives, en main, sac, défausse, pot, perdues",
    [2, 3, 4, 1, 2, 1],
    ["triangle", "hand", "bag", "discard", "pot", "lost"].map((zone) =>
      count(zone, {
        triangle: { rightBase: placed("plain"), leftBase: null, apex: placed("plain") },
        hand: inHand(["plain", "plain", "plain"]),
        bag: ["plain", "plain", "plain", "plain"],
        discard: ["plain"],
        pot: ["plain", "plain"],
        lost: ["plain"],
      })
    )
  );
  run("plafond : 6 en main, maximum 5", 5, amountOf({ base: 0, step: 1, max: 5, source: zoneCount("hand") }, { state: marblesPlayState(rules, { hand: inHand(Array(6).fill("plain")), maxHandSize: 6 }) }));

  // En transit, la bille lancée n'est pas en main.
  const table = {
    plain: {},
    counter: { flick: [{ action: "speed", amount: { base: 0, step: 1, source: zoneCount("hand") } }] },
    handBase: { base: [{ action: "speed", amount: { base: 0, step: 1, source: zoneCount("hand"), max: 5 } }] },
  };
  const made = fabricatedRules(table);
  const flicked = mustReduce(made, marblesPlayState(made, { hand: inHand(["counter", "plain", "plain"]) }), { type: "place", handIndex: 0, slot: "apex" });
  run("transit : en Chiquenaude, la bille lancée ne se compte pas en main", 2, flicked.state.speed);

  // La fiche : la valeur actuelle dans la partie en cours ; hors partie, aucune.
  const game = marblesPlayState(made, { hand: inHand(["plain", "plain", "plain"]) });
  run(
    "fiche : « Base : Vitesse +1 par bille en main, maximum +5, actuellement +3 »",
    "card.base{effect: effect.combined{parts: [effect.computed_current{effect: effect.computed_max{effect: effect.per_zone{effect: effect.combined{parts: [effect.speed_up{amount: 1}]}, zone: hand}, max: +5}, current: +3}]}}",
    marbleCard("handBase", "x", made, t, { game }).above[1]
  );
  run("fiche hors partie : sans valeur actuelle", false, marbleCard("handBase", "x", made, t).above[1].includes("computed_current"));
  run("validation : zone inconnue refusée", true, throws(() => validateTable({ x: { base: [{ action: "speed", amount: { base: 0, step: 1, source: zoneCount("garden") } }] } })));

  // Prévision : égale au réel.
  const counting = marblesPlayState(made, { hand: inHand(["plain", "plain"]), triangle: { rightBase: placed("handBase"), leftBase: null, apex: null } });
  run("prévision : égale au réel, le nombre de billes en main", true, forecastMatches(made, counting, { type: "place", handIndex: 0, slot: "leftBase" }));
}
