// Vérifications du core — domaine « marbles ». Les règles du jeu des billes
// (marbles/core/marbles.js, doc/marbles.md) : ordre de résolution, usure, retrait,
// rotation, échange, déroulé d'une pose, Tic et Éjection, compteurs du tour,
// bonus, pioche et régénération, fin de partie, planchers, déterminisme,
// sérialisation ; puis un test de fumée de parties jouées au hasard. Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js marbles`).

import { auditNonSerializable, throws } from "../../lib/check.js";
import { SLOTS, createMarblesGame, impactOf, legalActions, nextSlot, previousSlot, swapRefusal, placeRefusal, throwRefusal, throwsLeft } from "../core/marbles.js";
import { JOURNAL_EVENTS, buildMarbleKeywords, validateMarblePhases, validateMarbleTriggers, validateMarbleTypes } from "../core/content.js";
import { MARBLE_PHASES, MARBLE_POCKET, MARBLE_TRIGGERS } from "../config/values.js";
import { CLAUSE_ACTIONS, amountOf, printedStat } from "../core/effects.js";
import { LARGE, MARBLE_SIZES, MARBLES_SETTINGS, MEDIUM, SMALL } from "../config/values.js";
import { CHOICELESS_TYPES, FIXTURE_BAG, FIXTURE_SETTINGS, FIXTURE_TYPES, fixtureRules } from "./fixtures/marbles.js";
import { answerChoices, caughtMessage, deepFreeze, eventTypes, fabricatedRules, handIds, inHand, marbleCount, marblesPlayState, mustReduce, placed, playRandomMarblesGame, triangleOf, validateTable, withSizes } from "./helpers.js";

// Les règles de la table des vérifications (marbles/checks/fixtures/marbles.js).
const rules = fixtureRules();
// La même table sans cible au choix ni Éjecter.
const fixedRules = fixtureRules(CHOICELESS_TYPES);

// Partie en cours de tour : le tour 2 par défaut, sac vide. `over` remplace ce que
// le test veut fixer.
function playState(over = {}) {
  return marblesPlayState(rules, over);
}

// Applique une action qui doit passer (helpers.js/mustReduce). `marbles` : les
// règles à appliquer, celles de la table des vérifications par défaut ; ou une table
// fabriquée, dont on fait les règles.
function apply(state, action, marbles = rules) {
  return mustReduce(typeof marbles.reduce === "function" ? marbles : fabricatedRules(marbles), state, action);
}

export default function checkMarbles(run) {
  run.section("table", checkTable);
  run.section("mise en place", checkSetup);
  run.section("pioche", checkDraw);
  run.section("échange", checkSwap);
  run.section("pose", checkPlace);
  run.section("lancers", checkThrows);
  run.section("Pioche des effets", checkDrawEffects);
  run.section("déclencheurs", checkTriggers);
  run.section("Final", checkFinal);
  run.section("Tic et Éjection", checkHitAndKnockout);
  run.section("Chiquenaude qui lit une valeur", checkTallyFlick);
  run.section("règle des cibles", checkTargetRule);
  run.section("Polissage et Fêlure", checkWearActions);
  run.section("billes d'usure", checkWearMarbles);
  run.section("conditions de calibre", checkSizeConditions);
  run.section("billes de calibre", checkSizeMarbles);
  run.section("Chiquenaude", checkFlick);
  run.section("tours en main", checkTurnsInHand);
  run.section("montants calculés", checkComputedAmounts);
  run.section("Trouvaille", checkWindfall);
  run.section("Éveil", checkAwaken);
  run.section("déclarations des mots-clés", checkKeywordDeclarations);
  run.section("bonus", checkBonus);
  run.section("résolution", checkResolution);
  run.section("fin de partie", checkEndOfGame);
  run.section("déterminisme", checkDeterminism);
  run.section("sérialisation", checkSerialization);
  run.section("fumée", checkSmoke);
  run.section("actions légales", checkLegalActions);
}

function checkTable(run) {
  run("usure par défaut", 3, rules.maxWearOf("aging_flick"));
  run("usure propre", 4, rules.maxWearOf("all_rounder"));
  run("usure 1 de one_shot", 1, rules.maxWearOf("one_shot"));
  run("usure de tally_flick", 3, rules.maxWearOf("tally_flick"));

  const amount = (clauses) => clauses[0].amount;
  run("variante : split_base, base gauche", 3, amount(rules.effectAt("split_base", "leftBase")));
  run("variante : split_base, base droite", "mass", rules.effectAt("split_base", "rightBase")[0].action);
  run("variante : la base droite n'a pas la Vitesse de base", 0, printedStat(rules.effectAt("split_base", "rightBase"), "speed"));
  run("sans variante : même effet sur les deux bases", rules.effectAt("aging_flick", "leftBase"), rules.effectAt("aging_flick", "rightBase"));
  run("pointe", 4, amount(rules.effectAt("aging_flick", "apex")));
  run("effet absent : aucun effet", 0, rules.effectAt("hit_pocket", "leftBase").length);
  run("effet absent : la même valeur partout", rules.effectAt("hit_pocket", "leftBase"), rules.effectAt("size_count", "apex"));

  run("imprimé : ce que la clause donne", 6, printedStat(rules.effectAt("hit_pocket", "apex"), "speed"));
  run("imprimé : une autre statistique ne compte pas", 0, printedStat(rules.effectAt("final_pocket", "apex"), "speed"));
  run("imprimé : négatif", -3, printedStat(rules.effectAt("flick_strike", "apex"), "speed"));
  run("imprimé : une clause conditionnelle ne compte pas", 0, printedStat(rules.effectAt("tally_flick", "leftBase"), "speed"));

  const refused = (name, table) => run(`table refusée : ${name}`, true, throws(() => validateTable(table)));
  const clause = { action: "speed", amount: 1 };
  refused("vide", {});
  refused("champ inconnu", { a: { wear: 3 } });
  refused("effet qui n'est pas une liste", { a: { base: { action: "speed", amount: 1 } } });
  refused("action inconnue", { a: { base: [{ action: "force", amount: 1 }] } });
  refused("valeur non entière", { a: { base: [{ action: "speed", amount: 1.5 }] } });
  refused("champ de clause inconnu", { a: { base: [{ ...clause, cible: "apex" }] } });
  refused("cible inconnue", { a: { base: [{ ...clause, target: "top" }] } });
  refused("condition inconnue", { a: { base: [{ ...clause, when: { type: "nope" } }] } });
  refused("condition sur un emplacement inconnu", { a: { base: [{ ...clause, when: { type: "printedStat", slot: "top", stat: "speed", atLeast: 1 } }] } });
  refused("condition sans seuil", { a: { base: [{ ...clause, when: { type: "printedStat", slot: "apex", stat: "speed" } }] } });
  refused("Tic mal formé", { a: { hit: "speed" } });
  refused("Éjection mal formée", { a: { knockout: [{ action: "nope", amount: 1 }] } });
  refused("usure nulle", { a: { maxWear: 0 } });
  refused("variante inconnue", { a: { baseVariant: { apex: [] } } });
  run("table acceptée : une bille sans aucun effet", false, throws(() => validateTable({ a: {} })));
  run("table acceptée : une variante", false, throws(() => validateTable({ a: { baseVariant: { rightBase: [clause] } } })));
  run("table acceptée : valeur négative", false, throws(() => validateTable({ a: { apex: [{ action: "mass", amount: -2 }] } })));

  // Le CALIBRE : obligatoire, l'un des trois, par ses constantes. Ces tables-là ne
  // passent pas par withSizes : c'est lui qu'on vérifie.
  const sizeRefused = (name, type) => run(`calibre, table refusée : ${name}`, true, throws(() => validateMarbleTypes({ a: type })));
  sizeRefused("sans calibre", {});
  sizeRefused("calibre inconnu (un entier hors des trois)", { size: LARGE + 1 });
  sizeRefused("calibre écrit en texte", { size: "large" });
  sizeRefused("calibre non entier", { size: 1.5 });
  for (const size of [SMALL, MEDIUM, LARGE]) {
    run(`calibre, table acceptée : ${MARBLE_SIZES[size]}`, false, throws(() => validateMarbleTypes({ a: { size } })));
  }
  run("calibre : trois, dans l'ordre", true, SMALL < MEDIUM && MEDIUM < LARGE);

  // Les règles (marbles/core/rules.js) : liées à UNE table, validée à la composition.
  run("règles : une table mal formée refusée à la composition", true, throws(() => fabricatedRules({ a: { maxWear: 0 } })));
  run("règles : la table des vérifications acceptée", false, throws(() => fixtureRules()));
  const custom = fabricatedRules({ aging_flick: { apex: [{ action: "speed", amount: 9 }], maxWear: 5 } });
  run("règles : chaque jeu de règles lit SA table", "3 5", `${rules.maxWearOf("aging_flick")} ${custom.maxWearOf("aging_flick")}`);
  run.same("règles : l'effet imprimé vient de sa table", [{ action: "speed", amount: 9 }], custom.effectAt("aging_flick", "apex"));
  run("règles : une partie neuve avec le sac de test", FIXTURE_BAG.length, rules.createGame(1).bag.length + rules.createGame(1).hand.length);
  run("règles : figées", true, Object.isFrozen(rules));
}

function checkSetup(run) {
  const game = rules.createGame(42);
  run("mise en place : sac complet", FIXTURE_BAG.length, game.bag.length);
  run.same("mise en place : sac mélangé, mêmes billes", [...FIXTURE_BAG].sort(), [...game.bag].sort());
  run("mise en place : sac réellement mélangé", false, game.bag.join() === FIXTURE_BAG.join());
  run.same("mise en place : main vide", [], game.hand);
  run.same("mise en place : défausse vide", [], game.discard);
  run.same("mise en place : triangle vide", triangleOf(null, null, null), game.triangle);
  run("mise en place : score 0", 0, game.score);
  run("mise en place : compteurs du tour", "0,1", `${game.speed},${game.mass}`);
  run("réglages : main maximale dans l'état", FIXTURE_SETTINGS.maxHandSize, game.maxHandSize);
  run("réglages : nombre de tours dans l'état", FIXTURE_SETTINGS.turnCount, game.turnCount);

  run("sac : bille inconnue refusée", true, throws(() => rules.createGame(1, { bag: ["aging_flick", "nope"] })));
  run("réglages : première pioche plus petite que le triangle permise", 2, rules.createGame(1, { firstTurnDraw: 2 }).firstTurnDraw);
  run("réglages : première pioche nulle refusée", true, throws(() => rules.createGame(1, { firstTurnDraw: 0 })));
  run("réglages : main plus petite que la première pioche refusée", true, throws(() => rules.createGame(1, { maxHandSize: 4 })));
  run("réglages : pioche par tour nulle refusée", true, throws(() => rules.createGame(1, { drawPerTurn: 0 })));
  const doubles = rules.createGame(1, { bag: ["aging_flick", "aging_flick", "aging_flick", "hit_polish", "hit_polish", "final_pocket"] });
  run("sac : doublons acceptés", 3, doubles.bag.filter((id) => id === "aging_flick").length);

  const fresh = rules.createGame(42);
  run("action inconnue refusée", "unknownAction", rules.reduce(fresh, { type: "cheat" }).error);
  run("action sans type refusée", "unknownAction", rules.reduce(fresh, null).error);
}

function checkDraw(run) {
  const game = rules.createGame(42);
  run("pioche obligatoire : pas de pose avant", "mustDraw", rules.reduce(game, { type: "place", handIndex: 0, slot: "apex" }).error);
  run("pioche obligatoire : pas d'échange avant", "mustDraw", rules.reduce(game, { type: "swap", a: "apex", b: "leftBase" }).error);
  run("pioche obligatoire : pas de résolution avant", "mustDraw", rules.reduce(game, { type: "resolve" }).error);

  const first = apply(game, { type: "draw" });
  run("pioche : 5 billes au premier tour", 5, first.state.hand.length);
  run("pioche : prend le haut du sac, dans l'ordre", game.bag.slice(0, 5).join(), handIds(first.state).join());
  run("pioche : sac diminué", 8, first.state.bag.length);
  run.same("pioche : journal", ["turnStarted", "draw", "draw", "draw", "draw", "draw"], eventTypes(first.events).filter((type) => type === "turnStarted" || type === "draw"));
  run("pioche : chaque bille piochée suivie de son éveil", true, first.events.every((event, index) => event.type !== "draw" || first.events[index + 1]?.type === "awaken"));
  run("pioche : refusée une seconde fois", "alreadyDrawn", rules.reduce(first.state, { type: "draw" }).error);

  // Tours suivants : une seule bille, ajoutée à ce qui reste en main.
  const later = apply({ ...playState({ hand: inHand(["aging_flick", "hit_polish", "final_pocket"]), bag: ["fragile", "hit_pocket", "size_count"] }), stage: "draw" }, { type: "draw" });
  run("pioche : 1 bille aux tours suivants", "aging_flick,hit_polish,final_pocket,fragile", handIds(later.state).join());
  run("pioche : le reste au sac", "hit_pocket,size_count", later.state.bag.join());
  run.same("pioche : journal du tour suivant", ["turnStarted", "draw", "awaken"], eventTypes(later.events));

  // Main pleine : la pioche est sautée, la bille reste au sac.
  const fullHand = inHand(["aging_flick", "hit_polish", "final_pocket", "awaken_draw", "all_rounder"]);
  const skipped = apply({ ...playState({ hand: fullHand, bag: ["one_shot", "hit_pocket"] }), stage: "draw" }, { type: "draw" });
  run.same("main pleine : journal", ["turnStarted", "drawSkipped"], eventTypes(skipped.events));
  run("main pleine : motif", "handFull", skipped.events[1].reason);
  run("main pleine : main inchangée", fullHand.map((held) => held.marble).join(), handIds(skipped.state).join());
  run("main pleine : la bille reste au sac", "one_shot,hit_pocket", skipped.state.bag.join());
  run("main pleine : le tour se joue", "play", skipped.state.stage);
  const fullNoBag = apply({ ...playState({ hand: fullHand, bag: [], discard: ["one_shot"] }), stage: "draw" }, { type: "draw" });
  run("main pleine : pas de régénération, même sac vide", false, eventTypes(fullNoBag.events).includes("bagRegenerated"));
  run("main pleine : la partie continue, même défausse courte", "play", fullNoBag.state.stage);
  const almostFull = apply({ ...playState({ hand: fullHand.slice(0, 4), bag: ["one_shot", "hit_pocket"] }), stage: "draw" }, { type: "draw" });
  run("main à 4 billes : la pioche passe", 5, almostFull.state.hand.length);

  // Une pioche de plusieurs billes s'arrête quand la main est pleine.
  const large = apply({ ...playState({ hand: fullHand.slice(0, 4), bag: ["hit_pocket", "size_count", "fragile"], drawPerTurn: 3 }), stage: "draw" }, { type: "draw" });
  run.same("pioche de 3 : s'arrête à la main pleine", ["turnStarted", "draw", "awaken", "drawSkipped"], eventTypes(large.events));
  run("pioche de 3 : le reste au sac", "size_count,fragile", large.state.bag.join());

  // Régénération pendant la pioche : le mélange, puis la bille.
  const regen = apply({ ...playState({ hand: inHand(["aging_flick"]), bag: [], discard: ["final_pocket", "fragile", "hit_pocket", "size_count"] }), stage: "draw" }, { type: "draw" });
  run.same("régénération : journal dans l'ordre", ["turnStarted", "bagRegenerated", "draw", "awaken"], eventTypes(regen.events));
  run("régénération : taille annoncée", 4, regen.events[1].size);
  run("régénération : défausse vidée", 0, regen.state.discard.length);
  run("régénération : une bille piochée", 2, regen.state.hand.length);
  run("régénération : le reste au sac", 3, regen.state.bag.length);
  run("régénération : mêmes billes après coup", "aging_flick,final_pocket,fragile,hit_pocket,size_count", [...handIds(regen.state), ...regen.state.bag].sort().join());

  const midDraw = apply(
    { ...playState({ hand: inHand([]), bag: ["hit_polish"], discard: ["final_pocket", "fragile", "hit_pocket"], turn: 1 }), stage: "draw" },
    { type: "draw" }
  );
  run.same(
    "régénération en cours de pioche : ce qui restait d'abord",
    ["turnStarted", "draw", "awaken", "bagRegenerated", "draw", "awaken", "draw", "awaken", "draw", "awaken"],
    eventTypes(midDraw.events).slice(0, 10)
  );
  run("régénération en cours de pioche : la bille du sac en premier", "hit_polish", midDraw.state.hand[0].marble);

  // Un sac qui se vide sans que la pioche demande une bille de plus ne régénère pas.
  const exact = apply({ ...playState({ hand: inHand(["aging_flick"]), bag: ["fragile"], discard: ["one_shot"] }), stage: "draw" }, { type: "draw" });
  run("pas de régénération sans bille demandée", false, eventTypes(exact.events).includes("bagRegenerated"));
  run("pas de régénération : sac vide", 0, exact.state.bag.length);
}

// Les mots-clés : sans nom ni description, le chargement échoue.
function checkKeywordDeclarations(run) {
  const texts = { name: "a.name", description: "a.description" };
  const build = (over) => () => buildMarbleKeywords({ phases: MARBLE_PHASES, triggers: MARBLE_TRIGGERS, pocket: MARBLE_POCKET, actions: CLAUSE_ACTIONS, ...over });
  run("mots-clés : les vraies listes passent", false, throws(build({})));
  run("mots-clés : une action sans description refusée", true, throws(build({ actions: { ...CLAUSE_ACTIONS, spin: { kind: "marble", keyword: { texts: { name: "x" } } } } })));
  run("mots-clés : une phase sans description refusée", true, throws(build({ phases: [{ ...MARBLE_PHASES[0], texts: { name: "x" } }] })));
  run(
    "mots-clés : une action fictive a son mot-clé",
    true,
    buildMarbleKeywords({ phases: MARBLE_PHASES, triggers: MARBLE_TRIGGERS, pocket: MARBLE_POCKET, actions: { ...CLAUSE_ACTIONS, spin: { kind: "marble", keyword: { texts } } } }).some(
      (keyword) => keyword.id === "spin"
    )
  );
  run("mots-clés : En poche sans description refusé", true, throws(build({ pocket: { ...MARBLE_POCKET, texts: { name: "x" } } })));
  const [awaken] = MARBLE_TRIGGERS;
  run("mots-clés : un déclencheur sans description refusé", true, throws(() => validateMarbleTriggers([{ ...awaken, texts: { card: "c", effect: "e", name: "n" } }])));
  run("mots-clés : une liste de phases sans description refusée", true, throws(() => validateMarblePhases([{ ...MARBLE_PHASES[0], texts: { name: "x" } }, MARBLE_PHASES[1]])));
  run("phases : chaque emplacement dans une phase", true, throws(() => validateMarblePhases([MARBLE_PHASES[0]])));
}

// L'Éveil : à chaque bille réellement piochée, quelle qu'en soit la cause, juste
// après sa pioche et avant la suivante ; la bille en main, à 0 tour en main.
function checkAwaken(run) {
  // Le journal, chaque évènement avec sa bille (la pioche aussi) ; l'effet, son
  // déclencheur.
  const journal = (events) =>
    events.map((event) => {
      if (event.type === "effect") return `effect:${event.trigger}:${event.marble}`;
      return event.marble === undefined ? event.type : `${event.type}:${event.marble}`;
    });

  // Pioche du début de tour : les compteurs du NOUVEAU tour (remis à zéro par la
  // résolution).
  const ended = apply(playState({ hand: inHand([]), bag: ["all_rounder", "aging_flick"], triangle: triangleOf(placed("aging_flick"), null, null) }), { type: "resolve" });
  const turnStart = apply(ended.state, { type: "draw" });
  run.same("éveil, début de tour : pioche, éveil, effet", ["turnStarted", "draw:all_rounder", "awaken:all_rounder", "effect:awaken:all_rounder"], journal(turnStart.events));
  run("éveil, début de tour : la Vitesse au compteur du nouveau tour", 2, turnStart.state.speed);
  run("éveil, début de tour : la bille en main", "all_rounder", handIds(turnStart.state).join());

  // Pioche d'un effet (le Tic de split_base) : l'éveil aussi.
  const tic = apply(playState({ hand: inHand(["split_base"]), bag: ["all_rounder"], triangle: triangleOf(null, null, placed("hit_polish")) }), { type: "place", handIndex: 0, slot: "apex" });
  run.same("éveil, pioche d'un effet : après la pioche", ["draw:all_rounder", "awaken:all_rounder", "effect:awaken:all_rounder"], journal(tic.events).slice(-3));
  run("éveil, pioche d'un effet : la Vitesse au compteur du tour en cours", 2, tic.state.speed);

  // Main pleine : la bille reste au sac, pas d'éveil.
  const full = apply({ ...playState({ hand: inHand(["aging_flick", "hit_polish", "final_pocket", "fragile", "hit_pocket"]), bag: ["all_rounder"] }), stage: "draw" }, { type: "draw" });
  run.same("éveil, main pleine : pas de pioche, pas d'éveil", ["turnStarted", "drawSkipped"], journal(full.events));

  // Ordre : régénération, trouvailles, pioche, éveil, pioche suivante.
  const ordered = apply(
    { ...playState({ hand: inHand([]), bag: [], discard: ["all_rounder"], drawPerTurn: 2, triangle: triangleOf(placed("final_pocket", 1), null, null) }), stage: "draw" },
    { type: "draw" }
  );
  run.same(
    "éveil, ordre : régénération, trouvaille, pioche, éveil, puis l'arrêt de la pioche",
    ["turnStarted", "bagRegenerated", "windfall:final_pocket", "effect:windfall:final_pocket", "polished:final_pocket", "draw:all_rounder", "awaken:all_rounder", "effect:awaken:all_rounder", "drawSkipped"],
    journal(ordered.events)
  );

  // L'enchaînement de awaken_draw : chaque awaken_draw piochée pioche la suivante, avant que la
  // pioche du tour ne reprenne.
  const chain = apply({ ...playState({ hand: inHand([]), bag: ["awaken_draw", "awaken_draw", "aging_flick", "hit_polish"] }), stage: "draw" }, { type: "draw" });
  run.same(
    "éveil, enchaînement de awaken_draw",
    ["turnStarted", "draw:awaken_draw", "awaken:awaken_draw", "effect:awaken:awaken_draw", "draw:awaken_draw", "awaken:awaken_draw", "effect:awaken:awaken_draw", "draw:aging_flick", "awaken:aging_flick"],
    journal(chain.events)
  );
  run("éveil, enchaînement : trois billes en main", "awaken_draw,awaken_draw,aging_flick", handIds(chain.state).join());
  run.same("éveil, enchaînement : compteurs d'éveils et de billes piochées", { awaken: 2, drawnMarbles: 3, draw: 2, drawQuantity: 2 }, {
    awaken: chain.state.tally.awaken.game,
    drawnMarbles: chain.state.tally.drawnMarbles.game,
    draw: chain.state.tally.draw.game,
    drawQuantity: chain.state.tally.drawQuantity.game,
  });
  // Avec une régénération au milieu, puis plus rien : l'enchaînement s'arrête.
  const regenerated = apply({ ...playState({ hand: inHand([]), bag: ["awaken_draw"], discard: ["awaken_draw"] }), stage: "draw" }, { type: "draw" });
  run.same(
    "éveil, enchaînement avec régénération",
    ["turnStarted", "draw:awaken_draw", "awaken:awaken_draw", "effect:awaken:awaken_draw", "bagRegenerated", "draw:awaken_draw", "awaken:awaken_draw", "effect:awaken:awaken_draw", "drawSkipped"],
    journal(regenerated.events)
  );
  run("éveil, enchaînement avec régénération : la partie continue", "play", regenerated.state.stage);
  // Borné par la main pleine.
  const bounded = apply({ ...playState({ hand: inHand(["aging_flick", "hit_polish", "final_pocket", "fragile"]), bag: ["awaken_draw", "awaken_draw", "awaken_draw"] }), stage: "draw" }, { type: "draw" });
  run.same("éveil, enchaînement borné par la main pleine", ["draw:awaken_draw", "awaken:awaken_draw", "effect:awaken:awaken_draw", "drawSkipped"], journal(bounded.events).slice(1));

  // Règle des cibles : le Polissage ciblé de one_shot sur la pointe ; un emplacement
  // vide, noté.
  const oneShot = (apex) => apply({ ...playState({ hand: inHand([]), bag: ["one_shot"], triangle: triangleOf(null, null, apex) }), stage: "draw" }, { type: "draw" });
  run("éveil, cible : one_shot polit la pointe", 0, oneShot(placed("all_rounder", 2)).state.triangle.apex.wear - 1);
  run.same(
    "éveil, cible : pointe vide, notée avec son effet",
    { type: "targetEmpty", action: "polish", slot: "apex", by: { trigger: "awaken", slot: null, marble: "one_shot" } },
    oneShot(null).events.at(-1)
  );
  // Un bonus de Vitesse ciblé : donné avant la phase, perdu après.
  const gifts = { waker: { awaken: [{ action: "speed", amount: 2, target: "apex" }] }, finisher: { maxWear: 1, final: [{ action: "draw", amount: 1 }] }, plain: {} };
  const before = apply(playState({ hand: inHand(["plain"]), bag: ["waker"], triangle: triangleOf(null, null, placed("plain")) }), { type: "place", handIndex: 0, slot: "leftBase" }, gifts);
  run("éveil : une pose sans pioche n'éveille rien", undefined, before.events.find((event) => event.trigger === "awaken"));
  const dropper = { ...gifts, dropper: { flick: [{ action: "draw", amount: 1 }] } };
  const given = apply(playState({ hand: inHand(["dropper"]), bag: ["waker"], triangle: triangleOf(null, null, placed("plain")) }), { type: "place", handIndex: 0, slot: "leftBase" }, dropper);
  run("éveil, cible : en phase de jeu, le bonus donné à la pointe", 2, given.state.triangle.apex.bonus?.speed);
  const late = apply(playState({ bag: ["waker"], triangle: triangleOf(placed("finisher"), null, placed("plain")) }), { type: "resolve" }, gifts);
  run.same(
    "éveil, cible : après les phases, le bonus perdu, noté",
    [{ slot: "apex", reason: "phasePassed", speed: 2, mass: 0 }],
    late.events.find((event) => event.trigger === "awaken").lost
  );

  // Validation : une action sur la bille elle-même est refusée (elle est en main).
  run("éveil, validation : Polissage sur soi refusé", true, throws(() => validateTable({ a: { awaken: [{ action: "polish", amount: 1 }] } })));
  run("éveil, validation : Fêlure ciblée permise", false, throws(() => validateTable({ a: { awaken: [{ action: "crack", amount: 1, target: "apex" }] } })));
  run("éveil, validation : Pioche permise", false, throws(() => validateTable({ a: { awaken: [{ action: "draw", amount: 1 }] } })));
  run("éveil, validation : Vitesse ciblée permise", false, throws(() => validateTable({ a: { awaken: [{ action: "speed", amount: 1, target: "leftBase" }] } })));

  // Une bille fabriquée qui n'a pas d'Éveil : l'évènement passe, sans effet.
  const quiet = apply({ ...playState({ hand: inHand([]), bag: ["aging_flick"] }), stage: "draw" }, { type: "draw" });
  run.same("éveil : sans le champ, l'évènement seul", ["turnStarted", "draw:aging_flick", "awaken:aging_flick"], journal(quiet.events));
}

function checkSwap(run) {
  const agingFlick = placed("aging_flick", 1);
  const hitPolish = placed("hit_polish", 2);

  const both = apply(playState({ triangle: triangleOf(agingFlick, hitPolish, null) }), { type: "swap", a: "leftBase", b: "rightBase" });
  run.same("échange : contenu interverti, usure gardée", triangleOf(hitPolish, agingFlick, null), both.state.triangle);
  run.same("échange : ni Tic ni Éjection", ["swapped"], eventTypes(both.events));

  const move = apply(playState({ triangle: triangleOf(agingFlick, null, null) }), { type: "swap", a: "leftBase", b: "apex" });
  run.same("échange avec un vide : déplacement, usure gardée", triangleOf(null, null, agingFlick), move.state.triangle);

  const moveBack = apply(playState({ triangle: triangleOf(null, null, agingFlick) }), { type: "swap", a: "leftBase", b: "apex" });
  run.same("échange depuis un vide : même déplacement", triangleOf(agingFlick, null, null), moveBack.state.triangle);

  run("échange : une seule fois par tour", "swapAlreadyUsed", rules.reduce(both.state, { type: "swap", a: "leftBase", b: "apex" }).error);
  run("échange : deux vides refusés", "swapBothEmpty", rules.reduce(playState({ triangle: triangleOf(agingFlick, null, null) }), { type: "swap", a: "rightBase", b: "apex" }).error);
  run("échange : même emplacement refusé", "swapSameSlot", rules.reduce(playState({ triangle: triangleOf(agingFlick, null, null) }), { type: "swap", a: "leftBase", b: "leftBase" }).error);
  run("échange : emplacement inconnu refusé", "invalidSlot", rules.reduce(playState(), { type: "swap", a: "leftBase", b: "top" }).error);

  // Un refus ne consomme rien : l'état rendu est l'état reçu.
  const state = playState({ triangle: triangleOf(agingFlick, null, null) });
  run("refus : état inchangé", state, rules.reduce(state, { type: "swap", a: "rightBase", b: "apex" }).state);
  run.same("refus : journal vide", [], rules.reduce(state, { type: "swap", a: "rightBase", b: "apex" }).events);

  // L'ordre du tour : l'échange vient avant la pose.
  const afterPlace = apply(playState({ hand: inHand(["final_pocket"]), triangle: triangleOf(agingFlick, null, null) }), { type: "place", handIndex: 0, slot: "apex" });
  run("échange : refusé après une pose", "swapAfterPlacement", rules.reduce(afterPlace.state, { type: "swap", a: "leftBase", b: "apex" }).error);
  run("swapRefusal : disponible", null, swapRefusal(playState()));
  run("swapRefusal : même code que l'action", "swapAfterPlacement", swapRefusal(afterPlace.state));

  // L'échange revient au tour suivant.
  const nextTurn = apply({ ...both.state, stage: "draw", hand: inHand([]), bag: ["final_pocket", "awaken_draw", "all_rounder", "base_pocket", "size_count"] }, { type: "draw" });
  run("échange : rendu par la pioche du tour suivant", null, swapRefusal(nextTurn.state));
  const placeThenDraw = apply({ ...afterPlace.state, stage: "draw", hand: inHand([]), bag: ["awaken_draw", "all_rounder", "base_pocket", "size_count", "hit_pocket"] }, { type: "draw" });
  run("pose : l'échange revient au tour suivant", null, swapRefusal(placeThenDraw.state));
}

// Les LANCERS : une pose depuis la main en est un, l'échange non ; la limite du
// tour borne ce que le joueur peut enchaîner.
function checkThrows(run) {
  run("lancers : sans réglage donné, la limite des réglages du jeu", MARBLES_SETTINGS.throwsPerTurn, createMarblesGame(1, { bag: FIXTURE_BAG }, FIXTURE_TYPES).throwsPerTurn);
  run("lancers : une partie neuve n'en a joué aucun", 0, rules.createGame(1).throwsUsed);
  run("lancers : la limite vient du réglage", 5, rules.createGame(1).throwsPerTurn);
  run("lancers : un seul permis (plus de poses obligatoires au premier tour)", 1, rules.createGame(1, { throwsPerTurn: 1 }).throwsPerTurn);
  run("lancers : zéro refusé", true, throws(() => rules.createGame(1, { throwsPerTurn: 0 })));

  // Cinq poses, puis plus rien. Le sac de la main : six billes pour en avoir une de trop.
  let state = playState({ hand: inHand(["aging_flick", "hit_polish", "final_pocket", "awaken_draw", "all_rounder"]), maxHandSize: 6, throwsPerTurn: 5 });
  state = { ...state, hand: [...state.hand, ...inHand(["one_shot"])] };
  for (let count = 0; count < 5; count++) state = apply(state, { type: "place", handIndex: 0, slot: SLOTS[count % 3] }).state;
  run("lancers : cinq poses jouées", 5, state.throwsUsed);
  run("lancers : plus aucun", 0, throwsLeft(state));
  const sixth = rules.reduce(state, { type: "place", handIndex: 0, slot: "apex" });
  run("lancers : la sixième pose refusée", "noThrowsLeft", sixth.error);
  run("lancers : refus sans effet", state, sixth.state);
  run("lancers : refusé dès la prise", "noThrowsLeft", throwRefusal(state));
  run("lancers : placeRefusal dit pareil", "noThrowsLeft", placeRefusal(state, 0, "leftBase"));
  run("lancers : la résolution reste permise", true, rules.reduce(state, { type: "resolve" }).ok);
  run("lancers : plus de pose dans les actions légales", false, legalActions(state).some((action) => action.type === "place"));

  // L'échange n'est pas un lancer.
  const swapped = apply(playState({ hand: inHand(["aging_flick"]), triangle: triangleOf(placed("hit_polish"), null, null) }), { type: "swap", a: "leftBase", b: "apex" });
  run("lancers : l'échange n'en compte pas", 0, swapped.state.throwsUsed);

  // Remis à zéro à la pioche du tour.
  const next = apply({ ...state, stage: "draw", bag: ["aging_flick"] }, { type: "draw" });
  run("lancers : remis à zéro à la pioche", 0, next.state.throwsUsed);

  // Au premier tour, plus aucune protection : le joueur peut dépenser ses lancers
  // en remplacements, quitte à laisser des emplacements vides.
  const firstTurn = playState({ turn: 1, hand: inHand(["aging_flick", "hit_polish", "final_pocket", "awaken_draw"]), throwsUsed: 3, triangle: triangleOf(placed("all_rounder"), null, null) });
  run("premier tour : 2 lancers pour 2 vides, remplacer reste permis", null, placeRefusal(firstTurn, 0, "leftBase"));
  // Le Tic de hit_polish fait choisir sa cible : la première répond.
  const lastThrow = answerChoices(rules, apply(apply(firstTurn, { type: "place", handIndex: 0, slot: "leftBase" }).state, { type: "place", handIndex: 0, slot: "leftBase" })).state;
  run("premier tour : lancers épuisés, deux emplacements vides", 0, throwsLeft(lastThrow));
  run("premier tour : la résolution se lance quand même", true, rules.reduce(lastThrow, { type: "resolve" }).ok);
}

// La PIOCHE, mot-clé d'effet : la pioche unifiée (drawOne), déclenchée par un Tic,
// une Éjection ou une phase, à tout moment du tour.
function checkDrawEffects(run) {
  // Validation : jamais de cible, au moins une bille, dans tout champ d'effet.
  const draw1 = { action: "draw", amount: 1 };
  run("pioche : une cible refusée", true, throws(() => validateTable({ a: { hit: [{ ...draw1, target: "apex" }] } })));
  run("pioche : zéro bille refusée", true, throws(() => validateTable({ a: { hit: [{ action: "draw", amount: 0 }] } })));
  run("pioche : une valeur non entière refusée", true, throws(() => validateTable({ a: { apex: [{ action: "draw", amount: 1.5 }] } })));
  run(
    "pioche : acceptée en base, variante, pointe, tic et éjection",
    false,
    throws(() => validateTable({ a: { base: [draw1], baseVariant: { leftBase: [draw1] }, apex: [draw1], hit: [draw1], knockout: [draw1] } }))
  );
  run("pioche : avec une condition", false, throws(() => validateTable({ a: { apex: [{ ...draw1, when: { type: "printedStat", slot: "apex", stat: "speed", atLeast: 1 } }] } })));
  run.same("imprimé : la Pioche se lit comme une autre valeur", 1, printedStat(rules.effectAt("awaken_draw", "leftBase"), "draw"));

  // Tic qui pioche : l'effet, puis la bille. Elle se joue dans le même tour.
  const hit = apply(
    playState({ hand: inHand(["split_base"]), bag: ["base_pocket", "final_pocket"], triangle: triangleOf(null, null, placed("hit_polish")) }),
    { type: "place", handIndex: 0, slot: "apex" }
  );
  run.same("tic qui pioche : journal", ["flick", "removed", "knockout", "discarded", "placed", "hit", "effect", "draw", "awaken"], eventTypes(hit.events));
  run("tic qui pioche : l'effet dit sa Pioche", 1, hit.events[6].draw);
  run("tic qui pioche : le haut du sac", "base_pocket", hit.events[7].marble);
  run("tic qui pioche : en main", "base_pocket", handIds(hit.state).join());
  const replay = rules.reduce(hit.state, { type: "place", handIndex: 0, slot: "leftBase" });
  run("tic qui pioche : la bille piochée se joue dans le même tour", true, replay.ok);

  // Éjection qui pioche.
  const knockout = apply(
    playState({ hand: inHand(["aging_flick"]), bag: ["final_pocket"], triangle: triangleOf(null, null, placed("size_count")) }),
    { type: "place", handIndex: 0, slot: "apex" }
  );
  // aging_flick a une Chiquenaude (à 0 tour en main, elle ne produit rien) : son effet passe.
  run.same(
    "éjection qui pioche : journal",
    ["flick", "effect", "removed", "knockout", "effect", "draw", "awaken", "discarded", "placed", "hit", "effect"],
    eventTypes(knockout.events)
  );
  run("éjection qui pioche : en main", "final_pocket", handIds(knockout.state).join());

  // Phase qui pioche : la bille attend le tour suivant (elle est en main à sa pioche).
  const phase = apply(playState({ hand: inHand([]), bag: ["final_pocket", "all_rounder"], triangle: triangleOf(null, placed("awaken_draw"), null) }), { type: "resolve" });
  run.same("phase qui pioche : l'effet puis la bille", ["phase", "effect", "draw", "awaken", "wear"], eventTypes(phase.events).slice(0, 5));
  run("phase qui pioche : la Pioche ne touche ni Vitesse ni Masse", 0, phase.events[1].speedDelta + phase.events[1].massDelta);
  run("phase qui pioche : en main après la résolution", "final_pocket", handIds(phase.state).join());
  run("phase qui pioche : le tour suivant reste à piocher", "draw", phase.state.stage);
  run("phase qui pioche : pas jouable avant la pioche du tour", "mustDraw", placeRefusal(phase.state, 0, "apex"));
  const nextTurn = apply(phase.state, { type: "draw" });
  run("phase qui pioche : jouable au tour suivant", null, placeRefusal(nextTurn.state, 0, "apex"));

  // Régénération pendant la phase de jeu (un Tic) et pendant la résolution.
  const regenPlay = apply(
    playState({ hand: inHand(["split_base"]), bag: [], discard: ["final_pocket", "fragile"], triangle: triangleOf(null, null, placed("hit_polish")) }),
    { type: "place", handIndex: 0, slot: "apex" }
  );
  // La régénération, puis la Trouvaille de chaque bille active (ici split_base, sans
  // ce champ : l'évènement passe, sans effet), puis la pioche reprend.
  run.same("régénération en jeu : dans le journal de la pose", ["hit", "effect", "bagRegenerated", "windfall", "draw", "awaken"], eventTypes(regenPlay.events).slice(-6));
  run("régénération en jeu : la défausse entière, bille remplacée comprise", 3, regenPlay.events.find((event) => event.type === "bagRegenerated").size);
  run("régénération en jeu : la partie continue", "play", regenPlay.state.stage);
  const regenResolve = apply(playState({ hand: inHand([]), bag: [], discard: ["final_pocket"], triangle: triangleOf(null, placed("awaken_draw"), null) }), { type: "resolve" });
  run.same("régénération en résolution : dans le journal", ["phase", "effect", "bagRegenerated", "windfall", "draw", "awaken"], eventTypes(regenResolve.events).slice(0, 6));
  run("régénération en résolution : la bille en main", "final_pocket", handIds(regenResolve.state).join());

  // Arrêts : main pleine (pas de régénération), plus de billes (pas de fin de partie).
  const full = apply(
    playState({ hand: inHand(["split_base", "aging_flick", "hit_polish", "final_pocket", "all_rounder"]), bag: [], discard: ["hit_pocket"], triangle: triangleOf(null, null, placed("base_pocket")) }),
    { type: "place", handIndex: 0, slot: "apex" }
  );
  run.same("tic qui pioche, main pleine après la pose : la pioche passe", ["draw", "awaken"], eventTypes(full.events).slice(-2));
  const fuller = { ...playState({ hand: inHand(["split_base", "aging_flick", "hit_polish", "final_pocket", "all_rounder"]), maxHandSize: 4 }) };
  const stopped = apply({ ...fuller, bag: [], discard: ["one_shot"], triangle: triangleOf(null, null, placed("base_pocket")) }, { type: "place", handIndex: 0, slot: "apex" });
  run.same("tic qui pioche, main pleine : arrêt sans régénération", ["effect", "drawSkipped"], eventTypes(stopped.events).slice(-2));
  run("tic qui pioche, main pleine : motif", "handFull", stopped.events.at(-1).reason);
  const none = apply(playState({ hand: inHand(["split_base"]), bag: [], discard: [], triangle: triangleOf(null, null, placed("hit_polish")) }), { type: "place", handIndex: 0, slot: "apex" });
  // La bille remplacée vient d'arriver en défausse : elle est repiochée.
  run("tic qui pioche, sac vide : la remplacée revient", "hit_polish", handIds(none.state).join());
  const nothing = apply(playState({ hand: inHand([]), bag: [], discard: [], triangle: triangleOf(null, placed("awaken_draw"), null) }), { type: "resolve" });
  run("phase qui pioche, rien à piocher : arrêt annoncé", "noMarbles", nothing.events.find((event) => event.type === "drawSkipped").reason);
  run("phase qui pioche, rien à piocher : jamais une fin de partie en cours de tour", "draw", nothing.state.stage);

  // ANTI-BOUCLE : un Tic qui pioche à chaque pose, avec régénération possible ;
  // les lancers arrêtent le joueur à 5 poses.
  let loop = playState({
    hand: inHand(["split_base"]),
    bag: [],
    discard: [],
    triangle: triangleOf(placed("split_base"), placed("split_base"), placed("split_base")),
  });
  let accepted = 0;
  let lastError = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = rules.reduce(loop, { type: "place", handIndex: 0, slot: SLOTS[attempt % 3] });
    if (!result.ok) {
      lastError = result.error;
      break;
    }
    accepted += 1;
    loop = result.state;
  }
  run("anti-boucle : la main se recharge à chaque pose", 1, loop.hand.length);
  run("anti-boucle : 5 poses au plus dans le tour", 5, accepted);
  run("anti-boucle : la suivante refusée", "noThrowsLeft", lastError);
}

// La liste des déclencheurs, déclarée une fois (marbles/config/values.js).
function checkTriggers(run) {
  run.same(
    "déclencheurs : éveil, chiquenaude, tic, trouvaille, éjection, final, chute, dans l'ordre de la fiche",
    ["awaken", "flick", "hit", "windfall", "knockout", "final", "drop"],
    MARBLE_TRIGGERS.map((trigger) => trigger.id)
  );
  run("déclencheurs : la vraie liste acceptée", false, throws(() => validateMarbleTriggers(MARBLE_TRIGGERS)));
  const [hit] = MARBLE_TRIGGERS;
  const refused = (name, list) => run(`déclencheurs refusés : ${name}`, true, throws(() => validateMarbleTriggers(list)));
  refused("id en double", [hit, { ...hit, field: "other", event: "other" }]);
  refused("champ en double", [hit, { ...hit, id: "other", event: "other" }]);
  refused("la phase n'en est pas un", [{ ...hit, id: "phase" }]);
  refused("un champ de phase", [{ ...hit, field: "apex" }]);
  refused("bille concernée inconnue", [{ ...hit, marble: "hand" }]);
  refused("ligne de prévision inconnue", [{ ...hit, forecast: { line: "elsewhere" } }]);
  refused("ligne de pose sans son texte", [{ ...hit, texts: { card: "a", effect: "b" } }]);
  refused("ligne d'emplacement sans son texte", [{ ...hit, forecast: { line: "slot" } }]);
  refused("place dans la fiche inconnue", [{ ...hit, card: "above" }]);
  refused("champ inconnu", [{ ...hit, extra: 1 }]);
  run("table : le champ final accepté", false, throws(() => validateTable({ a: { final: [{ action: "speed", amount: 1 }] } })));
  run("table : un champ de déclencheur inconnu refusé", true, throws(() => validateTable({ a: { finale: [] } })));
}

// Le FINAL : au retrait par usure seulement, la bille EN PARTANCE (partie de son
// emplacement, pas encore arrivée à la défausse), avant l'Impact, ses valeurs
// comptant pour le tour.
function checkFinal(run) {
  // fragile (usure 2) en pointe, déjà usée une fois : elle s'use, part, son Final joue.
  const worn = apply(playState({ hand: inHand([]), bag: ["aging_flick"], triangle: triangleOf(null, null, placed("fragile", 1)) }), { type: "resolve" });
  run.same(
    "final : départ, Final en partance (son Polissage au choix sans aucune cible), arrivée à la défausse, puis l'Impact",
    ["phase", "effect", "wear", "removed", "final", "effect", "targetEmpty", "discarded", "impact"],
    eventTypes(worn.events).slice(eventTypes(worn.events).indexOf("phase"), eventTypes(worn.events).indexOf("impact") + 1)
  );
  const final = worn.events.filter((event) => event.type === "effect").at(-1);
  run.same("final : son effet", { trigger: "final", slot: "apex", marble: "fragile", speedDelta: 4, massDelta: 0, draw: 0 }, {
    trigger: final.trigger,
    slot: final.slot,
    marble: final.marble,
    speedDelta: final.speedDelta,
    massDelta: final.massDelta,
    draw: final.draw,
  });
  run("final : la bille est déjà à la défausse", "fragile", worn.state.discard.join());
  run("final : sa Vitesse compte pour l'Impact du tour (5 de phase + 4)", 9, worn.events.find((event) => event.type === "impact").impact);

  // all_rounder : la Masse du Final compte aussi.
  // all_rounder d'avant Éjecter : sa base donne Vitesse +3, sans choix.
  const allRounder = apply(playState({ hand: inHand([]), bag: ["aging_flick"], triangle: triangleOf(placed("all_rounder", 3), null, null) }), { type: "resolve" }, fixedRules);
  run.same("final : la Masse compte (Vitesse 3, Masse 1 + 1)", { speed: 3, mass: 2, impact: 6 }, (({ speed, mass, impact }) => ({ speed, mass, impact }))(allRounder.events.find((event) => event.type === "impact")));

  // Pas usée : pas de Final.
  const fresh = apply(playState({ hand: inHand([]), bag: ["aging_flick"], triangle: triangleOf(null, null, placed("fragile", 0)) }), { type: "resolve" });
  run("final : pas d'usure maximale, pas de Final", false, eventTypes(fresh.events).includes("final"));

  // Jamais à une éjection, un échange, une pose.
  const knocked = apply(playState({ hand: inHand(["aging_flick"]), bag: ["hit_polish"], triangle: triangleOf(null, null, placed("fragile", 1)) }), { type: "place", handIndex: 0, slot: "apex" });
  run("final : jamais à une éjection", false, eventTypes(knocked.events).includes("final"));
  const swapped = apply(playState({ hand: inHand([]), triangle: triangleOf(placed("fragile", 1), null, placed("all_rounder", 3)) }), { type: "swap", a: "leftBase", b: "apex" });
  run("final : jamais à un échange", false, eventTypes(swapped.events).includes("final"));
  const placedOneShot = apply(playState({ hand: inHand(["one_shot"]), bag: ["hit_polish"] }), { type: "place", handIndex: 0, slot: "apex" });
  run("final : jamais à une pose, même d'une bille d'usure 1", false, eventTypes(placedOneShot.events).includes("final"));

  // Plusieurs retraits : dans l'ordre des phases, chacun avec son Final.
  const both = apply(playState({ hand: inHand([]), bag: ["aging_flick"], triangle: triangleOf(placed("all_rounder", 3), null, placed("fragile", 1)) }), { type: "resolve" }, fixedRules);
  run.same(
    "final : dans l'ordre des phases",
    ["all_rounder", "fragile"],
    both.events.filter((event) => event.type === "effect" && event.trigger === "final").map((event) => event.marble)
  );

  // one_shot : son Final pioche par la pioche unifiée ; la bille attend le tour suivant.
  const oneShot = apply(playState({ hand: inHand([]), bag: ["final_pocket"], triangle: triangleOf(null, null, placed("one_shot")) }), { type: "resolve" });
  run.same("final, pioche : l'effet, puis la bille, avant l'Impact", ["final", "effect", "draw", "impact"], eventTypes(oneShot.events).filter((type) => ["final", "effect", "draw", "impact"].includes(type)).slice(-4));
  run("final, pioche : en main", "final_pocket", handIds(oneShot.state).join());
  run("final, pioche : pas jouable avant la pioche du tour", "mustDraw", placeRefusal(oneShot.state, 0, "apex"));
  run("final, pioche : jouable au tour suivant", null, placeRefusal(apply(oneShot.state, { type: "draw" }).state, 0, "apex"));

  // Sac vide : la défausse devient le sac, SANS one_shot, en partance pendant son
  // Final (pas encore à la défausse) ; elle y arrive ensuite.
  const regen = apply(playState({ hand: inHand([]), bag: [], discard: ["aging_flick"], triangle: triangleOf(null, null, placed("one_shot")) }), { type: "resolve" });
  run.same("final, pioche : régénération au cours de la résolution", ["final", "effect", "bagRegenerated", "draw"], eventTypes(regen.events).filter((type) => ["final", "effect", "bagRegenerated", "draw"].includes(type)).slice(-4));
  run("final, pioche : la défausse remélangée sans one_shot, en partance", 1, regen.events.find((event) => event.type === "bagRegenerated").size);
  run.same("final, pioche : one_shot arrive à la défausse après son Final", ["one_shot"], regen.state.discard);
  run("final, pioche : aucune bille perdue", 2, marbleCount(regen.state));
}

function checkPlace(run) {
  const onEmpty = apply(playState({ hand: inHand(["aging_flick", "hit_polish"]), triangle: triangleOf(null, null, null) }), { type: "place", handIndex: 1, slot: "apex" });
  run.same("pose : la bille va sur l'emplacement, usure 0", placed("hit_polish"), onEmpty.state.triangle.apex);
  run("pose : quitte la main", "aging_flick", handIds(onEmpty.state).join());
  run.same("pose : journal", ["flick", "placed"], eventTypes(onEmpty.events));

  const replacing = apply(
    playState({ hand: inHand(["aging_flick"]), triangle: triangleOf(null, null, placed("one_shot", 0)), discard: ["awaken_draw"] }),
    { type: "place", handIndex: 0, slot: "apex" }
  );
  run.same("remplacement : nouvelle bille à usure 0", placed("aging_flick"), replacing.state.triangle.apex);
  run("remplacement : ancienne bille à la défausse", "awaken_draw,one_shot", replacing.state.discard.join());
  run("remplacement : journal nomme l'ancienne", "one_shot", replacing.events.find((event) => event.type === "knockout").marble);
  run.same(
    "remplacement : cause de la défausse",
    { type: "discarded", marble: "one_shot", from: "triangle", slot: "apex", cause: "replacement" },
    replacing.events.find((event) => event.type === "discarded")
  );

  // Une bille usée qui revient repart à zéro : hors du triangle, elle n'est
  // plus qu'un id.
  const worn = apply(playState({ hand: inHand(["final_pocket"]), triangle: triangleOf(placed("aging_flick", 2), null, null) }), { type: "place", handIndex: 0, slot: "leftBase" });
  run("remplacement : aucune usure en défausse", "aging_flick", worn.state.discard[0]);
  const back = apply(playState({ hand: inHand(["aging_flick"]), triangle: triangleOf(null, null, null) }), { type: "place", handIndex: 0, slot: "leftBase" });
  run("une bille qui revient repart à usure 0", 0, back.state.triangle.leftBase.wear);

  run("pose : index hors main refusé", "invalidHandIndex", rules.reduce(playState({ hand: inHand(["aging_flick"]) }), { type: "place", handIndex: 3, slot: "apex" }).error);
  run("pose : index non entier refusé", "invalidHandIndex", rules.reduce(playState({ hand: inHand(["aging_flick"]) }), { type: "place", handIndex: "0", slot: "apex" }).error);
  run("pose : emplacement inconnu refusé", "invalidSlot", rules.reduce(playState({ hand: inHand(["aging_flick"]) }), { type: "place", handIndex: 0, slot: "top" }).error);

  // Plusieurs poses dans le même tour.
  let many = playState({ hand: inHand(["aging_flick", "hit_polish", "final_pocket"]) });
  many = apply(many, { type: "place", handIndex: 0, slot: "leftBase" }).state;
  many = apply(many, { type: "place", handIndex: 0, slot: "rightBase" }).state;
  many = apply(many, { type: "place", handIndex: 0, slot: "apex" }).state;
  run("pose : autant de billes que voulu", 0, many.hand.length);

  // Doublons : deux exemplaires, deux emplacements indépendants.
  let doubles = playState({ hand: inHand(["aging_flick", "aging_flick"]) });
  doubles = apply(doubles, { type: "place", handIndex: 0, slot: "leftBase" }).state;
  doubles = apply(doubles, { type: "place", handIndex: 0, slot: "apex" }).state;
  run("doublons : deux exemplaires posés", "aging_flick,aging_flick", [doubles.triangle.leftBase.marble, doubles.triangle.apex.marble].join());

  // Tour 1 : le joueur est seul responsable de ses poses, plus rien ne protège le
  // triangle. Quatre remplacements de suite sur la pointe passent.
  // Le Tic de hit_polish fait choisir sa cible : la première répond.
  let firstTurn = playState({ turn: 1, hand: inHand(["aging_flick", "hit_polish", "final_pocket", "awaken_draw", "all_rounder"]) });
  firstTurn = answerChoices(rules, apply(firstTurn, { type: "place", handIndex: 0, slot: "apex" })).state;
  firstTurn = answerChoices(rules, apply(firstTurn, { type: "place", handIndex: 0, slot: "apex" })).state;
  firstTurn = answerChoices(rules, apply(firstTurn, { type: "place", handIndex: 0, slot: "apex" })).state;
  run("tour 1 : remplacer encore reste permis", true, rules.reduce(firstTurn, { type: "place", handIndex: 0, slot: "apex" }).ok);
  run("placeRefusal : même réponse que l'action", null, placeRefusal(firstTurn, 0, "apex"));
  run("tour 1 : remplir un vide reste permis", null, placeRefusal(firstTurn, 0, "leftBase"));
  run("placeRefusal : pose permise", null, placeRefusal(playState({ hand: inHand(["aging_flick"]) }), 0, "apex"));
  const later = playState({ turn: 2, hand: inHand(["aging_flick"]), triangle: triangleOf(null, null, placed("awaken_draw")) });
  run("tour 2 : le remplacement n'a plus de limite", null, placeRefusal(later, 0, "apex"));
}

// Le déroulé d'une pose, les compteurs du tour : Tic et Éjection.
function checkHitAndKnockout(run) {
  // Ordre sur un emplacement occupé : Chiquenaude de A, départ de B, son Éjection
  // en partance, son arrivée à la défausse, pose de A, Tic de A.
  const state = playState({ hand: inHand(["aging_flick"]), triangle: triangleOf(null, null, placed("hit_pocket", 1)) });
  const both = apply(state, { type: "place", handIndex: 0, slot: "apex" });
  run.same(
    "pose sur occupé : ordre du journal",
    ["flick", "effect", "removed", "knockout", "effect", "discarded", "placed", "hit", "effect"],
    eventTypes(both.events)
  );
  run.same(
    "pose sur occupé : qui joue quoi",
    ["flick:aging_flick", "effect:aging_flick", "removed:hit_pocket", "knockout:hit_pocket", "effect:hit_pocket", "discarded:hit_pocket", "placed:aging_flick", "hit:aging_flick", "effect:aging_flick"],
    both.events.map((event) => `${event.type}:${event.marble}`)
  );
  run.same(
    "Éjection : son effet et le cumul",
    { type: "effect", trigger: "knockout", slot: "apex", marble: "hit_pocket", speedDelta: 3, massDelta: 0, draw: 0, operations: [], given: [], lost: [], speed: 3, mass: 1 },
    both.events[4]
  );
  run.same(
    "Tic : son effet et le cumul",
    { type: "effect", trigger: "hit", slot: "apex", marble: "aging_flick", speedDelta: 2, massDelta: 0, draw: 0, operations: [], given: [], lost: [], speed: 5, mass: 1 },
    both.events[8]
  );

  // Les bons moments : au Tic, la nouvelle bille est là ; à l'Éjection, l'occupante
  // est déjà partie (en partance) et la nouvelle encore en lancer : l'emplacement
  // est vide pour les conditions.
  const seenByKnockout = {
    witness: { knockout: [{ action: "speed", amount: 1, when: { type: "printedStat", slot: "apex", stat: "speed", atLeast: 5 } }], apex: [{ action: "speed", amount: 5 }] },
    arrival: { hit: [{ action: "mass", amount: 1, when: { type: "printedStat", slot: "apex", stat: "mass", atLeast: 2 } }], apex: [{ action: "mass", amount: 2 }] },
  };
  const moments = apply(playState({ hand: inHand(["arrival"]), triangle: triangleOf(null, null, placed("witness")) }), { type: "place", handIndex: 0, slot: "apex" }, seenByKnockout);
  run("Éjection : jouée en partance, la bille n'est plus sur son emplacement", 0, moments.events.find((event) => event.trigger === "knockout").speedDelta);
  run("Tic : joué après l'arrivée de la bille", 1, moments.events.find((event) => event.trigger === "hit").massDelta);

  // Compteurs du tour, modifiés avant la résolution, et l'Impact en tient compte.
  run("compteurs : Vitesse du tour modifiée", 5, both.state.speed);
  run("compteurs : Masse du tour inchangée", 1, both.state.mass);
  const resolved = apply(both.state, { type: "resolve" });
  // 3 (Éjection de hit_pocket) + 2 (Tic de aging_flick) + 4 (aging_flick en pointe).
  run("compteurs : la résolution en part", 9, resolved.events.find((event) => event.type === "impact").impact);
  run("compteurs : remis à zéro après la résolution", "0,1", `${resolved.state.speed},${resolved.state.mass}`);

  // Masse : Éjection de flick_strike +1, Tic de final_pocket +1, final_pocket en pointe +1 (la base
  // gauche, une aging_flick, n'est pas un calot), aging_flick en base +1 de Vitesse.
  const massive = apply(playState({ hand: inHand(["final_pocket"]), triangle: triangleOf(placed("aging_flick"), null, placed("flick_strike")) }), { type: "place", handIndex: 0, slot: "apex" });
  run("Masse : Éjection et Tic", 3, massive.state.mass);
  const massImpact = apply(massive.state, { type: "resolve" }).events.find((event) => event.type === "impact");
  run.same("Masse : l'Impact en tient compte", { speed: 1, mass: 4, impact: 4 }, { speed: massImpact.speed, mass: massImpact.mass, impact: massImpact.impact });

  // Plusieurs poses : les compteurs s'accumulent.
  const twice = apply(apply(playState({ hand: inHand(["aging_flick", "final_pocket"]), triangle: triangleOf(placed("hit_pocket"), placed("flick_strike"), null) }), { type: "place", handIndex: 0, slot: "leftBase" }).state, { type: "place", handIndex: 0, slot: "rightBase" });
  run("compteurs : deux poses, Vitesse", 5, twice.state.speed);
  run("compteurs : deux poses, Masse", 3, twice.state.mass);

  // Une bille sans Tic ni Éjection : les évènements passent, aucun effet.
  const plain = apply(playState({ hand: inHand(["all_rounder"]), triangle: triangleOf(null, null, placed("fragile")) }), { type: "place", handIndex: 0, slot: "apex" });
  run.same("sans Tic ni Éjection : aucun effet", ["flick", "removed", "knockout", "discarded", "placed", "hit"], eventTypes(plain.events));
  run("sans Tic ni Éjection : compteurs intacts", "0,1", `${plain.state.speed},${plain.state.mass}`);

  // Ni Tic ni Éjection ailleurs.
  const noReaction = (result) =>
    result.events.filter((event) => ["hit", "knockout"].includes(event.type) || ["hit", "knockout"].includes(event.trigger)).map((event) => event.type);
  const onEmpty = apply(playState({ hand: inHand(["aging_flick"]) }), { type: "place", handIndex: 0, slot: "apex" });
  run.same("pose sur vide : ni Tic ni Éjection", [], noReaction(onEmpty));
  const swapped = apply(playState({ triangle: triangleOf(placed("hit_pocket"), placed("aging_flick"), null) }), { type: "swap", a: "leftBase", b: "rightBase" });
  run.same("échange : ni Tic ni Éjection, même sur des billes qui en ont", [], noReaction(swapped));
  const worn = apply(playState({ triangle: triangleOf(null, null, placed("hit_pocket", 2)) }), { type: "resolve" });
  run("retrait par usure : pas d'Éjection", false, eventTypes(worn.events).includes("knockout"));
  run("retrait par usure : Impact de la phase seule", 6, worn.state.score);
  run("retrait par usure : cause", "wear", worn.events.find((event) => event.type === "discarded").cause);

  // Un plancher ne vaut qu'à l'Impact : une Éjection négative pèse dans le compteur.
  const negative = fabricatedRules({
    drain: { knockout: [{ action: "speed", amount: -5 }, { action: "mass", amount: -3 }] },
    boost: { apex: [{ action: "speed", amount: 2 }] },
  });
  const drained = apply(playState({ hand: inHand(["boost"]), triangle: triangleOf(null, null, placed("drain")) }), { type: "place", handIndex: 0, slot: "apex" }, negative);
  run("négatif : compteur brut", "-5,-2", `${drained.state.speed},${drained.state.mass}`);
  const drainedImpact = apply(drained.state, { type: "resolve" }, negative).events.find((event) => event.type === "impact");
  run("négatif : Vitesse brute à l'Impact", -3, drainedImpact.speed);
  run("négatif : Impact au plancher", 0, drainedImpact.impact);
}

// tally_flick : en base gauche, +4 à une pointe qui imprime de la Vitesse.
function checkTallyFlick(run) {
  const withApex = (marble, apexOver = {}) =>
    apply(playState({ triangle: triangleOf(placed("tally_flick"), null, marble === null ? null : { ...placed(marble), ...apexOver }) }), { type: "resolve" });
  const apexEffect = (result) => result.events.find((event) => event.type === "effect" && event.slot === "apex");

  const hitPocket = withApex("hit_pocket");
  run("tally_flick : hit_pocket en pointe, Vitesse +10", 10, apexEffect(hitPocket).speedDelta);
  run("tally_flick : Impact 10", 10, hitPocket.state.score);
  run.same(
    "tally_flick : ce qu'elle donne, dans son effet",
    [{ slot: "apex", marble: "hit_pocket", speed: 4, mass: 0 }],
    hitPocket.events.find((event) => event.slot === "leftBase" && event.type === "effect").given
  );
  run("tally_flick : rien pour elle-même", 0, hitPocket.events.find((event) => event.slot === "leftBase" && event.type === "effect").speedDelta);

  run("tally_flick : aging_flick, 4 + 4", 8, apexEffect(withApex("aging_flick")).speedDelta);
  run("tally_flick : une autre tally_flick en pointe, 2 + 4", 6, apexEffect(withApex("tally_flick")).speedDelta);
  run("tally_flick : final_pocket, aucun bonus", 0, apexEffect(withApex("final_pocket")).speedDelta);
  run("tally_flick : final_pocket garde sa Masse", 1, apexEffect(withApex("final_pocket")).massDelta);
  run("tally_flick : base_pocket, aucun bonus", 0, apexEffect(withApex("base_pocket")).speedDelta);
  run("tally_flick : size_count, sans effet de pointe, aucun bonus", 0, apexEffect(withApex("size_count")).speedDelta);
  run("tally_flick : flick_strike, imprime du négatif, aucun bonus", -3, apexEffect(withApex("flick_strike")).speedDelta);
  run.same("tally_flick : pointe sans Vitesse, rien de donné", [], withApex("final_pocket").events.find((event) => event.slot === "leftBase" && event.type === "effect").given);
  run.same("tally_flick : pointe vide, rien de donné", [], withApex(null).events.find((event) => event.slot === "leftBase" && event.type === "effect").given);

  // La condition lit l'imprimé, jamais l'effet déjà modifié : un bonus reçu ne
  // fait pas passer une pointe négative pour une pointe à Vitesse.
  const boosted = withApex("flick_strike", { bonus: { speed: 10, mass: 0 } });
  run.same("anti-boucle : un bonus reçu n'ouvre pas la condition", [], boosted.events.find((event) => event.slot === "leftBase" && event.type === "effect").given);
  run("anti-boucle : la pointe garde son bonus", 7, apexEffect(boosted).speedDelta);

  // Sur l'autre base et en pointe, ses autres effets.
  const right = apply(playState({ triangle: triangleOf(null, placed("tally_flick"), placed("hit_pocket")) }), { type: "resolve" });
  run("tally_flick en base droite : Vitesse +1, pas de bonus", 7, right.state.score);
  const onApex = apply(playState({ triangle: triangleOf(null, null, placed("tally_flick")) }), { type: "resolve" });
  run("tally_flick en pointe : Vitesse +2", 2, onApex.state.score);
}

// POLISSAGE et FÊLURE, sur des billes fictives.
function checkWearActions(run) {
  const polish = (amount, target) => ({ action: "polish", amount, ...(target ? { target } : {}) });
  const crack = (amount, target) => ({ action: "crack", amount, ...(target ? { target } : {}) });
  const accepted = (name, type) => run(`usure, table acceptée : ${name}`, false, throws(() => validateTable({ a: type })));
  const refused = (name, type) => run(`usure, table refusée : ${name}`, true, throws(() => validateTable({ a: type })));
  accepted("Polissage ciblé depuis un Final", { final: [polish(1, "apex")] });
  accepted("Fêlure ciblée depuis un Final", { final: [crack(1, "leftBase")] });
  accepted("Fêlure d'une pointe vers une base", { apex: [crack(1, "leftBase")] });
  accepted("Polissage sur soi en pointe", { apex: [polish(1)] });
  refused("Polissage sur soi dans un Final (la bille est partie)", { final: [polish(1)] });
  refused("Fêlure de 0", { base: [crack(0)] });
  refused("Polissage vers un emplacement inconnu", { base: [polish(1, "hand")] });

  const table = {
    plain: { apex: [{ action: "speed", amount: 1 }], base: [{ action: "speed", amount: 1 }] },
    fragile: { apex: [{ action: "speed", amount: 2 }], final: [{ action: "speed", amount: 4 }], maxWear: 2 },
    polisher: { base: [polish(2, "apex")] },
    savior: { apex: [polish(1, "leftBase")] },
    selfPolish: { apex: [{ action: "speed", amount: 1 }, polish(1)] },
    cracker: { base: [crack(1, "apex")], hit: [crack(1, "leftBase")] },
    breaker: { base: [crack(5, "apex")] },
    finalPolisher: { final: [polish(1, "apex")], maxWear: 1 },
    emptyHitter: { hit: [polish(1, "rightBase")] },
  };
  const wearRules = fabricatedRules(table);
  const act = (state, action) => apply(state, action, wearRules);
  const resolveOf = (state) => act(state, { type: "resolve" });
  const types = (result) => eventTypes(result.events);
  const find = (result, type) => result.events.find((event) => event.type === type);

  // Polissage : jamais sous 0.
  const floor = resolveOf(playState({ bag: ["plain"], triangle: triangleOf(placed("polisher"), null, placed("plain", 1)) }));
  run.same("Polissage : jamais sous 0, 1 point réellement rendu", { slot: "apex", marble: "plain", amount: 2, applied: 1, wear: 0, maxWear: 3 }, (({ type, ...rest }) => rest)(find(floor, "polished")));

  // Une bille à son maximum, polie avant l'étape des retraits, n'est plus retirée.
  const saved = resolveOf(playState({ bag: ["plain"], triangle: triangleOf(placed("plain", 2), null, placed("savior")) }));
  run("Polissage : la bille arrivée au maximum puis polie reste", false, saved.events.some((event) => event.type === "removed" && event.marble === "plain"));
  run("Polissage : ni Final ni défausse", "", saved.state.discard.join());
  const finalSave = resolveOf(playState({ bag: ["plain"], triangle: triangleOf(placed("finalPolisher"), null, placed("plain", 2)) }));
  run("Polissage depuis un Final : la pointe usée est sauvée", 1, finalSave.events.filter((event) => event.type === "removed").length);
  run("Polissage depuis un Final : appliqué à la pointe", "apex", find(finalSave, "polished").slot);

  // Fêlure en phase : jusqu'au maximum, retrait aussitôt, Final, phase sautée.
  const broken = resolveOf(playState({ bag: ["plain"], triangle: triangleOf(null, placed("cracker"), placed("fragile", 1)) }));
  run.same(
    "Fêlure : l'effet, la fêlure, le retrait, le Final, avant la suite",
    ["phase", "effect", "cracked", "removed", "final", "effect", "discarded", "wear", "phaseSkipped", "phaseSkipped"],
    types(broken).slice(0, 10)
  );
  run("Fêlure : la phase de la bille retirée est sautée", "apex", broken.events.filter((event) => event.type === "phaseSkipped").at(-1).slot);
  run("Fêlure : son Final compte pour le tour", 4, find(broken, "impact").impact);
  run("Fêlure : jamais au-delà du maximum", 3, find(resolveOf(playState({ bag: ["plain"], triangle: triangleOf(placed("breaker"), null, placed("plain")) })), "cracked").wear);
  const notYet = resolveOf(playState({ bag: ["plain"], triangle: triangleOf(placed("cracker"), null, placed("plain")) }));
  run("Fêlure : sous le maximum, la bille reste et joue", 1, find(notYet, "impact").impact);

  // Fêlure en phase de jeu : l'emplacement vidé reçoit une pose, sans Tic.
  const played = act(playState({ hand: inHand(["cracker", "plain"]), triangle: triangleOf(placed("fragile", 1), placed("plain"), null) }), { type: "place", handIndex: 0, slot: "rightBase" });
  run("Fêlure en jeu : retirée aussitôt", null, played.state.triangle.leftBase);
  run("Fêlure en jeu : son Final se déclenche", true, played.events.some((event) => event.type === "effect" && event.trigger === "final"));
  const refill = act(played.state, { type: "place", handIndex: 0, slot: "leftBase" });
  run("Fêlure en jeu : l'emplacement vidé se pose sans Tic", false, types(refill).includes("hit"));

  // Ordre : l'effet (Polissage sur soi compris), puis le +1 d'usure.
  const ordered = resolveOf(playState({ bag: ["plain"], triangle: triangleOf(null, null, placed("selfPolish", 2)) }));
  run.same("ordre : effet, Polissage, puis l'usure", ["effect", "polished", "wear"], types(ordered).filter((type) => ["effect", "polished", "wear"].includes(type)));
  run.same("ordre : usure 2, polie à 1, puis 2", [1, 2], [find(ordered, "polished").wear, find(ordered, "wear").wear]);

  // Cible vide : sans effet, noté au journal.
  const empty = act(playState({ hand: inHand(["emptyHitter"]), triangle: triangleOf(placed("plain"), null, null) }), { type: "place", handIndex: 0, slot: "leftBase" });
  run.same("cible vide : notée au journal", { type: "targetEmpty", action: "polish", slot: "rightBase", by: { trigger: "hit", slot: "leftBase", marble: "emptyHitter" } }, find(empty, "targetEmpty"));

  // Polissage et Fêlure sur soi, refusés dans un Final et une Éjection : la bille y
  // est en partance, son départ est acquis.
  for (const field of ["knockout", "final"]) {
    for (const action of ["crack", "polish"]) {
      run(`${field} : ${action} sur elle-même refusé, en partance`, true, /en partance/.test(caughtMessage(() => validateTable({ a: { [field]: [{ action, amount: 1 }] } }))));
    }
  }
}

// Polissage et Fêlure sur les billes de test du jeu : par un Tic, en phase avec
// retrait immédiat, sur soi, depuis un Final.
function checkWearMarbles(run) {
  const find = (result, type) => result.events.find((event) => event.type === type);
  // hit_polish : son Tic polit une bille active au choix, ici la pointe.
  const glassPlaced = apply(playState({ hand: inHand(["hit_polish"]), triangle: triangleOf(placed("aging_flick"), null, placed("fragile", 1)) }), { type: "place", handIndex: 0, slot: "leftBase" });
  run.same(
    "hit_polish : le Tic propose les billes actives, lui compris",
    ["leftBase", "apex"],
    glassPlaced.state.pendingChoice.eligible.map((target) => target.slot)
  );
  const hitPolish = apply(glassPlaced.state, { type: "choose", target: { zone: "triangle", slot: "apex" } });
  run.same("hit_polish : le Tic polit la bille choisie", { slot: "apex", marble: "fragile", wear: 0 }, (({ slot, marble, wear }) => ({ slot, marble, wear }))(find(hitPolish, "polished")));

  // Une Fêlure de base sur la pointe (une bille fabriquée) : fragile (usure 1 sur
  // 2) part aussitôt, son Final joue, sa phase est sautée.
  // fragile sans le Polissage au choix de son Final : ce cas porte sur la Fêlure.
  const crackerTable = { cracker: { base: [{ action: "crack", amount: 1, target: "apex" }] }, fragile: CHOICELESS_TYPES.fragile, aging_flick: FIXTURE_TYPES.aging_flick };
  const cracked = apply(playState({ bag: ["aging_flick"], triangle: triangleOf(null, placed("cracker"), placed("fragile", 1)) }), { type: "resolve" }, crackerTable);
  run.same(
    "Fêlure en phase : retrait, Final de fragile, puis la suite",
    ["phase", "effect", "cracked", "removed", "final", "effect", "discarded", "wear", "phaseSkipped", "phaseSkipped"],
    eventTypes(cracked.events).slice(0, 10)
  );
  run("Fêlure en phase : la Vitesse du Final compte, la phase de fragile non", 4, find(cracked, "impact").impact);

  // awaken_draw en pointe : Vitesse +2 et Polissage sur lui-même, puis son +1 d'usure.
  const awakenDraw = apply(playState({ bag: ["aging_flick"], triangle: triangleOf(null, null, placed("awaken_draw", 2)) }), { type: "resolve" });
  run.same("awaken_draw : l'effet, le Polissage, puis l'usure", ["effect", "polished", "wear"], eventTypes(awakenDraw.events).filter((type) => ["effect", "polished", "wear"].includes(type)));
  run.same("awaken_draw : usure 2, polie à 1, puis 2 : il reste", [1, 2, false], [find(awakenDraw, "polished").wear, find(awakenDraw, "wear").wear, awakenDraw.events.some((event) => event.type === "removed")]);

  // final_pocket : son Final polit la pointe, qui n'est alors plus retirée.
  const finalPocket = apply(
    playState({ bag: ["aging_flick"], triangle: triangleOf({ ...placed("final_pocket", 2) }, null, placed("fragile", 1)) }),
    { type: "resolve" }
  );
  run.same("final_pocket : Final ciblé, fragile usée est sauvée", ["final_pocket"], finalPocket.events.filter((event) => event.type === "removed").map((event) => event.marble));
  run("final_pocket : fragile polie de 2 à 1", 1, find(finalPocket, "polished").wear);
}

// Le bonus, sur des billes fictives : ce que la table du jeu ne fait pas encore.
// La RÈGLE DES CIBLES à la validation : une Vitesse ou une Masse ciblée qui ne peut
// jamais atteindre sa phase est refusée au chargement.
function checkTargetRule(run) {
  const speedTo = (target) => ({ action: "speed", amount: 1, target });
  const massTo = (target) => ({ action: "mass", amount: 1, target });
  const refused = (name, type) => run(`cible refusée : ${name}`, true, throws(() => validateTable({ a: type })));
  const accepted = (name, type) => run(`cible acceptée : ${name}`, false, throws(() => validateTable({ a: type })));
  refused("Vitesse ciblée dans un Final", { final: [speedTo("apex")] });
  refused("Masse ciblée dans un Final", { final: [massTo("leftBase")] });
  refused("pointe vers la base gauche", { apex: [speedTo("leftBase")] });
  refused("pointe vers la base droite", { apex: [massTo("rightBase")] });
  refused("pointe vers elle-même", { apex: [speedTo("apex")] });
  refused("base vers la base droite (toujours passée, la première phase)", { base: [speedTo("rightBase")] });
  refused("variante de base gauche vers la base gauche", { baseVariant: { leftBase: [speedTo("leftBase")] } });
  refused("variante de base gauche vers la base droite (passée)", { baseVariant: { leftBase: [speedTo("rightBase")] } });
  accepted("base vers la base gauche (depuis la base droite)", { base: [speedTo("leftBase")] });
  accepted("base vers la pointe", { base: [speedTo("apex")] });
  accepted("variante de base droite vers la base gauche", { baseVariant: { rightBase: [speedTo("leftBase")] } });
  accepted("tic vers n'importe quel emplacement", { hit: [speedTo("leftBase"), speedTo("apex")] });
  accepted("éjection vers la base gauche", { knockout: [massTo("leftBase")] });
  accepted("Final sans cible", { final: [{ action: "speed", amount: 2 }] });
}

function checkBonus(run) {
  const toApex = (amount, action = "speed") => ({ action, amount, target: "apex" });
  const table = {
    plain: { apex: [{ action: "speed", amount: 1 }], base: [{ action: "speed", amount: 1 }] },
    giver: { hit: [toApex(2)], knockout: [toApex(3), toApex(1, "mass")] },
    // Une base qui vise la base gauche : possible depuis la base droite (la première
    // phase), perdu depuis la base gauche (sa propre phase a commencé).
    late: { base: [{ action: "speed", amount: 1, target: "leftBase" }] },
    both: { base: [{ action: "speed", amount: 5 }, toApex(2)] },
    conditional: { hit: [{ action: "speed", amount: 9, when: { type: "printedStat", slot: "apex", stat: "mass", atLeast: 1 } }] },
  };
  const tableRules = fabricatedRules(table);
  const act = (state, action) => apply(state, action, tableRules);
  const resolveOf = (state) => act(state, { type: "resolve" });

  const hit = act(playState({ hand: inHand(["giver"]), triangle: triangleOf(placed("plain"), null, placed("plain")) }), { type: "place", handIndex: 0, slot: "leftBase" });
  run.same("bonus : posé sur la bille ciblée, pas sur les compteurs", { speed: 2, mass: 0 }, hit.state.triangle.apex.bonus);
  run("bonus : compteur du tour intact", 0, hit.state.speed);
  run.same(
    "bonus : le journal dit à qui",
    [{ slot: "apex", marble: "plain", speed: 2, mass: 0 }],
    hit.events.find((event) => event.trigger === "hit").given
  );
  const hitResolved = resolveOf(hit.state);
  run("bonus : compté à la phase de la cible", 3, hitResolved.events.find((event) => event.slot === "apex" && event.type === "effect").speedDelta);
  run.same(
    "bonus : parti après la résolution",
    [],
    SLOTS.filter((slot) => hitResolved.state.triangle[slot]?.bonus !== undefined)
  );

  const stacked = act(playState({ hand: inHand(["plain"]), triangle: triangleOf(placed("giver"), null, { ...placed("plain"), bonus: { speed: 1, mass: 0 } }) }), { type: "place", handIndex: 0, slot: "leftBase" });
  run.same("bonus : s'additionne, deux clauses", { speed: 4, mass: 1 }, stacked.state.triangle.apex.bonus);

  const toEmpty = act(playState({ hand: inHand(["giver"]), triangle: triangleOf(placed("plain"), null, null) }), { type: "place", handIndex: 0, slot: "leftBase" });
  run.same("bonus : emplacement vide, perdu", [], toEmpty.events.find((event) => event.trigger === "hit").given);
  run("bonus : emplacement vide, reste vide", null, toEmpty.state.triangle.apex);

  const swapped = act(playState({ triangle: triangleOf(null, placed("plain"), { ...placed("plain"), bonus: { speed: 2, mass: 0 } }) }), { type: "swap", a: "rightBase", b: "apex" });
  run.same("bonus : suit la bille dans un échange", { speed: 2, mass: 0 }, swapped.state.triangle.rightBase.bonus);
  const replaced = act(playState({ hand: inHand(["plain"]), triangle: triangleOf(null, null, { ...placed("plain"), bonus: { speed: 2, mass: 0 } }) }), { type: "place", handIndex: 0, slot: "apex" });
  run("bonus : perdu avec une bille remplacée", undefined, replaced.state.triangle.apex.bonus);

  const tooLate = resolveOf(playState({ triangle: triangleOf(placed("late"), placed("plain"), null) }));
  run("bonus : phase de la cible commencée, sans effet sur l'Impact", 1, tooLate.state.score);
  run("bonus : phase de la cible commencée, ne survit pas au tour", undefined, tooLate.state.triangle.leftBase.bonus);
  run.same(
    "bonus : perdu, noté au journal",
    [{ slot: "leftBase", reason: "phasePassed", speed: 1, mass: 0 }],
    tooLate.events.find((event) => event.type === "effect" && event.marble === "late").lost
  );
  run.same("bonus : perdu, rien de donné", [], tooLate.events.find((event) => event.type === "effect" && event.marble === "late").given);
  const inTime = resolveOf(playState({ triangle: triangleOf(placed("plain"), placed("late"), null) }));
  run("bonus : depuis la base droite, la base gauche le reçoit (1 + 1)", 2, inTime.events.find((event) => event.type === "effect" && event.slot === "leftBase").speedDelta);
  run.same("bonus : emplacement vide, noté au journal", [{ slot: "apex", reason: "emptySlot", speed: 2, mass: 0 }], toEmpty.events.find((event) => event.trigger === "hit").lost);

  const mixed = resolveOf(playState({ triangle: triangleOf(placed("both"), null, placed("plain")) }));
  const mixedEffect = mixed.events.find((event) => event.slot === "leftBase" && event.type === "effect");
  run("clauses mêlées : la part pour elle-même", 5, mixedEffect.speedDelta);
  run("clauses mêlées : la part donnée", 2, mixedEffect.given[0].speed);

  // Condition fausse : l'effet se joue, sans rien donner.
  const noMass = act(playState({ hand: inHand(["conditional"]), triangle: triangleOf(null, null, placed("plain")) }), { type: "place", handIndex: 0, slot: "leftBase" });
  run("condition fausse : pas d'effet du tout sur un vide", false, eventTypes(noMass.events).includes("effect"));
  const falseCondition = act(playState({ hand: inHand(["conditional"]), triangle: triangleOf(placed("plain"), null, placed("plain")) }), { type: "place", handIndex: 0, slot: "leftBase" });
  run("condition fausse : effet joué à zéro", 0, falseCondition.events.find((event) => event.trigger === "hit").speedDelta);
}

function checkResolution(run) {
  // Ordre horaire : base droite, base gauche, pointe, puis Impact, retrait, rotation.
  const full = playState({ triangle: triangleOf(placed("aging_flick"), placed("hit_polish"), placed("final_pocket")) });
  const result = apply(full, { type: "resolve" });
  run.same(
    "résolution : ordre du journal",
    ["phase", "effect", "wear", "phase", "effect", "wear", "phase", "effect", "wear", "impact", "rotation", "turnEnded"],
    eventTypes(result.events)
  );
  run.same(
    "résolution : ordre des phases, l'ordre horaire",
    ["rightBase", "leftBase", "apex"],
    result.events.filter((event) => event.type === "phase").map((event) => event.slot)
  );
  // aging_flick en base (Vitesse +1), hit_polish en base (Masse +1), final_pocket en pointe (Masse +1 :
  // la base gauche, une aging_flick, n'est pas un calot).
  const impact = result.events.find((event) => event.type === "impact");
  run.same("résolution : Vitesse 1, Masse 3, Impact 3", { type: "impact", speed: 1, mass: 3, impact: 3, score: 3 }, impact);
  run("résolution : le Score cumule", 3, result.state.score);
  run("résolution : le tour avance", 3, result.state.turn);
  run("résolution : la pioche suivante reste à faire", "draw", result.state.stage);

  const second = apply(playState({ score: 10, triangle: triangleOf(placed("aging_flick"), placed("hit_polish"), placed("final_pocket")) }), { type: "resolve" });
  run("Impact ajouté au Score", 13, second.state.score);

  const effect = result.events.find((event) => event.type === "effect" && event.slot === "rightBase");
  run.same(
    "effet : deltas et cumul",
    { type: "effect", trigger: "phase", slot: "rightBase", marble: "hit_polish", speedDelta: 0, massDelta: 1, draw: 0, operations: [], given: [], lost: [], speed: 0, mass: 2 },
    effect
  );

  // Usure qui se remplit, sans retrait avant le maximum.
  const worn = apply(playState({ triangle: triangleOf(placed("aging_flick", 1), null, null) }), { type: "resolve" });
  const wearEvent = worn.events.find((event) => event.type === "wear");
  run.same("usure : +1 et maximum dans le journal", { type: "wear", slot: "leftBase", marble: "aging_flick", wear: 2, maxWear: 3 }, wearEvent);
  run("usure : pas de retrait avant le maximum", false, eventTypes(worn.events).includes("retired"));
  run("usure : gardée après rotation (base gauche -> pointe)", 2, worn.state.triangle.apex.wear);

  // Retrait : la bille joue son effet, puis part à la défausse.
  const last = apply(playState({ triangle: triangleOf(placed("aging_flick", 2), null, null) }), { type: "resolve" });
  run("retrait : effet joué malgré le maximum atteint", 1, last.events.find((event) => event.type === "impact").impact);
  run("retrait : part à la défausse", "aging_flick", last.state.discard.join());
  run.same("retrait : emplacement vidé", triangleOf(null, null, null), last.state.triangle);
  run.same(
    "retrait : après les phases, avant l'Impact et la rotation",
    ["removed", "final", "discarded", "impact", "rotation", "turnEnded"],
    eventTypes(last.events).slice(-6)
  );

  const oneShot = apply(playState({ bag: ["final_pocket"], triangle: triangleOf(null, null, placed("one_shot")) }), { type: "resolve" });
  run("one_shot : joue puis part dès le premier tour", 6, oneShot.state.score);
  run("one_shot : retirée", "one_shot", oneShot.state.discard.join());

  const fragile = apply(playState({ triangle: triangleOf(null, null, placed("fragile", 1)) }), { type: "resolve" });
  run("fragile : retirée à usure 2", "fragile", fragile.state.discard.join());
  const allRounder = apply(playState({ triangle: triangleOf(null, null, placed("all_rounder", 2)) }), { type: "resolve" });
  run("all_rounder : pas retirée à usure 3 sur 4", 0, allRounder.state.discard.length);

  const twoRetired = apply(playState({ bag: ["final_pocket"], triangle: triangleOf(placed("one_shot"), placed("aging_flick", 2), placed("hit_polish")) }), { type: "resolve" });
  run("retrait : dans l'ordre horaire, la base droite d'abord", "aging_flick,one_shot", twoRetired.state.discard.join());

  // L'ordre horaire, le seul : base droite, base gauche, pointe ; le suivant et le
  // précédent, la pointe suivie de la base droite.
  run.same("ordre horaire : base droite, base gauche, pointe", ["rightBase", "leftBase", "apex"], [...SLOTS]);
  run.same("ordre horaire : les suivants", ["leftBase", "apex", "rightBase"], SLOTS.map(nextSlot));
  run.same("ordre horaire : les précédents", ["apex", "rightBase", "leftBase"], SLOTS.map(previousSlot));
  run.same("ordre horaire : précédent du suivant, l'emplacement lui-même", [...SLOTS], SLOTS.map((slot) => previousSlot(nextSlot(slot))));
  run("ordre horaire : un emplacement inconnu refusé", true, throws(() => nextSlot("middle")));

  // Rotation, inchangée dans les faits : chaque bille vers son suivant, base gauche
  // -> pointe, pointe -> base droite, base droite -> base gauche.
  run.same(
    "rotation : billes",
    triangleOf(placed("hit_polish", 1), placed("final_pocket", 1), placed("aging_flick", 1)),
    result.state.triangle
  );
  run.same("rotation : journal porte le triangle d'après", result.state.triangle, result.events.find((event) => event.type === "rotation").triangle);
  const withHole = apply(playState({ triangle: triangleOf(placed("aging_flick"), null, null) }), { type: "resolve" });
  run.same("rotation : les vides tournent aussi", triangleOf(null, null, placed("aging_flick", 1)), withHole.state.triangle);

  // Emplacement vide : phase sautée.
  const skipped = apply(playState({ triangle: triangleOf(null, placed("aging_flick"), null) }), { type: "resolve" });
  run.same("phase vide : sautée, dans l'ordre", ["phase", "effect", "wear", "phaseSkipped", "phaseSkipped", "impact", "rotation", "turnEnded"], eventTypes(skipped.events));

  // split_base : la variante suit la base où il se trouve.
  const leftEye = apply(playState({ triangle: triangleOf(placed("split_base"), null, null) }), { type: "resolve" });
  run.same("split_base en base gauche : Vitesse +3", { speed: 3, mass: 1 }, pickTotals(leftEye));
  const rightEye = apply(playState({ triangle: triangleOf(null, placed("split_base"), null) }), { type: "resolve" });
  run.same("split_base en base droite : Masse +1", { speed: 0, mass: 2 }, pickTotals(rightEye));
  const apexEye = apply(playState({ triangle: triangleOf(null, null, placed("split_base")) }), { type: "resolve" });
  run.same("split_base en pointe : Vitesse +3", { speed: 3, mass: 1 }, pickTotals(apexEye));

  // Planchers : à l'Impact seulement.
  const negative = apply(playState({ score: 5, triangle: triangleOf(null, null, placed("flick_strike")) }), { type: "resolve" });
  const negativeImpact = negative.events.find((event) => event.type === "impact");
  run("plancher Vitesse : Vitesse brute dans le journal", -3, negativeImpact.speed);
  run("plancher Vitesse : Impact 0", 0, negativeImpact.impact);
  run("plancher Vitesse : Score inchangé", 5, negative.state.score);
  run("impactOf : plancher de Masse à 1", 4, impactOf(4, -2));
  run("impactOf : Masse 0 comptée 1", 4, impactOf(4, 0));
  run("impactOf : plancher de Vitesse à 0", 0, impactOf(-1, 3));

  // Table fabriquée : ce qu'aucune bille actuelle ne produit, une valeur
  // négative AVANT la dernière phase. Un plancher appliqué pendant
  // l'accumulation donnerait ici Vitesse 3 et Masse 2.
  const dipping = {
    drain: { base: [{ action: "speed", amount: -5 }, { action: "mass", amount: -3 }] },
    boost: { base: [{ action: "speed", amount: 3 }, { action: "mass", amount: 1 }] },
  };
  const dip = apply(playState({ triangle: triangleOf(placed("drain"), placed("boost"), null) }), { type: "resolve" }, dipping);
  run.same("planchers : pas pendant l'accumulation", { speed: -2, mass: -1 }, pickTotals(dip));
  run("planchers : Impact 0 après accumulation négative", 0, dip.state.score);
  const recovering = {
    drain: { base: [{ action: "speed", amount: -2 }, { action: "mass", amount: -5 }] },
    boost: { base: [{ action: "speed", amount: 4 }] },
  };
  const recovered = apply(playState({ triangle: triangleOf(placed("drain"), placed("boost"), null) }), { type: "resolve" }, recovering);
  run("planchers : Vitesse remontée de -2 à 2, Masse -4 comptée 1", 2, recovered.state.score);

  // Tour 1 : la résolution se lance quel que soit le triangle, vide, partiel ou plein.
  const firstTurn = apply(rules.createGame(7), { type: "draw" }).state;
  const firstEmpty = rules.reduce(firstTurn, { type: "resolve" });
  run("tour 1 : résolution permise, triangle vide", true, firstEmpty.ok);
  run.same(
    "tour 1, triangle vide : trois phases sautées, Impact 0, tour suivant",
    ["phaseSkipped", "phaseSkipped", "phaseSkipped", 0, 2],
    [...firstEmpty.events.filter((event) => event.type.startsWith("phase")).map((event) => event.type), firstEmpty.events.find((event) => event.type === "impact").impact, firstEmpty.state.turn]
  );
  let partial = apply(firstTurn, { type: "place", handIndex: 0, slot: "apex" }).state;
  partial = apply(partial, { type: "place", handIndex: 0, slot: "leftBase" }).state;
  run("tour 1 : résolution permise, triangle partiel", true, rules.reduce(partial, { type: "resolve" }).ok);
  partial = apply(partial, { type: "place", handIndex: 0, slot: "rightBase" }).state;
  run("tour 1 : résolution permise, triangle plein", true, rules.reduce(partial, { type: "resolve" }).ok);

  const empty = apply(playState(), { type: "resolve" });
  run("tour 2 : zéro pose et triangle vide, Impact 0", 0, empty.events.find((event) => event.type === "impact").impact);
  run("tour 2 : Score inchangé", 0, empty.state.score);
}

// Les CONDITIONS DE CALIBRE, sur une table fabriquée : comparaison relative pendant
// un remplacement (Tic, Éjection), comptage par calibre, calibre d'un emplacement.
function checkSizeConditions(run) {
  const smaller = { type: "relativeSize", marble: "ejected", is: "smaller" };
  const placedLarger = { type: "relativeSize", marble: "placed", is: "larger" };
  const table = {
    // Tic : Vitesse +4 si l'éjectée est plus petite (vu par la posée).
    bully: { size: LARGE, hit: [{ action: "speed", amount: 4, when: smaller }] },
    // Éjection : Pioche 1 si la posée est plus grosse (vu par l'éjectée).
    runt: { size: SMALL, knockout: [{ action: "draw", amount: 1, when: placedLarger }] },
    pebble: { size: SMALL },
    twin: { size: LARGE },
    plain: { size: MEDIUM },
    // Base : Vitesse +1 par minibille active.
    counter: { size: MEDIUM, base: [{ action: "speed", amount: { base: 0, step: 1, source: { type: "activeSize", size: SMALL } } }] },
    // Base : Vitesse +1 par minibille active, elle-même minibille.
    selfish: { size: SMALL, base: [{ action: "speed", amount: { base: 0, step: 1, source: { type: "activeSize", size: SMALL } } }] },
    // Final : Vitesse +2 par minibille active, déjà retirée.
    ghost: { size: SMALL, maxWear: 1, final: [{ action: "speed", amount: { base: 0, step: 2, source: { type: "activeSize", size: SMALL } } }] },
    // Pointe : Masse +1, et Masse +2 si la base gauche est un calot.
    watcher: { size: MEDIUM, apex: [{ action: "mass", amount: 1 }, { action: "mass", amount: 2, when: { type: "sizeAt", slot: "leftBase", size: LARGE } }] },
  };
  const sizeRules = fabricatedRules(table);

  // Validation.
  const refused = (name, type) => run(`calibre, condition refusée : ${name}`, true, throws(() => validateTable({ a: type })));
  const accepted = (name, type) => run(`calibre, condition acceptée : ${name}`, false, throws(() => validateTable({ a: type })));
  const speedIf = (when) => [{ action: "speed", amount: 1, when }];
  accepted("comparaison relative dans un Tic", { hit: speedIf(smaller) });
  accepted("comparaison relative dans une Éjection", { knockout: speedIf(placedLarger) });
  refused("comparaison relative en base (pas de remplacement)", { base: speedIf(smaller) });
  refused("comparaison relative en pointe", { apex: speedIf(smaller) });
  refused("comparaison relative dans un Final", { final: speedIf(smaller) });
  refused("comparaison relative, bille inconnue", { hit: speedIf({ ...smaller, marble: "other" }) });
  refused("comparaison relative, sens inconnu", { hit: speedIf({ ...smaller, is: "equal" }) });
  accepted("calibre d'un emplacement", { apex: speedIf({ type: "sizeAt", slot: "leftBase", size: LARGE }) });
  refused("calibre d'un emplacement inconnu", { apex: speedIf({ type: "sizeAt", slot: "top", size: LARGE }) });
  refused("calibre d'emplacement inconnu", { apex: speedIf({ type: "sizeAt", slot: "leftBase", size: "large" }) });
  accepted("source par calibre", { base: [{ action: "speed", amount: { base: 0, step: 1, source: { type: "activeSize", size: SMALL } } }] });
  refused("source d'un calibre inconnu", { base: [{ action: "speed", amount: { base: 0, step: 1, source: { type: "activeSize", size: 0 } } }] });
  refused("source inconnue", { base: [{ action: "speed", amount: { base: 0, step: 1, source: { type: "nope" } } }] });
  refused("comptage per, remplacé par les montants calculés", { base: [{ action: "speed", amount: 1, per: { type: "activeSize", size: SMALL } }] });
  refused("source, champ inconnu", { base: [{ action: "speed", amount: { base: 0, step: 1, source: { type: "activeSize", size: SMALL, zone: "hand" } } }] });

  // Comparaison relative en Tic, vue par la posée : plus petite, égale, plus grosse.
  const hitOn = (occupant) =>
    apply(playState({ hand: inHand(["bully"]), triangle: triangleOf(null, null, placed(occupant)) }), { type: "place", handIndex: 0, slot: "apex" }, sizeRules);
  const hitSpeed = (occupant) => hitOn(occupant).events.find((event) => event.type === "effect" && event.trigger === "hit").speedDelta;
  run("calibre, Tic : un calot éjecte une minibille, plus petite : Vitesse +4", 4, hitSpeed("pebble"));
  run("calibre, Tic : un calot éjecte une normale, plus petite : Vitesse +4", 4, hitSpeed("plain"));
  run("calibre, Tic : un calot éjecte un calot, ni plus petit ni plus gros : rien", 0, hitSpeed("twin"));
  run.same(
    "calibre, Tic : le remplacement porté par l'évènement",
    { placed: "bully", ejected: "pebble" },
    hitOn("pebble").events.find((event) => event.type === "hit").replacement
  );
  const smallerHitter = apply(playState({ hand: inHand(["pebble"]), triangle: triangleOf(null, null, placed("plain")) }), { type: "place", handIndex: 0, slot: "apex" }, fabricatedRules({ ...table, pebble: { size: SMALL, hit: [{ action: "speed", amount: 4, when: smaller }] } }));
  run("calibre, Tic : une minibille éjecte une normale, plus grosse : rien", 0, smallerHitter.events.find((event) => event.type === "effect").speedDelta);

  // Comparaison relative en Éjection, vue par l'éjectée.
  const knockedBy = (incoming) =>
    apply(playState({ hand: inHand([incoming]), bag: ["plain"], triangle: triangleOf(placed("runt"), null, null) }), { type: "place", handIndex: 0, slot: "leftBase" }, sizeRules);
  const knockoutDraw = (incoming) => knockedBy(incoming).events.find((event) => event.type === "effect" && event.trigger === "knockout").draw;
  run("calibre, Éjection : posée plus grosse (un calot) : Pioche 1", 1, knockoutDraw("twin"));
  run("calibre, Éjection : posée plus grosse (une normale) : Pioche 1", 1, knockoutDraw("plain"));
  run("calibre, Éjection : posée de même calibre : rien", 0, knockoutDraw("pebble"));
  run("calibre, Éjection : la bille piochée", "plain", knockedBy("twin").state.hand.at(-1).marble);

  // Comptage, la bille elle-même comprise si elle en est.
  const phaseSpeed = (triangle, slot) =>
    apply(playState({ triangle }), { type: "resolve" }, sizeRules).events.find((event) => event.type === "effect" && event.trigger === "phase" && event.slot === slot).speedDelta;
  run("calibre, comptage : deux minibilles actives, Vitesse +2", 2, phaseSpeed(triangleOf(placed("counter"), placed("pebble"), placed("runt")), "leftBase"));
  run("calibre, comptage : aucune, rien", 0, phaseSpeed(triangleOf(placed("counter"), placed("plain"), placed("twin")), "leftBase"));
  run("calibre, comptage : la bille elle-même comprise", 2, phaseSpeed(triangleOf(placed("selfish"), placed("pebble"), null), "leftBase"));
  run("calibre, comptage : seule, elle se compte", 1, phaseSpeed(triangleOf(placed("selfish"), null, null), "leftBase"));
  const ghost = apply(playState({ triangle: triangleOf(placed("ghost"), placed("pebble"), null) }), { type: "resolve" }, sizeRules);
  run("calibre, comptage dans un Final : en partance, elle ne se compte plus", 2, ghost.events.find((event) => event.trigger === "final").speedDelta);
  const none = apply(playState({ triangle: triangleOf(placed("counter"), null, null) }), { type: "resolve" }, sizeRules);
  run("calibre, comptage à zéro : l'effet ne produit rien", "0 1", [none.events.find((event) => event.type === "effect").speedDelta, none.state.score === 0 ? 1 : 0].join(" "));

  // Calibre d'un emplacement ciblé, vide compris.
  const apexMass = (leftBase) => apply(playState({ triangle: triangleOf(leftBase, null, placed("watcher")) }), { type: "resolve" }, sizeRules).events.find((event) => event.trigger === "phase" && event.slot === "apex").massDelta;
  run("calibre, emplacement : la base gauche est un calot, Masse +3", 3, apexMass(placed("twin")));
  run("calibre, emplacement : une normale, Masse +1", 1, apexMass(placed("plain")));
  run("calibre, emplacement : vide, faux, Masse +1", 1, apexMass(null));

  // Prévision égale au réel, Tic et Éjection compris.
  const planned = playState({ hand: inHand(["bully"]), triangle: triangleOf(placed("counter"), placed("pebble"), placed("runt")) });
  for (const slot of SLOTS) {
    const predicted = sizeRules.forecast(planned, { type: "place", handIndex: 0, slot });
    const real = apply(apply(planned, { type: "place", handIndex: 0, slot }, sizeRules).state, { type: "resolve" }, sizeRules);
    run(`calibre, prévision : Impact comme le réel (pose en ${slot})`, real.events.find((event) => event.type === "impact").impact, predicted.impact);
  }
}

// Les billes de test des conditions de calibre, sur la vraie table : hit_pocket
// (comparaison au Tic), awaken_draw (comparaison à l'Éjection), size_count (comptage),
// final_pocket (calibre d'un emplacement, vide compris).
function checkSizeMarbles(run) {
  const effectOf = (events, trigger) => events.find((event) => event.type === "effect" && event.trigger === trigger);

  // hit_pocket, Tic : Vitesse +4 si l'éjectée est plus petite.
  const gorillaOn = (occupant) =>
    effectOf(apply(playState({ hand: inHand(["hit_pocket"]), triangle: triangleOf(null, null, placed(occupant)) }), { type: "place", handIndex: 0, slot: "apex" }).events, "hit").speedDelta;
  run("hit_pocket : éjecte une minibille, Vitesse +4", 4, gorillaOn("fragile"));
  run("hit_pocket : éjecte une normale, Vitesse +4", 4, gorillaOn("aging_flick"));
  run("hit_pocket : éjecte un calot, rien", 0, gorillaOn("one_shot"));

  // awaken_draw, Éjection : Pioche 1 si la posée est plus grosse.
  const micaKnocked = (incoming) => {
    const result = apply(playState({ hand: inHand([incoming]), bag: ["all_rounder"], triangle: triangleOf(placed("awaken_draw"), null, null) }), { type: "place", handIndex: 0, slot: "leftBase" });
    return { draw: effectOf(result.events, "knockout").draw, hand: handIds(result.state) };
  };
  run.same("awaken_draw : délogé par une normale, Pioche 1", { draw: 1, hand: ["all_rounder"] }, micaKnocked("aging_flick"));
  run.same("awaken_draw : délogé par un calot, Pioche 1", { draw: 1, hand: ["all_rounder"] }, micaKnocked("one_shot"));
  run.same("awaken_draw : délogé par une minibille, rien", { draw: 0, hand: [] }, micaKnocked("fragile"));

  // size_count, base : Vitesse +1 par minibille active.
  const stonewareSpeed = (rightBase, apex) =>
    apply(playState({ triangle: triangleOf(placed("size_count"), rightBase, apex) }), { type: "resolve" }).events.find((event) => event.trigger === "phase" && event.slot === "leftBase").speedDelta;
  run("size_count : deux minibilles actives, Vitesse +2", 2, stonewareSpeed(placed("fragile"), placed("tally_flick")));
  run("size_count : une seule, Vitesse +1", 1, stonewareSpeed(placed("aging_flick"), placed("awaken_draw")));
  run("size_count : aucune, rien", 0, stonewareSpeed(placed("aging_flick"), null));

  // final_pocket, pointe : Masse +1, et Masse +2 si la base gauche est un calot.
  const agateMass = (leftBase) =>
    apply(playState({ triangle: triangleOf(leftBase, null, placed("final_pocket")) }), { type: "resolve" }).events.find((event) => event.trigger === "phase" && event.slot === "apex").massDelta;
  run("final_pocket : base gauche un calot, Masse +3", 3, agateMass(placed("flick_strike")));
  run("final_pocket : base gauche une normale, Masse +1", 1, agateMass(placed("aging_flick")));
  run("final_pocket : base gauche vide, Masse +1", 1, agateMass(null));
}

// La Chiquenaude (doc/marbles.md, « Déroulé d'une pose ») : à chaque pose, avant tout
// le reste, la bille en cours de lancer, ni en main ni sur le triangle.
function checkFlick(run) {
  const toApex = { type: "place", handIndex: 0, slot: "apex" };
  const effectOf = (result, trigger) => result.events.find((event) => event.type === "effect" && event.trigger === trigger);

  // L'ordre du journal, sur un vide puis sur un occupé (fragile : Masse +1).
  const onEmpty = apply(playState({ hand: inHand(["fragile"]) }), toApex);
  run.same("chiquenaude, vide : la Chiquenaude, son effet, la pose", ["flick", "effect", "placed"], eventTypes(onEmpty.events));
  const { trigger, slot, marble, massDelta, mass } = onEmpty.events[1];
  run.same("chiquenaude : son effet, à l'emplacement visé, compté au tour", { trigger: "flick", slot: "apex", marble: "fragile", massDelta: 1, mass: 2 }, { trigger, slot, marble, massDelta, mass });
  const onOccupied = apply(playState({ hand: inHand(["fragile"]), triangle: triangleOf(null, null, placed("hit_pocket")) }), toApex);
  run.same(
    "chiquenaude, occupé : Chiquenaude, départ, Éjection, arrivée à la défausse, pose, Tic",
    ["flick", "effect", "removed", "knockout", "effect", "discarded", "placed", "hit"],
    eventTypes(onOccupied.events)
  );
  const counted = apply(playState({ hand: inHand(["all_rounder"], 3) }), toApex);
  run.same("chiquenaude : l'évènement porte le compteur de la bille lancée", { type: "flick", slot: "apex", marble: "all_rounder", turnsInHand: 3 }, counted.events[0]);
  run("chiquenaude : la pose reste un lancer", 1, counted.state.throwsUsed);
  run("chiquenaude : sans le champ, pas d'effet", false, counted.events.some((event) => event.type === "effect"));

  // En cours de lancer : ni en main, ni parmi les billes actives.
  const ghost = {
    drawer: { flick: [{ action: "draw", amount: 1 }] },
    counter: { flick: [{ action: "speed", amount: { base: 0, step: 1, source: { type: "activeSize", size: MEDIUM } } }] },
    plain: {},
  };
  const drew = apply(playState({ maxHandSize: 1, hand: inHand(["drawer"]), bag: ["plain"] }), toApex, ghost);
  run.same("chiquenaude : hors de la main, sa Pioche passe dans une main d'une place", ["plain"], handIds(drew.state));
  const alone = apply(playState({ hand: inHand(["counter"]) }), toApex, ghost);
  run("chiquenaude : hors des billes actives, elle ne se compte pas", 0, effectOf(alone, "flick").speedDelta);
  const among = apply(playState({ hand: inHand(["counter"]), triangle: triangleOf(placed("plain"), null, placed("plain")) }), toApex, ghost);
  run("chiquenaude : l'occupante, encore là, se compte", 2, effectOf(among, "flick").speedDelta);

  // La Chiquenaude qui vide l'emplacement visé par une Fêlure : flick_strike d'avant
  // Éjecter (Fêlure 3 à la pointe) sur une aging_flick (usure maximale 3). Celle d'aujourd'hui
  // l'éjecte : checkEject.
  const cleared = apply(playState({ hand: inHand(["flick_strike"]), triangle: triangleOf(null, null, placed("aging_flick")) }), toApex, fixedRules);
  run.same(
    "chiquenaude qui vide l'emplacement : retrait par usure, puis la pose, ni Éjection ni Tic",
    ["flick", "effect", "cracked", "removed", "final", "discarded", "placed"],
    eventTypes(cleared.events)
  );
  run("chiquenaude qui vide l'emplacement : l'occupante part par usure", "wear", cleared.events.find((event) => event.type === "discarded").cause);
  run.same(
    "chiquenaude qui vide l'emplacement : flick_strike en pointe, aging_flick à la défausse",
    { apex: placed("flick_strike"), discard: ["aging_flick"] },
    { apex: cleared.state.triangle.apex, discard: cleared.state.discard }
  );
  // Final compris : fragile (usure maximale 2) joue le sien, compté au tour.
  // fragile d'avant les choix : ce cas porte sur l'ordre du Final.
  const withFinal = apply(playState({ hand: inHand(["flick_strike"]), triangle: triangleOf(null, null, placed("fragile")) }), toApex, fixedRules);
  run.same(
    "chiquenaude qui vide l'emplacement : le Final de l'occupante, puis la pose",
    ["flick", "effect", "cracked", "removed", "final", "effect", "discarded", "placed"],
    eventTypes(withFinal.events)
  );
  run("chiquenaude qui vide l'emplacement : le Final compte pour le tour", 4, withFinal.state.speed);
  // La Fêlure ne suffit pas (all_rounder, usure maximale 4) : un remplacement ordinaire.
  const notCleared = apply(playState({ hand: inHand(["flick_strike"]), triangle: triangleOf(null, null, placed("all_rounder")) }), toApex, fixedRules);
  run.same(
    "chiquenaude : l'emplacement encore occupé, Éjection et Tic comme d'habitude",
    ["flick", "effect", "cracked", "removed", "knockout", "discarded", "placed", "hit"],
    eventTypes(notCleared.events)
  );
  // Posée ailleurs, flick_strike fêle quand même la pointe.
  const elsewhere = apply(playState({ hand: inHand(["flick_strike"]), triangle: triangleOf(null, null, placed("all_rounder")) }), { type: "place", handIndex: 0, slot: "leftBase" }, fixedRules);
  run.same("chiquenaude : la Fêlure ciblée, posée ailleurs", { marble: "all_rounder", wear: 3 }, elsewhere.state.triangle.apex);

  // Validation : la règle des cibles et les conditions.
  run("chiquenaude : une Vitesse ciblée est permise", false, throws(() => validateTable({ a: { flick: [{ action: "speed", amount: 1, target: "apex" }] } })));
  run("chiquenaude : une Fêlure ciblée est permise", false, throws(() => validateTable({ a: { flick: [{ action: "crack", amount: 1, target: "apex" }] } })));
  run("chiquenaude : une action sur elle-même est refusée", true, throws(() => validateTable({ a: { flick: [{ action: "polish", amount: 1 }] } })));
  // Où est la bille elle-même (marbles/core/effects.js/HOLDER_ZONES) : le refus le dit,
  // pour chaque action qui ne l'y prend pas.
  run("éveil : une Fêlure sur elle-même refusée, le message dit qu'elle est en main", true, /en main/.test(caughtMessage(() => validateTable({ a: { awaken: [{ action: "crack", amount: 1 }] } }))));
  run("éveil : Empocher elle-même est permis, elle est en main", false, throws(() => validateTable({ a: { awaken: [{ action: "pocket" }] } })));
  run("final : Éjecter elle-même refusé, le message dit qu'elle est en partance", true, /en partance/.test(caughtMessage(() => validateTable({ a: { final: [{ action: "eject" }] } }))));
  run("final : Empocher elle-même est permis, il la redirige", false, throws(() => validateTable({ a: { final: [{ action: "pocket" }] } })));
  run("chiquenaude : Empocher elle-même refusé, en cours de lancer", true, /en cours de lancer/.test(caughtMessage(() => validateTable({ a: { flick: [{ action: "pocket" }] } }))));
  run(
    "chiquenaude : pas de calibre relatif, aucun remplacement en cours",
    true,
    throws(() => validateTable({ a: { flick: [{ action: "speed", amount: 1, when: { type: "relativeSize", marble: "placed", is: "larger" } }] } }))
  );
}

// Le compteur de tours en main (marbles/core/marbles.js, en-tête).
function checkTurnsInHand(run) {
  const start = apply(
    { ...playState({ hand: [{ marble: "aging_flick", turnsInHand: 0 }, { marble: "all_rounder", turnsInHand: 2 }], bag: ["hit_polish"] }), stage: "draw" },
    { type: "draw" }
  );
  run.same(
    "compteur : +1 en début de tour pour les billes déjà en main, 0 pour la bille piochée",
    [
      { marble: "aging_flick", turnsInHand: 1 },
      { marble: "all_rounder", turnsInHand: 3 },
      { marble: "hit_polish", turnsInHand: 0 },
    ],
    start.state.hand
  );
  // Une vraie partie : au premier tour, tout à 0 ; au tour suivant, +1, la main pleine
  // n'ayant rien pioché.
  let game = apply(rules.createGame(5), { type: "draw" }).state;
  run.same("compteur : premier tour, tout à 0", [0, 0, 0, 0, 0], game.hand.map((held) => held.turnsInHand));
  game = apply(apply(game, { type: "resolve" }).state, { type: "draw" }).state;
  run.same("compteur : tour suivant, +1", [1, 1, 1, 1, 1], game.hand.map((held) => held.turnsInHand));
  // Quitter la main le perd : sur le triangle, une bille n'a que son usure.
  const placedFromHand = apply(game, { type: "place", handIndex: 0, slot: "apex" }).state;
  run.same("compteur : perdu en quittant la main", { marble: game.hand[0].marble, wear: 0 }, placedFromHand.triangle.apex);
  run.same("compteur : les autres le gardent", [1, 1, 1, 1], placedFromHand.hand.map((held) => held.turnsInHand));
  run.same("compteur : sérialisé avec l'état", placedFromHand.hand, JSON.parse(JSON.stringify(placedFromHand)).hand);
  // La prévision le lit sans le toucher.
  run.same("compteur : la prévision ne le change pas", game.hand, (rules.forecast(game, { type: "place", handIndex: 0, slot: "apex" }), game.hand));
}

// Les montants calculés (marbles/core/effects.js, en-tête) : base + pas × source,
// plafonnés, évalués au déclenchement.
function checkComputedAmounts(run) {
  const clayFlick = (turnsInHand) =>
    apply(playState({ hand: inHand(["aging_flick"], turnsInHand) }), { type: "place", handIndex: 0, slot: "apex" }).events.find((event) => event.trigger === "flick").speedDelta;
  run("montant calculé : aging_flick à 0 tour en main, Vitesse +0", 0, clayFlick(0));
  run("montant calculé : 2 tours, Vitesse +2", 2, clayFlick(2));
  run("montant calculé : 5 tours, au plafond", 5, clayFlick(5));
  run("montant calculé : 9 tours, plafonné à +5", 5, clayFlick(9));

  const inHandFor = (turnsInHand) => ({ triangle: null, holder: { marble: "x", zone: "hand", turnsInHand }, replacement: null });
  const source = { type: "turnsInHand" };
  run("montant calculé : base + pas × source", 8, amountOf({ base: 2, step: 3, source }, inHandFor(2)));
  run("montant calculé : plafonné", 6, amountOf({ base: 2, step: 3, source, max: 6 }, inHandFor(2)));
  run("montant calculé : base négative permise pour une Vitesse", -1, amountOf({ base: -3, step: 1, source }, inHandFor(2)));
  run("montant calculé : un entier reste lui-même", 4, amountOf(4, inHandFor(2)));
  run("montant calculé : jamais dans l'imprimé", 0, printedStat(FIXTURE_TYPES.aging_flick.flick, "speed"));

  // Une Pioche calculée à 0 ne pioche rien ; à 1, une bille.
  const drawer = { drawer: { flick: [{ action: "draw", amount: { base: 0, step: 1, source } }] }, plain: {} };
  const drawn = (turnsInHand) =>
    handIds(apply(playState({ hand: inHand(["drawer"], turnsInHand), bag: ["plain"] }), { type: "place", handIndex: 0, slot: "apex" }, drawer).state);
  run.same("montant calculé : Pioche à 0, rien", [], drawn(0));
  run.same("montant calculé : Pioche à 1, une bille", ["plain"], drawn(1));

  // Validation.
  const computed = (amount, action = "speed") => () => validateTable({ a: { flick: [{ action, amount }] } });
  run("montant calculé : bien formé, accepté", false, throws(computed({ base: 0, step: 1, source, max: 5 })));
  run("montant calculé : sans plafond, accepté", false, throws(computed({ base: 1, step: 2, source })));
  run("montant calculé : Pioche à base 0, acceptée", false, throws(computed({ base: 0, step: 1, source }, "draw")));
  run("montant calculé : Pioche à base négative, refusée", true, throws(computed({ base: -1, step: 1, source }, "draw")));
  run("montant calculé : pas nul, refusé", true, throws(computed({ base: 0, step: 0, source })));
  run("montant calculé : plafond pas au-dessus de la base, refusé", true, throws(computed({ base: 2, step: 1, source, max: 2 })));
  run("montant calculé : source inconnue, refusée", true, throws(computed({ base: 0, step: 1, source: { type: "luck" } })));
  run("montant calculé : champ inconnu, refusé", true, throws(computed({ base: 0, step: 1, source, min: 0 })));
  run("montant calculé : ni entier ni objet, refusé", true, throws(computed("2")));
  run("montant calculé : sur une phase aussi", false, throws(() => validateTable({ a: { apex: [{ action: "mass", amount: { base: 1, step: 1, source } }] } })));
}

// La Trouvaille (doc/marbles.md, « Les déclencheurs ») : à chaque régénération du
// sac, chez les billes actives, dans l'ordre des phases, avant que la pioche ne
// reprenne ; aux trois moments où une régénération arrive.
function checkWindfall(run) {
  // all_rounder d'avant Éjecter (sa base donne Vitesse +3, sans choix) : ces cas portent
  // sur la Trouvaille.
  const apply = (state, action, marbles = fixedRules) => mustReduce(typeof marbles.reduce === "function" ? marbles : fabricatedRules(marbles), state, action);
  // Chaque évènement, avec sa bille ; une pioche sans la sienne, que le mélange choisit.
  const typesAndMarbles = (events) => events.map((event) => (event.marble === undefined || event.type === "draw" ? event.type : `${event.type}:${event.marble}`));
  // De `first` à la première entrée `last` qui le suit.
  const between = (events, first, last) => {
    const types = typesAndMarbles(events);
    const from = types.indexOf(first);
    return types.slice(from, types.indexOf(last, from) + 1);
  };

  // Phase de jeu : le Tic de split_base pioche, la défausse devient le sac.
  const play = apply(
    playState({ hand: inHand(["split_base"]), bag: [], discard: ["aging_flick"], triangle: triangleOf(placed("all_rounder"), placed("final_pocket", 1), placed("hit_polish")) }),
    { type: "place", handIndex: 0, slot: "apex" }
  );
  run.same(
    "trouvaille, phase de jeu : régénération, trouvailles dans l'ordre horaire, puis la pioche",
    [
      "bagRegenerated",
      "windfall:final_pocket",
      "effect:final_pocket",
      "polished:final_pocket",
      "windfall:all_rounder",
      "effect:all_rounder",
      "windfall:split_base",
      "draw",
    ],
    between(play.events, "bagRegenerated", "draw")
  );
  run("trouvaille, phase de jeu : la Vitesse au compteur du tour", 3, play.state.speed);
  run("trouvaille, phase de jeu : le Polissage sur elle-même", 0, play.state.triangle.rightBase.wear);

  // Résolution : la Pioche de awaken_draw en phase régénère le sac ; celle du Final
  // de one_shot ne trouve plus rien : one_shot, en partance, n'est pas encore à la
  // défausse, elle ne peut pas se remélanger.
  const resolved = apply(playState({ bag: [], discard: ["aging_flick"], triangle: triangleOf(placed("awaken_draw"), placed("one_shot"), placed("all_rounder")) }), { type: "resolve" });
  const regenerations = resolved.events.filter((event) => event.type === "bagRegenerated").length;
  run("trouvaille, résolution : une régénération, en phase ; aucune au Final", 1, regenerations);
  run.same(
    "trouvaille, résolution : chez les billes actives",
    ["windfall:one_shot", "windfall:awaken_draw", "windfall:all_rounder"],
    typesAndMarbles(resolved.events).filter((entry) => entry.startsWith("windfall"))
  );
  run("trouvaille, résolution : au Final, plus rien à piocher", "noMarbles", resolved.events.findLast((event) => event.type === "drawSkipped")?.reason);
  run.same("trouvaille, résolution : one_shot arrive à la défausse après son Final", ["one_shot"], resolved.state.discard);
  run("trouvaille, résolution : comptée dans l'Impact (6 − 1 + 3)", 8, resolved.events.find((event) => event.type === "impact").impact);

  // Début de tour : les compteurs, remis à zéro par la résolution, reçoivent la
  // Trouvaille du nouveau tour.
  const ended = apply(playState({ hand: inHand(["hit_polish"]), bag: [], discard: ["aging_flick"], triangle: triangleOf(placed("all_rounder"), null, null) }), { type: "resolve" });
  run("trouvaille, début de tour : compteurs remis à zéro après la résolution", "0,1", `${ended.state.speed},${ended.state.mass}`);
  const started = apply(ended.state, { type: "draw" });
  run.same(
    "trouvaille, début de tour : régénération, trouvaille, pioche",
    ["turnStarted", "bagRegenerated", "windfall:all_rounder", "effect:all_rounder", "draw", "awaken:aging_flick"],
    typesAndMarbles(started.events)
  );
  run("trouvaille, début de tour : la Vitesse au compteur du nouveau tour", 3, started.state.speed);

  // Seulement les billes actives : en main, au sac, en défausse, rien.
  const idle = apply(playState({ hand: inHand(["all_rounder", "split_base"]), bag: [], discard: ["all_rounder", "final_pocket"], triangle: triangleOf(null, null, placed("hit_polish")) }), {
    type: "place",
    handIndex: 1,
    slot: "apex",
  });
  run.same(
    "trouvaille : seulement chez les billes actives",
    ["windfall:split_base"],
    typesAndMarbles(idle.events).filter((entry) => entry.startsWith("windfall"))
  );
  run("trouvaille : aucun effet sans bille active qui en a une", 0, idle.state.speed);
  // En cours de lancer : la Chiquenaude qui pioche régénère, la bille lancée n'a pas
  // la sienne.
  const thrownTable = { thrower: { flick: [{ action: "draw", amount: 1 }], windfall: [{ action: "speed", amount: 5 }] }, plain: {} };
  const thrown = apply(playState({ hand: inHand(["thrower"]), bag: [], discard: ["plain"] }), { type: "place", handIndex: 0, slot: "apex" }, thrownTable);
  run.same("trouvaille : pas chez la bille en cours de lancer", [], typesAndMarbles(thrown.events).filter((entry) => entry.startsWith("windfall")));

  // Retrait immédiat par Fêlure après une régénération : base_pocket fêle la
  // fragile (usure maximale 2), qui part, joue son Final en partance, puis rejoint
  // la défausse tout juste vidée, avant la reprise de la pioche.
  const cracked = apply(
    { ...playState({ bag: [], discard: ["aging_flick"], triangle: triangleOf(placed("base_pocket"), placed("fragile", 1), null) }), stage: "draw" },
    { type: "draw" },
    fixedRules
  );
  run.same(
    "trouvaille, Fêlure : départ, Final, arrivée à la défausse, puis la pioche",
    ["windfall:base_pocket", "effect:base_pocket", "cracked:fragile", "removed:fragile", "final:fragile", "effect:fragile", "discarded:fragile", "draw"],
    between(cracked.events, "windfall:base_pocket", "draw")
  );
  run.same("trouvaille, Fêlure : fragile seule dans la défausse vidée", ["fragile"], cracked.state.discard);
  run("trouvaille, Fêlure : aucune bille perdue", 3, marbleCount(cracked.state));
  run("trouvaille, Fêlure : le Final compte au tour", 4, cracked.state.speed);

  // Règle des cibles : un bonus dont la phase est passée se perd, noté au journal.
  const gifts = {
    gifter: { windfall: [{ action: "speed", amount: 2, target: "apex" }] },
    finisher: { maxWear: 1, final: [{ action: "draw", amount: 1 }] },
    plain: {},
  };
  const late = apply(playState({ bag: [], discard: ["plain"], triangle: triangleOf(placed("finisher"), placed("gifter"), placed("plain")) }), { type: "resolve" }, gifts);
  run.same(
    "trouvaille, cible : après les phases, le bonus perdu, noté",
    [{ slot: "apex", reason: "phasePassed", speed: 2, mass: 0 }],
    late.events.find((event) => event.trigger === "windfall").lost
  );
  const early = apply(
    { ...playState({ hand: inHand(["plain"]), bag: [], discard: ["plain"], triangle: triangleOf(null, placed("gifter"), placed("plain")) }), stage: "draw" },
    { type: "draw" },
    gifts
  );
  run("trouvaille, cible : avant les phases, le bonus donné", 2, early.ok && early.state.triangle.apex.bonus?.speed);

  // La Pioche d'une Trouvaille suit la pioche unifiée, et la pioche interrompue
  // relit ses conditions : la Trouvaille a pris la seule bille, plus rien à piocher.
  const greedy = { taker: { windfall: [{ action: "draw", amount: 1 }] }, dropper: { flick: [{ action: "draw", amount: 1 }] }, plain: {} };
  const taken = apply(
    playState({ hand: inHand(["dropper"]), bag: [], discard: ["plain"], triangle: triangleOf(placed("taker"), null, null) }),
    { type: "place", handIndex: 0, slot: "apex" },
    greedy
  );
  run.same(
    "trouvaille, Pioche : la bille prise par la Trouvaille, la pioche reprise s'arrête",
    ["bagRegenerated", "windfall:taker", "effect:taker", "draw", "awaken:plain", "drawSkipped"],
    between(taken.events, "bagRegenerated", "drawSkipped")
  );
  // Une boucle de Trouvailles (chaque Pioche régénère, chaque Fêlure remplit la
  // défausse) reste bornée : la limite du bus, ou la fin des billes.
  const looping = {
    looper: { windfall: [{ action: "draw", amount: 1 }, { action: "polish", amount: 1 }] },
    dropper: { hit: [{ action: "draw", amount: 1 }] },
  };
  const bounded = fabricatedRules(looping).reduce(
    playState({ hand: inHand(["dropper"]), bag: [], discard: ["looper"], triangle: triangleOf(placed("looper"), placed("looper"), placed("looper")) }),
    { type: "place", handIndex: 0, slot: "apex" }
  );
  run("trouvaille, boucle : l'action aboutit, jamais de gel ni de refus", true, bounded.ok);

  // Validation : une Vitesse ciblée et une action sur elle-même sont permises ; pas
  // de comparaison de calibre (aucun remplacement en cours).
  run("trouvaille : une Vitesse ciblée est permise", false, throws(() => validateTable({ a: { windfall: [{ action: "speed", amount: 1, target: "apex" }] } })));
  run("trouvaille : un Polissage sur elle-même est permis", false, throws(() => validateTable({ a: { windfall: [{ action: "polish", amount: 1 }] } })));
  run(
    "trouvaille : pas de calibre relatif",
    true,
    throws(() => validateTable({ a: { windfall: [{ action: "speed", amount: 1, when: { type: "relativeSize", marble: "placed", is: "larger" } }] } }))
  );
}

function pickTotals(result) {
  const { speed, mass } = result.events.find((event) => event.type === "impact");
  return { speed, mass };
}

function checkEndOfGame(run) {
  // Après le dernier tour.
  const lastTurn = apply(playState({ turn: 10, turnCount: 10, score: 3, triangle: triangleOf(placed("aging_flick"), null, null) }), { type: "resolve" });
  run("fin : après le dernier tour", "over", lastTurn.state.stage);
  run("fin : le tour reste au dernier", 10, lastTurn.state.turn);
  run.same("fin : dernier du journal", { type: "gameOver", score: 4 }, lastTurn.events.at(-1));
  run("fin : le nombre de tours vient des réglages", 10, rules.createGame(1).turnCount);
  const shortGame = apply(playState({ turn: 3, turnCount: 3, triangle: triangleOf(placed("aging_flick"), null, null) }), { type: "resolve" });
  run("fin : un nombre de tours réglé, la fin suit", "over", shortGame.state.stage);
  run("fin : avant le dernier tour, la partie continue", "draw", apply(playState({ turn: 9, turnCount: 10 }), { type: "resolve" }).state.stage);
  run.same("fin : la rotation et la fin du tour ont lieu avant", ["rotation", "turnEnded"], eventTypes(lastTurn.events).slice(-3, -1));
  run("fin : plus aucune action", "gameOver", rules.reduce(lastTurn.state, { type: "draw" }).error);
  run("fin : plus de résolution", "gameOver", rules.reduce(lastTurn.state, { type: "resolve" }).error);
  run("fin : plus d'échange", "gameOver", swapRefusal(lastTurn.state));
  run("fin : plus de pose", "gameOver", placeRefusal(lastTurn.state, 0, "apex"));

  // Plus de règle « sac régénéré de moins de 3 billes » : un sac de 2 se joue.
  const small = apply(
    { ...playState({ score: 12, hand: inHand(["aging_flick"]), bag: [], discard: ["final_pocket", "fragile"] }), stage: "draw" },
    { type: "draw" }
  );
  run("sac régénéré de 2 billes : la partie continue", "play", small.state.stage);
  run.same("sac régénéré de 2 billes : journal", ["turnStarted", "bagRegenerated", "draw", "awaken"], eventTypes(small.events));

  // Pioche impossible, faute de billes : dite, et la partie continue.
  const empty = apply({ ...playState({ score: 12, hand: inHand(["aging_flick"]), bag: [], discard: [] }), stage: "draw" }, { type: "draw" });
  run("sac et défausse vides : la partie continue", "play", empty.state.stage);
  run.same("sac et défausse vides : journal", ["turnStarted", "drawSkipped"], eventTypes(empty.events));
  run("sac et défausse vides : arrêt annoncé", "noMarbles", empty.events[1].reason);
  run("sac et défausse vides : la main se joue", null, placeRefusal(empty.state, 0, "apex"));
  // Plus aucune bille nulle part : chaque tour se résout à vide jusqu'au dernier.
  const nothing = apply({ ...playState({ turn: 10, turnCount: 10, hand: inHand([]), bag: [], discard: [] }), stage: "draw" }, { type: "draw" });
  run("plus aucune bille : le tour se joue quand même", "play", nothing.state.stage);
  run("plus aucune bille : la résolution du dernier tour finit la partie", "over", apply(nothing.state, { type: "resolve" }).state.stage);

  // Une seule bille piochée sur trois : la partie continue.
  const partial = apply({ ...playState({ hand: inHand([]), bag: ["hit_polish"], discard: [], drawPerTurn: 3 }), stage: "draw" }, { type: "draw" });
  run("pioche partielle : la partie continue", "play", partial.state.stage);
  run.same("pioche partielle : journal", ["turnStarted", "draw", "awaken", "drawSkipped"], eventTypes(partial.events));

  // Main pleine, sac et défausse vides : jamais une fin de partie.
  const full = apply({ ...playState({ hand: inHand(["aging_flick", "hit_polish", "final_pocket", "awaken_draw", "all_rounder"]), bag: [], discard: [] }), stage: "draw" }, { type: "draw" });
  run("main pleine, rien à piocher : la partie continue", "play", full.state.stage);
  run("main pleine, rien à piocher : motif de l'arrêt", "handFull", full.events[1].reason);

  // Plus de sac minimal : un sac plus petit que le triangle se joue, un sac vide
  // aussi, à vide.
  run("sac de 2 billes : la partie se joue", "play", apply(rules.createGame(1, { bag: ["aging_flick", "hit_polish"] }), { type: "draw" }).state.stage);
  run("sac vide : la partie se joue, à vide", "play", apply(rules.createGame(1, { bag: [] }), { type: "draw" }).state.stage);
}

// Une partie complète, décisions fixes : toujours la première bille sur les
// emplacements vides, un échange au tour 3. Rend état et journal.
function scriptedGame(seed) {
  let state = rules.createGame(seed);
  const journal = [];
  const step = (action) => {
    const result = answerChoices(rules, apply(state, action));
    state = result.state;
    journal.push(...result.events);
  };
  while (state.stage !== "over") {
    step({ type: "draw" });
    if (state.stage === "over") break;
    if (state.turn === 3) step({ type: "swap", a: "leftBase", b: "apex" });
    for (const slot of SLOTS) {
      if (state.triangle[slot] === null && state.hand.length > 0) step({ type: "place", handIndex: 0, slot });
    }
    step({ type: "resolve" });
  }
  return { state, journal };
}

function checkDeterminism(run) {
  const a = scriptedGame(1234);
  const b = scriptedGame(1234);
  run.same("déterminisme : même journal", a.journal, b.journal);
  run.same("déterminisme : même état final", a.state, b.state);
  run("partie complète : tous les tours joués", a.state.turnCount, a.journal.filter((event) => event.type === "turnStarted").length);
  run("partie complète : finie", "over", a.state.stage);
  run("partie complète : billes conservées", FIXTURE_BAG.length, marbleCount(a.state));
  run("autre graine : autre partie", false, JSON.stringify(a.journal) === JSON.stringify(scriptedGame(1235).journal));
  run("graine en chaîne acceptée", true, scriptedGame("billes").state.stage === "over");

  // Le réducteur ne touche jamais à l'état reçu.
  const frozen = deepFreeze(apply(rules.createGame(5), { type: "draw" }).state);
  run("pureté : pose sur un état figé", false, throws(() => apply(frozen, { type: "place", handIndex: 0, slot: "apex" })));
  run("pureté : résolution sur un état figé", false, throws(() => rules.reduce(deepFreeze(playState({ triangle: triangleOf(placed("aging_flick"), null, placed("one_shot")) })), { type: "resolve" })));
  run("pureté : pioche sur un état figé", false, throws(() => apply(deepFreeze({ ...playState({ hand: inHand([]), bag: [], discard: ["aging_flick", "hit_polish", "final_pocket", "awaken_draw", "all_rounder"] }), stage: "draw" }), { type: "draw" })));
}

function checkSerialization(run) {
  // Aller-retour JSON à chaque action : la partie rejouée à travers la
  // sérialisation doit finir exactement comme l'originale.
  const original = scriptedGame(99);
  let state = rules.createGame(99);
  const journal = [];
  let findings = [];
  // Chaque réponse à un choix passe aussi par l'aller-retour : un choix en attente
  // se sérialise.
  const step = (action) => {
    let result = apply(JSON.parse(JSON.stringify(state)), action);
    auditNonSerializable(result.state, "state", new Set(), findings);
    const events = [...result.events];
    while (result.state.pendingChoice) {
      result = apply(JSON.parse(JSON.stringify(result.state)), legalActions(result.state)[0]);
      auditNonSerializable(result.state, "state", new Set(), findings);
      events.push(...result.events);
    }
    state = result.state;
    journal.push(...events);
  };
  while (state.stage !== "over") {
    step({ type: "draw" });
    if (state.stage === "over") break;
    if (state.turn === 3) step({ type: "swap", a: "leftBase", b: "apex" });
    for (const slot of SLOTS) {
      if (state.triangle[slot] === null && state.hand.length > 0) step({ type: "place", handIndex: 0, slot });
    }
    step({ type: "resolve" });
  }
  run.same("sérialisation : rien de non sérialisable", [], findings);
  run.same("sérialisation : même état final après aller-retours", original.state, state);
  run.same("sérialisation : même journal", original.journal, journal);
}

function checkSmoke(run) {
  const seen = new Set();
  const bags = [
    undefined, // le sac de test, le cas principal
    { bag: ["aging_flick", "aging_flick", "aging_flick", "one_shot", "one_shot", "one_shot", "fragile", "fragile"] },
    { bag: ["one_shot", "one_shot", "one_shot", "one_shot", "one_shot", "one_shot"] },
    { bag: ["aging_flick", "hit_polish", "final_pocket", "awaken_draw", "all_rounder"] },
    { bag: ["aging_flick", "hit_polish", "final_pocket"] },
    { bag: ["awaken_draw", "awaken_draw", "awaken_draw"] }, // le plus petit sac permis : la pioche finit par manquer de billes
  ];
  const faults = [];
  let exceptions = 0;
  for (let seed = 1; seed <= 300; seed++) {
    // Une graine sur deux pour le sac de test, les autres se partagent les
    // petits sacs.
    const options = bags[seed % 2 === 0 ? 0 : 1 + ((seed - 1) / 2) % (bags.length - 1)];
    try {
      faults.push(...playRandomMarblesGame(rules, seed, options, seen).map((fault) => `graine ${seed} : ${fault}`));
    } catch (error) {
      exceptions += 1;
      faults.push(`graine ${seed} : exception ${error.message}`);
    }
  }
  // Une table étendue d'une bille qui déplace (Rebond, Ramasser, Défausser) : les
  // mêmes invariants sur des parties qui passent par ces chemins. La table figée,
  // elle, reste intacte : ses graines nourrissent d'autres vérifications.
  const moverRules = fixtureRules({
    ...FIXTURE_TYPES,
    mover: {
      size: MEDIUM,
      base: [{ action: "bounce", target: "apex" }],
      apex: [{ action: "speed", amount: 1 }, { action: "discard", target: { type: "bag", count: 1 } }],
      hit: [{ action: "retrieve", target: { type: "choice", zones: ["discard"], pick: "marble", count: 1 } }],
      knockout: [{ action: "retrieve", target: "lastDiscarded" }],
      final: [{ action: "bounce" }],
      maxWear: 2,
    },
  });
  for (let seed = 1; seed <= 60; seed++) {
    const options = { bag: ["mover", "mover", "aging_flick", "hit_polish", "one_shot", "fragile", "final_pocket", "awaken_draw"] };
    try {
      faults.push(...playRandomMarblesGame(moverRules, seed, options, seen).map((fault) => `table étendue, graine ${seed} : ${fault}`));
    } catch (error) {
      exceptions += 1;
      faults.push(`table étendue, graine ${seed} : exception ${error.message}`);
    }
  }
  run("fumée : aucune exception", 0, exceptions);
  run.same("fumée : invariants tenus", [], faults.slice(0, 5));
  // Chaque type d'évènement déclaré (JOURNAL_EVENTS) est réellement émis : la liste
  // n'a aucune entrée morte, et les parties de fumée passent partout. Sauf ceux
  // qu'une partie jouée n'émet jamais : la limite de sécurité (une anomalie,
  // vérifiée par le domaine marbles-bus) et le choix indécis, propre à la
  // prévision (domaine marbles-forecast).
  const neverPlayed = ["chainInterrupted", "choiceUndecided"];
  run.same(
    "fumée : chaque évènement du journal rencontré",
    Object.keys(JOURNAL_EVENTS).filter((type) => !neverPlayed.includes(type)).sort(),
    [...seen].sort()
  );
  // La limite de sécurité atteinte dans une vraie partie : une anomalie.
  run("fumée : aucun enchaînement interrompu (anomalie)", false, seen.has("chainInterrupted"));
}

// legalActions : une lecture pure, qui dit exactement ce que le réducteur
// accepterait, ni plus ni moins. Chaque action candidate (toutes les poses, tous
// les échanges, la résolution, la pioche) est passée au réducteur et comparée à la
// liste.
function checkLegalActions(run) {
  const candidates = (state) => [
    { type: "draw" },
    ...SLOTS.flatMap((a) => SLOTS.map((b) => ({ type: "swap", a, b }))),
    ...state.hand.flatMap((_, handIndex) => SLOTS.map((slot) => ({ type: "place", handIndex, slot }))),
    { type: "resolve" },
  ];
  // Un échange se liste une fois par paire : (a, b) et (b, a) sont le même.
  const key = (action) => (action.type === "swap" ? `swap:${[action.a, action.b].sort().join("-")}` : JSON.stringify(action));
  const accepted = (state) => [...new Set(candidates(state).filter((action) => rules.reduce(state, action).ok).map(key))].sort();
  const listed = (state) => legalActions(state).map(key).sort();

  const cases = {
    "pioche à faire": rules.createGame(1),
    "premier tour, triangle vide": apply(rules.createGame(1), { type: "draw" }).state,
    "tour 2, échange possible": playState({ hand: inHand(["aging_flick", "hit_polish"]), triangle: triangleOf(placed("final_pocket"), null, placed("awaken_draw")) }),
    "tour 2, échange déjà fait": playState({ hand: inHand(["aging_flick"]), swapUsed: true, triangle: triangleOf(placed("final_pocket"), null, null) }),
    "tour 2, triangle vide, main vide": playState({ hand: inHand([]) }),
    "partie finie": playState({ stage: "over" }),
  };
  for (const [label, state] of Object.entries(cases)) {
    run.same(`actions légales : ${label}, celles que le réducteur accepte`, accepted(state), listed(state));
  }
  run.same("actions légales : la pioche seule quand elle est due", [{ type: "draw" }], legalActions(rules.createGame(1)));
  run.same("actions légales : rien en fin de partie", [], legalActions(cases["partie finie"]));
  run(
    "actions légales : la résolution au premier tour sur un triangle vide",
    true,
    legalActions(cases["premier tour, triangle vide"]).some((action) => action.type === "resolve")
  );
  const frozen = deepFreeze(structuredClone(cases["tour 2, échange possible"]));
  run("actions légales : lecture pure, l'état n'est pas touché", false, throws(() => legalActions(frozen)));
}
