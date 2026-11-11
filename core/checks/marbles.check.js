// Vérifications du core — domaine « marbles ». Les règles du jeu des billes
// (core/marbles.js, doc/marbles.md) : ordre de résolution, usure, retrait,
// rotation, échange, déroulé d'une pose, Tic et Éjection, compteurs du tour,
// bonus, pioche et régénération, fin de partie, planchers, déterminisme,
// sérialisation ; puis un test de fumée de parties jouées au hasard. Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js marbles`).

import { auditNonSerializable, throws } from "../../lib/check.js";
import { nextRandom } from "../rng.js";
import {
  SLOTS,
  END_REASONS,
  createMarblesGame,
  marblesReduce,
  effectAt,
  impactOf,
  legalActions,
  maxWearOf,
  swapRefusal,
  placeRefusal,
  throwRefusal,
  throwsLeft,
  buildMarbleKeywords,
  validateMarblePhases,
  validateMarbleTriggers,
  validatePocketMoments,
  validateMarbleTypes,
} from "../marbles.js";
import { MARBLE_PHASES, MARBLE_POCKET, MARBLE_TRIGGERS } from "../../config/marbles-values.js";
import { CLAUSE_ACTIONS, amountOf, printedStat } from "../marbles-effects.js";
import { LARGE, MARBLE_SIZES, MEDIUM, SMALL, STARTING_BAG, MARBLES_SETTINGS } from "../../config/marbles-values.js";
import MARBLE_TYPES from "../../marbles/types/index.js";
import { answerChoices, emptyBagMarblesGame, earlierTestTypes, handIds, inHand, withSizes } from "./helpers.js";
import { createMarblesRules } from "../marbles-rules.js";

// Tables fabriquées : complétées d'un calibre (core/checks/helpers.js/withSizes).
const fabricatedRules = (table) => createMarblesRules(withSizes(table));
const validateTable = (table) => validateMarbleTypes(withSizes(table));

// Les règles du jeu, liées à la vraie table (core/marbles-rules.js).
const rules = createMarblesRules(MARBLE_TYPES);
// Les mêmes, gorille, verre et porcelaine d'avant les cibles au choix
// (core/checks/helpers.js/earlierTestTypes).
const fixedRules = createMarblesRules(earlierTestTypes(MARBLE_TYPES));

// Partie en cours de tour : le tour 2 par défaut, sac vide. `over` remplace ce que
// le test veut fixer.
function playState(over = {}) {
  return {
    ...emptyBagMarblesGame(rules, 1),
    turn: 2,
    stage: "play",
    ...over,
  };
}

const placed = (marble, wear = 0) => ({ marble, wear });

function triangleOf(leftBase, rightBase, apex) {
  return { leftBase, rightBase, apex };
}

// Applique une action qui doit passer ; une action refusée est une faute du
// test, nommée telle quelle plutôt qu'un échec plus loin.
// `marbles` : les règles à appliquer, celles du jeu par défaut ; ou une table
// fabriquée, dont on fait les règles.
function apply(state, action, marbles = rules) {
  return applyWith(state, action, marbles);
}

function applyWith(state, action, marbles) {
  const bound = typeof marbles.reduce === "function" ? marbles : fabricatedRules(marbles);
  const result = bound.reduce(state, action);
  if (!result.ok) throw new Error(`action refusée (${result.error}) : ${JSON.stringify(action)}`);
  return result;
}

function eventTypes(events) {
  return events.map((event) => event.type);
}

// Toutes les billes de la partie, où qu'elles soient : sac, main, défausse,
// triangle, pot et billes perdues. Aucune ne se crée ni ne disparaît.
function marbleCount(state) {
  const onTriangle = SLOTS.filter((slot) => state.triangle[slot] !== null).length;
  return state.bag.length + state.hand.length + state.discard.length + onTriangle + state.pot.length + state.lost.length;
}

// Fige récursivement : une écriture dans un état reçu lèverait (modules ES,
// donc mode strict), et prouverait que le réducteur n'est pas pur.
function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export default function checkMarbles(run) {
  checkTable(run);
  checkSetup(run);
  checkDraw(run);
  checkSwap(run);
  checkPlace(run);
  checkThrows(run);
  checkDrawEffects(run);
  checkTriggers(run);
  checkFinal(run);
  checkHitAndKnockout(run);
  checkMagnifier(run);
  checkTargetRule(run);
  checkWearActions(run);
  checkWearMarbles(run);
  checkSizeConditions(run);
  checkSizeMarbles(run);
  checkFlick(run);
  checkTurnsInHand(run);
  checkComputedAmounts(run);
  checkWindfall(run);
  checkAwaken(run);
  checkKeywordDeclarations(run);
  checkPocket(run);
  checkPocketReactions(run);
  checkChoices(run);
  checkEject(run);
  checkBonus(run);
  checkResolution(run);
  checkEndOfGame(run);
  checkDeterminism(run);
  checkSerialization(run);
  checkSmoke(run);
  checkLegalActions(run);
}

function checkTable(run) {
  run("table : 13 billes", 13, Object.keys(MARBLE_TYPES).length);
  run.same("sac de test : un exemplaire de chaque", Object.keys(MARBLE_TYPES).sort(), [...STARTING_BAG].sort());
  run("usure par défaut", 3, rules.maxWearOf("clay"));
  run("usure propre", 4, rules.maxWearOf("tiger"));
  run("usure 1 de la géante", 1, rules.maxWearOf("giant"));
  run("usure de la loupe", 3, rules.maxWearOf("magnifier"));

  const amount = (clauses) => clauses[0].amount;
  run("variante : œil-de-chat, base gauche", 3, amount(rules.effectAt("cats_eye", "leftBase")));
  run("variante : œil-de-chat, base droite", "mass", rules.effectAt("cats_eye", "rightBase")[0].action);
  run("variante : la base droite n'a pas la Vitesse de base", 0, printedStat(rules.effectAt("cats_eye", "rightBase"), "speed"));
  run("sans variante : même effet sur les deux bases", rules.effectAt("clay", "leftBase"), rules.effectAt("clay", "rightBase"));
  run("pointe", 4, amount(rules.effectAt("clay", "apex")));
  run("effet absent : aucun effet", 0, rules.effectAt("gorilla", "leftBase").length);
  run("effet absent : la même valeur partout", rules.effectAt("gorilla", "leftBase"), rules.effectAt("stoneware", "apex"));

  run.same("Tic de l'argile", [{ action: "speed", amount: 2 }], MARBLE_TYPES.clay.hit);
  run.same("Tic de l'agate", [{ action: "mass", amount: 1 }], MARBLE_TYPES.agate.hit);
  run.same("Éjection du gorille", [{ action: "speed", amount: 3 }], MARBLE_TYPES.gorilla.knockout);
  run.same("Éjection de la plombée", [{ action: "mass", amount: 1 }], MARBLE_TYPES.leaded.knockout);

  run("imprimé : ce que la clause donne", 6, printedStat(rules.effectAt("gorilla", "apex"), "speed"));
  run("imprimé : une autre statistique ne compte pas", 0, printedStat(rules.effectAt("agate", "apex"), "speed"));
  run("imprimé : négatif", -3, printedStat(rules.effectAt("leaded", "apex"), "speed"));
  run("imprimé : une clause conditionnelle ne compte pas", 0, printedStat(rules.effectAt("magnifier", "leftBase"), "speed"));

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
  run("calibre : chaque bille du jeu en a un valide", true, Object.values(MARBLE_TYPES).every((type) => Object.hasOwn(MARBLE_SIZES, type.size)));
  run("calibre : trois, dans l'ordre", true, SMALL < MEDIUM && MEDIUM < LARGE);

  // Les règles (core/marbles-rules.js) : liées à UNE table, validée à la composition.
  run("règles : une table mal formée refusée à la composition", true, throws(() => fabricatedRules({ a: { maxWear: 0 } })));
  run("règles : la table du jeu acceptée", false, throws(() => createMarblesRules(MARBLE_TYPES)));
  const custom = fabricatedRules({ clay: { apex: [{ action: "speed", amount: 9 }], maxWear: 5 } });
  run("règles : chaque jeu de règles lit SA table", "3 5", `${rules.maxWearOf("clay")} ${custom.maxWearOf("clay")}`);
  run.same("règles : l'effet imprimé vient de sa table", [{ action: "speed", amount: 9 }], custom.effectAt("clay", "apex"));
  run("règles : une partie neuve avec le sac de test", 13, rules.createGame(1).bag.length + rules.createGame(1).hand.length);
  run("règles : figées", true, Object.isFrozen(rules));
}

function checkSetup(run) {
  const game = rules.createGame(42);
  run("mise en place : sac complet", STARTING_BAG.length, game.bag.length);
  run.same("mise en place : sac mélangé, mêmes billes", [...STARTING_BAG].sort(), [...game.bag].sort());
  run("mise en place : sac réellement mélangé", false, game.bag.join() === STARTING_BAG.join());
  run.same("mise en place : main vide", [], game.hand);
  run.same("mise en place : défausse vide", [], game.discard);
  run.same("mise en place : triangle vide", triangleOf(null, null, null), game.triangle);
  run("mise en place : score 0", 0, game.score);
  run("mise en place : compteurs du tour", "0,1", `${game.speed},${game.mass}`);
  run("réglages : main maximale", 5, MARBLES_SETTINGS.maxHandSize);
  run("réglages : pioche du premier tour", 5, MARBLES_SETTINGS.firstTurnDraw);
  run("réglages : pioche par tour", 1, MARBLES_SETTINGS.drawPerTurn);
  run("réglages : main maximale dans l'état", MARBLES_SETTINGS.maxHandSize, game.maxHandSize);
  run("réglages : nombre de tours", MARBLES_SETTINGS.turnCount, game.turnCount);

  run("sac : bille inconnue refusée", true, throws(() => rules.createGame(1, { bag: ["clay", "nope"] })));
  run("réglages : première pioche plus petite que le triangle permise", 2, rules.createGame(1, { firstTurnDraw: 2 }).firstTurnDraw);
  run("réglages : première pioche nulle refusée", true, throws(() => rules.createGame(1, { firstTurnDraw: 0 })));
  run("réglages : main plus petite que la première pioche refusée", true, throws(() => rules.createGame(1, { maxHandSize: 4 })));
  run("réglages : pioche par tour nulle refusée", true, throws(() => rules.createGame(1, { drawPerTurn: 0 })));
  const doubles = rules.createGame(1, { bag: ["clay", "clay", "clay", "glass", "glass", "agate"] });
  run("sac : doublons acceptés", 3, doubles.bag.filter((id) => id === "clay").length);

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
  const later = apply({ ...playState({ hand: inHand(["clay", "glass", "agate"]), bag: ["porcelain", "gorilla", "stoneware"] }), stage: "draw" }, { type: "draw" });
  run("pioche : 1 bille aux tours suivants", "clay,glass,agate,porcelain", handIds(later.state).join());
  run("pioche : le reste au sac", "gorilla,stoneware", later.state.bag.join());
  run.same("pioche : journal du tour suivant", ["turnStarted", "draw", "awaken"], eventTypes(later.events));

  // Main pleine : la pioche est sautée, la bille reste au sac.
  const fullHand = inHand(["clay", "glass", "agate", "mica", "tiger"]);
  const skipped = apply({ ...playState({ hand: fullHand, bag: ["giant", "gorilla"] }), stage: "draw" }, { type: "draw" });
  run.same("main pleine : journal", ["turnStarted", "drawSkipped"], eventTypes(skipped.events));
  run("main pleine : motif", "handFull", skipped.events[1].reason);
  run("main pleine : main inchangée", fullHand.map((held) => held.marble).join(), handIds(skipped.state).join());
  run("main pleine : la bille reste au sac", "giant,gorilla", skipped.state.bag.join());
  run("main pleine : le tour se joue", "play", skipped.state.stage);
  const fullNoBag = apply({ ...playState({ hand: fullHand, bag: [], discard: ["giant"] }), stage: "draw" }, { type: "draw" });
  run("main pleine : pas de régénération, même sac vide", false, eventTypes(fullNoBag.events).includes("bagRegenerated"));
  run("main pleine : la partie continue, même défausse courte", "play", fullNoBag.state.stage);
  const almostFull = apply({ ...playState({ hand: fullHand.slice(0, 4), bag: ["giant", "gorilla"] }), stage: "draw" }, { type: "draw" });
  run("main à 4 billes : la pioche passe", 5, almostFull.state.hand.length);

  // Une pioche de plusieurs billes s'arrête quand la main est pleine.
  const large = apply({ ...playState({ hand: fullHand.slice(0, 4), bag: ["gorilla", "stoneware", "porcelain"], drawPerTurn: 3 }), stage: "draw" }, { type: "draw" });
  run.same("pioche de 3 : s'arrête à la main pleine", ["turnStarted", "draw", "awaken", "drawSkipped"], eventTypes(large.events));
  run("pioche de 3 : le reste au sac", "stoneware,porcelain", large.state.bag.join());

  // Régénération pendant la pioche : le mélange, puis la bille.
  const regen = apply({ ...playState({ hand: inHand(["clay"]), bag: [], discard: ["agate", "porcelain", "gorilla", "stoneware"] }), stage: "draw" }, { type: "draw" });
  run.same("régénération : journal dans l'ordre", ["turnStarted", "bagRegenerated", "draw", "awaken"], eventTypes(regen.events));
  run("régénération : taille annoncée", 4, regen.events[1].size);
  run("régénération : défausse vidée", 0, regen.state.discard.length);
  run("régénération : une bille piochée", 2, regen.state.hand.length);
  run("régénération : le reste au sac", 3, regen.state.bag.length);
  run("régénération : mêmes billes après coup", "agate,clay,gorilla,porcelain,stoneware", [...handIds(regen.state), ...regen.state.bag].sort().join());

  const midDraw = apply(
    { ...playState({ hand: inHand([]), bag: ["glass"], discard: ["agate", "porcelain", "gorilla"], turn: 1 }), stage: "draw" },
    { type: "draw" }
  );
  run.same(
    "régénération en cours de pioche : ce qui restait d'abord",
    ["turnStarted", "draw", "awaken", "bagRegenerated", "draw", "awaken", "draw", "awaken", "draw", "awaken"],
    eventTypes(midDraw.events).slice(0, 10)
  );
  run("régénération en cours de pioche : la bille du sac en premier", "glass", midDraw.state.hand[0].marble);

  // Un sac qui se vide sans que la pioche demande une bille de plus ne régénère pas.
  const exact = apply({ ...playState({ hand: inHand(["clay"]), bag: ["porcelain"], discard: ["giant"] }), stage: "draw" }, { type: "draw" });
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
  const ended = apply(playState({ hand: inHand([]), bag: ["tiger", "clay"], triangle: triangleOf(placed("clay"), null, null) }), { type: "resolve" });
  const turnStart = apply(ended.state, { type: "draw" });
  run.same("éveil, début de tour : pioche, éveil, effet", ["turnStarted", "draw:tiger", "awaken:tiger", "effect:awaken:tiger"], journal(turnStart.events));
  run("éveil, début de tour : la Vitesse au compteur du nouveau tour", 2, turnStart.state.speed);
  run("éveil, début de tour : la bille en main", "tiger", handIds(turnStart.state).join());

  // Pioche d'un effet (le Tic de l'œil-de-chat) : l'éveil aussi.
  const tic = apply(playState({ hand: inHand(["cats_eye"]), bag: ["tiger"], triangle: triangleOf(null, null, placed("glass")) }), { type: "place", handIndex: 0, slot: "apex" });
  run.same("éveil, pioche d'un effet : après la pioche", ["draw:tiger", "awaken:tiger", "effect:awaken:tiger"], journal(tic.events).slice(-3));
  run("éveil, pioche d'un effet : la Vitesse au compteur du tour en cours", 2, tic.state.speed);

  // Main pleine : la bille reste au sac, pas d'éveil.
  const full = apply({ ...playState({ hand: inHand(["clay", "glass", "agate", "porcelain", "gorilla"]), bag: ["tiger"] }), stage: "draw" }, { type: "draw" });
  run.same("éveil, main pleine : pas de pioche, pas d'éveil", ["turnStarted", "drawSkipped"], journal(full.events));

  // Ordre : régénération, trouvailles, pioche, éveil, pioche suivante.
  const ordered = apply(
    { ...playState({ hand: inHand([]), bag: [], discard: ["tiger"], drawPerTurn: 2, triangle: triangleOf(placed("agate", 1), null, null) }), stage: "draw" },
    { type: "draw" }
  );
  run.same(
    "éveil, ordre : régénération, trouvaille, pioche, éveil, puis l'arrêt de la pioche",
    ["turnStarted", "bagRegenerated", "windfall:agate", "effect:windfall:agate", "polished:agate", "draw:tiger", "awaken:tiger", "effect:awaken:tiger", "drawSkipped"],
    journal(ordered.events)
  );

  // L'enchaînement du mica : chaque mica piochée pioche la suivante, avant que la
  // pioche du tour ne reprenne.
  const chain = apply({ ...playState({ hand: inHand([]), bag: ["mica", "mica", "clay", "glass"] }), stage: "draw" }, { type: "draw" });
  run.same(
    "éveil, enchaînement du mica",
    ["turnStarted", "draw:mica", "awaken:mica", "effect:awaken:mica", "draw:mica", "awaken:mica", "effect:awaken:mica", "draw:clay", "awaken:clay"],
    journal(chain.events)
  );
  run("éveil, enchaînement : trois billes en main", "mica,mica,clay", handIds(chain.state).join());
  run.same("éveil, enchaînement : compteurs d'éveils et de billes piochées", { awaken: 2, drawnMarbles: 3, draw: 2, drawQuantity: 2 }, {
    awaken: chain.state.tally.awaken.game,
    drawnMarbles: chain.state.tally.drawnMarbles.game,
    draw: chain.state.tally.draw.game,
    drawQuantity: chain.state.tally.drawQuantity.game,
  });
  // Avec une régénération au milieu, puis plus rien : l'enchaînement s'arrête.
  const regenerated = apply({ ...playState({ hand: inHand([]), bag: ["mica"], discard: ["mica"] }), stage: "draw" }, { type: "draw" });
  run.same(
    "éveil, enchaînement avec régénération",
    ["turnStarted", "draw:mica", "awaken:mica", "effect:awaken:mica", "bagRegenerated", "draw:mica", "awaken:mica", "effect:awaken:mica", "drawSkipped"],
    journal(regenerated.events)
  );
  run("éveil, enchaînement avec régénération : la partie continue", "play", regenerated.state.stage);
  // Borné par la main pleine.
  const bounded = apply({ ...playState({ hand: inHand(["clay", "glass", "agate", "porcelain"]), bag: ["mica", "mica", "mica"] }), stage: "draw" }, { type: "draw" });
  run.same("éveil, enchaînement borné par la main pleine", ["draw:mica", "awaken:mica", "effect:awaken:mica", "drawSkipped"], journal(bounded.events).slice(1));

  // Règle des cibles : le Polissage ciblé de la géante sur la pointe ; un emplacement
  // vide, noté.
  const giant = (apex) => apply({ ...playState({ hand: inHand([]), bag: ["giant"], triangle: triangleOf(null, null, apex) }), stage: "draw" }, { type: "draw" });
  run("éveil, cible : la géante polit la pointe", 0, giant(placed("tiger", 2)).state.triangle.apex.wear - 1);
  run.same(
    "éveil, cible : pointe vide, notée avec son effet",
    { type: "targetEmpty", action: "polish", slot: "apex", by: { trigger: "awaken", slot: null, marble: "giant" } },
    giant(null).events.at(-1)
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
  const quiet = apply({ ...playState({ hand: inHand([]), bag: ["clay"] }), stage: "draw" }, { type: "draw" });
  run.same("éveil : sans le champ, l'évènement seul", ["turnStarted", "draw:clay", "awaken:clay"], journal(quiet.events));
}

// Le POT : capacité, Empocher depuis chaque origine, cibles vides, validation, la
// règle « une seule fois d'une zone à l'autre », et le mot-clé En poche (entrée,
// résolution).
function checkPocket(run) {
  // Les mécanismes du pot, sur le gorille d'avant les choix (la première de la main).
  const apply = (state, action, marbles = fixedRules) => applyWith(state, action, marbles);
  const journal = (events) =>
    events.map((event) => {
      if (event.type === "effect") return `effect:${event.trigger}:${event.marble}`;
      if (event.type === "removed") return `removed:${event.marble}:${event.cause}`;
      if (event.type === "pocketed" || event.type === "lost") return `${event.type}:${event.marble}:${event.from}`;
      if (event.type === "targetEmpty") return `targetEmpty:${event.action}:${event.target ?? event.slot}`;
      return event.marble === undefined ? event.type : `${event.type}:${event.marble}`;
    });
  // Toutes les billes de la partie, pot et billes perdues comprises.
  const everywhere = (state) => marbleCount(state);

  run("pot : capacité par défaut", MARBLES_SETTINGS.potCapacity, rules.createGame(1).potCapacity);
  run.same("pot : vide en début de partie, aucune bille perdue", { pot: [], lost: [] }, (({ pot, lost }) => ({ pot, lost }))(rules.createGame(1)));
  run("pot : capacité négative refusée", true, throws(() => rules.createGame(1, { potCapacity: -1 })));
  run("pot : capacité nulle permise", 0, rules.createGame(1, { potCapacity: 0 }).potCapacity);

  // Depuis la main : le Tic du gorille empoche la première bille de la main ; la
  // porcelaine entre, puis son effet d'entrée.
  const gorilla = apply(playState({ hand: inHand(["gorilla", "porcelain", "clay"]), triangle: triangleOf(null, null, placed("clay")) }), { type: "place", handIndex: 0, slot: "apex" });
  run.same(
    "Empocher, depuis la main : la mise en poche, puis l'entrée",
    ["effect:hit:gorilla", "pocketed:porcelain:hand", "effect:pocketEntry:porcelain"],
    journal(gorilla.events).slice(-3)
  );
  run.same("Empocher, depuis la main : le pot, la main", { pot: ["porcelain"], hand: ["clay"] }, { pot: gorilla.state.pot, hand: handIds(gorilla.state) });
  run("Empocher, depuis la main : l'entrée aux compteurs du tour (4 + 10)", 14, gorilla.state.speed);
  // Main vide : sans effet, noté.
  const emptyHand = apply(playState({ hand: inHand(["gorilla"]), triangle: triangleOf(null, null, placed("clay")) }), { type: "place", handIndex: 0, slot: "apex" });
  run("Empocher, main vide : noté", "targetEmpty:pocket:firstInHand", journal(emptyHand.events).at(-1));

  // Pot plein : la bille est perdue, sans effet d'entrée.
  const full = apply(
    playState({ hand: inHand(["gorilla", "porcelain"]), triangle: triangleOf(null, null, placed("clay")), pot: ["clay", "glass", "mica"] }),
    { type: "place", handIndex: 0, slot: "apex" }
  );
  run.same("pot plein : la bille perdue, sans effet d'entrée", ["effect:hit:gorilla", "lost:porcelain:hand"], journal(full.events).slice(-2));
  run.same("pot plein : pot inchangé, la bille chez les perdues", { pot: ["clay", "glass", "mica"], lost: ["porcelain"] }, { pot: full.state.pot, lost: full.state.lost });
  run("pot plein : ni entrée ni Vitesse +10", 4, full.state.speed);
  const zero = apply(
    { ...playState({ hand: inHand(["gorilla", "porcelain"]), triangle: triangleOf(null, null, placed("clay")) }), potCapacity: 0 },
    { type: "place", handIndex: 0, slot: "apex" }
  );
  run.same("pot de capacité nulle : toute bille empochée est perdue", [], zero.state.pot);

  // Depuis un emplacement, pendant la résolution : le sulfure en base empoche la
  // pointe ; ni usure ni éjection (pas de Final) ; la phase de pointe est sautée.
  const sulphide = apply(playState({ bag: ["clay"], triangle: triangleOf(placed("sulphide"), null, placed("porcelain", 1)) }), { type: "resolve" });
  run.same(
    "Empocher, depuis un emplacement : retrait, mise en poche, entrée, puis la suite",
    ["phase:sulphide", "effect:phase:sulphide", "removed:porcelain:pocket", "pocketed:porcelain:triangle", "effect:pocketEntry:porcelain", "wear:sulphide", "phaseSkipped", "phaseSkipped"],
    journal(sulphide.events).slice(0, 8)
  );
  run("Empocher, depuis un emplacement : pas de Final", false, sulphide.events.some((event) => event.type === "final"));
  run("Empocher, depuis un emplacement : dans l'Impact, l'entrée et pas la phase de la porcelaine", 10, sulphide.events.find((event) => event.type === "impact").impact);
  run("Empocher, depuis un emplacement : rien à la défausse", 0, sulphide.state.discard.length);
  const emptyApex = apply(playState({ triangle: triangleOf(placed("sulphide"), null, null) }), { type: "resolve" });
  run("Empocher, emplacement vide : noté", true, journal(emptyApex.events).includes("targetEmpty:pocket:apex"));

  // Depuis la défausse : le Final de l'agate (usure 2 sur 3) l'empoche, déjà
  // défaussée ; elle n'est qu'à un endroit, le pot.
  const agate = apply(playState({ triangle: triangleOf(null, null, placed("agate", 2)) }), { type: "resolve" });
  run.same(
    "Empocher, Final : retrait, défausse, Final, puis la mise en poche depuis la défausse",
    ["removed:agate:wear", "discarded:agate", "final:agate", "effect:final:agate", "targetEmpty:polish:apex", "pocketed:agate:discard"],
    journal(agate.events).filter((entry) => !["impact", "rotation", "turnEnded"].includes(entry)).slice(-6)
  );
  run.same("Empocher, Final : au pot, pas à la défausse", { pot: ["agate"], discard: [] }, { pot: agate.state.pot, discard: agate.state.discard });
  run("Empocher, Final : aucune bille perdue ni dupliquée", 1, everywhere(agate.state));

  // Pendant sa propre Éjection : elle ne passe qu'une fois, au pot.
  const shy = { shy: { knockout: [{ action: "pocket" }] }, plain: {} };
  const ejected = apply(playState({ hand: inHand(["plain"]), triangle: triangleOf(null, null, placed("shy")) }), { type: "place", handIndex: 0, slot: "apex" }, shy);
  run.same(
    "Empocher, sa propre Éjection : au pot, jamais à la défausse",
    ["flick:plain", "knockout:shy", "effect:knockout:shy", "removed:shy:pocket", "pocketed:shy:triangle", "placed:plain", "hit:plain"],
    journal(ejected.events)
  );
  run.same("Empocher, sa propre Éjection : le pot, une défausse vide", { pot: ["shy"], discard: [] }, { pot: ejected.state.pot, discard: ejected.state.discard });
  run("Empocher, sa propre Éjection : aucune bille dupliquée", 2, everywhere(ejected.state));

  // Pendant son Éveil : depuis la main ; une seconde fois, elle n'est plus là.
  const waking = { waker: { awaken: [{ action: "pocket" }, { action: "pocket" }] }, plain: {} };
  const awoken = apply({ ...playState({ hand: inHand([]), bag: ["waker"] }), stage: "draw" }, { type: "draw" }, waking);
  run.same(
    "Empocher, Éveil : depuis la main, puis la bille n'est plus là",
    ["draw:waker", "awaken:waker", "effect:awaken:waker", "pocketed:waker:hand", "targetEmpty:pocket:self"],
    journal(awoken.events).slice(1)
  );
  run.same("Empocher, Éveil : la main vide, la bille au pot", { pot: ["waker"], hand: [] }, { pot: awoken.state.pot, hand: handIds(awoken.state) });

  // Jamais remélangées : pot et billes perdues restent où elles sont à la régénération.
  const regenerated = apply({ ...playState({ hand: inHand([]), bag: [], discard: ["glass"], pot: ["agate"], lost: ["clay"] }), stage: "draw" }, { type: "draw" });
  run.same("pot et billes perdues : jamais remélangées", { pot: ["agate"], lost: ["clay"], hand: ["glass"] }, { pot: regenerated.state.pot, lost: regenerated.state.lost, hand: handIds(regenerated.state) });

  // L'étape du pot : après les trois phases, avant les retraits, dans l'ordre
  // d'arrivée ; une bille sans effet de résolution passe sans effet.
  const pot = apply(
    playState({ triangle: triangleOf(placed("magnifier"), null, placed("porcelain", 1)), pot: ["agate", "glass", "sulphide"] }),
    { type: "resolve" }
  );
  const steps = journal(pot.events);
  run.same(
    "pot, résolution : chaque bille dans l'ordre d'arrivée, après les phases, avant les retraits",
    ["potResolution:agate", "effect:pocketResolution:agate", "potResolution:glass", "potResolution:sulphide", "effect:pocketResolution:sulphide", "removed:porcelain:wear"],
    steps.slice(steps.indexOf("potResolution:agate"), steps.indexOf("removed:porcelain:wear") + 1)
  );
  run("pot, résolution : après la phase de pointe", true, steps.indexOf("wear:porcelain") < steps.indexOf("potResolution:agate"));
  run.same(
    "pot, résolution : l'agate Masse +1, le sulfure Vitesse +2 par minibille active (loupe, porcelaine)",
    [{ marble: "agate", massDelta: 1 }, { marble: "sulphide", speedDelta: 4 }],
    pot.events.filter((event) => event.trigger === "pocketResolution").map(({ marble, speedDelta, massDelta }) => (marble === "agate" ? { marble, massDelta } : { marble, speedDelta }))
  );
  const impact = pot.events.find((event) => event.type === "impact");
  run("pot, résolution : compté dans l'Impact", impactOf(impact.speed, impact.mass), impact.impact);
  run("pot, résolution : la Masse de l'agate dans l'Impact", 2, impact.mass);
  // Une bille empochée pendant la résolution, avant l'étape du pot, y passe ce tour.
  const late = apply(playState({ triangle: triangleOf(placed("sulphide"), null, placed("agate")) }), { type: "resolve" });
  run("pot, résolution : la bille empochée pendant les phases y passe", true, journal(late.events).includes("effect:pocketResolution:agate"));

  // Validation : jamais sur soi dans une Chiquenaude ni dans le pot ; une Vitesse
  // ciblée à chaque résolution n'a plus de phase ; les autres actions ciblées passent.
  const refused = (table) => throws(() => validateTable(table));
  run("validation : Empocher soi-même dans sa Chiquenaude refusé", true, refused({ a: { flick: [{ action: "pocket" }] } }));
  run("validation : Empocher une cible dans sa Chiquenaude permis", false, refused({ a: { flick: [{ action: "pocket", target: "apex" }] } }));
  run("validation : Empocher soi-même au Final permis", false, refused({ a: { final: [{ action: "pocket" }] } }));
  run("validation : Empocher soi-même à l'Éveil permis", false, refused({ a: { awaken: [{ action: "pocket" }] } }));
  run("validation : Empocher avec un montant refusé", true, refused({ a: { base: [{ action: "pocket", amount: 1 }] } }));
  run("validation : Empocher la première de la main permis", false, refused({ a: { hit: [{ action: "pocket", target: "firstInHand" }] } }));
  run("validation : Polissage de la première de la main refusé", true, refused({ a: { hit: [{ action: "polish", amount: 1, target: "firstInHand" }] } }));
  run("validation : En poche, un moment inconnu refusé", true, refused({ a: { pocketed: { exit: [{ action: "speed", amount: 1 }] } } }));
  run("validation : En poche, Empocher soi-même refusé", true, refused({ a: { pocketed: { entry: [{ action: "pocket" }] } } }));
  run("validation : En poche, Polissage sur soi refusé", true, refused({ a: { pocketed: { resolution: [{ action: "polish", amount: 1 }] } } }));
  run("validation : En poche à chaque résolution, Vitesse ciblée refusée", true, refused({ a: { pocketed: { resolution: [{ action: "speed", amount: 1, target: "apex" }] } } }));
  run(
    "validation : En poche à chaque résolution, Polissage, Fêlure, Empocher et Pioche ciblés permis",
    false,
    refused({
      a: {
        pocketed: {
          resolution: [
            { action: "polish", amount: 1, target: "apex" },
            { action: "crack", amount: 1, target: "apex" },
            { action: "pocket", target: "firstInHand" },
            { action: "draw", amount: 1 },
          ],
        },
      },
    })
  );
  run("validation : En poche n'est pas une liste", true, refused({ a: { pocketed: [{ action: "speed", amount: 1 }] } }));
  run("validation : les moments déclarés sont valides", false, throws(() => validatePocketMoments(MARBLE_POCKET)));
  run("validation : un moment sans texte de fiche refusé", true, throws(() => validatePocketMoments({ ...MARBLE_POCKET, moments: [{ ...MARBLE_POCKET.moments[0], texts: { effect: "x" } }] })));
}

// EN POCHE, À CHAQUE (OCCURRENCE) : les réactions du pot aux valeurs de partie
// écoutables. Tables fabriquées, pour isoler chaque règle.
function checkPocketReactions(run) {
  const reactions = (events) =>
    events.filter((event) => event.type === "effect" && event.trigger === "pocketReaction").map((event) => `${event.potIndex}:${event.marble}`);
  const effects = (events) => events.filter((event) => event.type === "effect").map((event) => `${event.trigger}:${event.marble}`);
  const table = {
    plain: { apex: [{ action: "speed", amount: 1 }] },
    flicker: { flick: [{ action: "speed", amount: 1 }] },
    polisher: { flick: [{ action: "polish", amount: 1, target: "apex" }] },
    drawer: { flick: [{ action: "draw", amount: 3 }] },
    pocketer: { flick: [{ action: "pocket", target: "firstInHand" }] },
    onThrown: { pocketed: { thrownMarbles: [{ action: "speed", amount: 1 }] } },
    onFlick: { pocketed: { flick: [{ action: "speed", amount: 2 }] } },
    onFlickToo: { pocketed: { flick: [{ action: "mass", amount: 1 }] } },
    onPolish: { pocketed: { polish: [{ action: "mass", amount: 1 }] } },
    onDrawn: { pocketed: { drawnMarbles: [{ action: "speed", amount: 1 }] } },
    onExit: { pocketed: { ejectedMarbles: [{ action: "speed", amount: 1 }], triangleExits: [{ action: "mass", amount: 1 }] } },
    onPocketed: { pocketed: { pocketedMarbles: [{ action: "speed", amount: 5 }] } },
    onApex: { pocketed: { apex: [{ action: "speed", amount: 2, target: "leftBase" }] } },
  };
  const made = fabricatedRules(table);
  const place = (state, slot = "apex") => apply(state, { type: "place", handIndex: 0, slot }, made);

  // Les trois catégories : un évènement réel (toute bille lancée), un mot-clé (une
  // Chiquenaude, chez une bille qui en a une), une action (un Polissage).
  run.same("réaction, évènement réel : toute bille lancée", ["0:onThrown"], reactions(place(playState({ hand: inHand(["plain"]), pot: ["onThrown"] })).events));
  run.same("réaction, mot-clé : une Chiquenaude", ["0:onFlick"], reactions(place(playState({ hand: inHand(["flicker"]), pot: ["onFlick"] })).events));
  run.same("réaction, mot-clé : une bille sans Chiquenaude n'en déclenche pas", [], reactions(place(playState({ hand: inHand(["plain"]), pot: ["onFlick"] })).events));
  run.same(
    "réaction, action : un Polissage",
    ["0:onPolish"],
    reactions(place(playState({ hand: inHand(["polisher"]), pot: ["onPolish"], triangle: triangleOf(placed("plain"), null, placed("plain", 1)) }), "leftBase").events)
  );
  const flicked = place(playState({ hand: inHand(["flicker"]), pot: ["onFlick"] }));
  run("réaction : Vitesse aux compteurs du tour (1 + 2)", 3, flicked.state.speed);
  run("réaction : le pot inchangé", "onFlick", flicked.state.pot.join());

  // Une réaction par incrément : trois billes piochées, trois réactions ; un
  // évènement qui augmente deux compteurs écoutés (une éjection est aussi une
  // sortie du triangle) : deux.
  const drawing = place(playState({ hand: inHand(["drawer"]), bag: ["plain", "plain", "plain"], pot: ["onDrawn"] }));
  run.same("réaction : une par incrément (trois billes piochées)", ["0:onDrawn", "0:onDrawn", "0:onDrawn"], reactions(drawing.events));
  const ejecting = place(playState({ hand: inHand(["plain"]), pot: ["onExit"], triangle: triangleOf(null, null, placed("plain")) }));
  run.same("réaction : un évènement, deux compteurs écoutés, deux réactions", ["0:onExit", "0:onExit"], reactions(ejecting.events));
  run("réaction : Vitesse +1 et Masse +1", "1/2", `${ejecting.state.speed}/${ejecting.state.mass}`);

  // L'ordre : l'effet de la bille concernée, puis les billes du pot dans l'ordre
  // d'arrivée ; par la file, avant la suite de l'action (la pose).
  const ordered = place(playState({ hand: inHand(["flicker"]), pot: ["onFlickToo", "onThrown", "onFlick"] }));
  run.same(
    "réaction, ordre : l'effet de la bille, puis le pot dans l'ordre d'arrivée",
    ["flick:flicker", "pocketReaction:onFlickToo", "pocketReaction:onThrown", "pocketReaction:onFlick"],
    effects(ordered.events)
  );
  // Les trois réactions entrent dans la file d'un bloc, après l'effet de la bille ;
  // leurs effets suivent, dans le même ordre, tous avant la pose.
  run.same(
    "réaction, ordre : la réaction suit son évènement, avant la pose",
    ["flick", "effect", "pocketReaction", "pocketReaction", "pocketReaction", "effect", "effect", "effect", "placed"],
    eventTypes(ordered.events)
  );
  run.same(
    "réaction : l'évènement nomme la bille, sa place et le compteur",
    { type: "pocketReaction", index: 2, marble: "onFlick", counter: "flick" },
    ordered.events.find((event) => event.type === "pocketReaction" && event.marble === "onFlick")
  );

  // La bille qui entre ne réagit pas à sa propre mise en poche ; elle réagit aux
  // suivantes.
  const entering = place(playState({ hand: inHand(["pocketer", "onPocketed"]), pot: ["onPocketed"] }));
  run.same("réaction : la bille entrante ne réagit pas à sa propre mise en poche", ["0:onPocketed"], reactions(entering.events));
  const next = place({ ...entering.state, hand: inHand(["pocketer", "plain"]), throwsUsed: 0 });
  run.same("réaction : elle réagit à la suivante", ["0:onPocketed", "1:onPocketed"], reactions(next.events));

  // Règle des cibles : un bonus ciblé sur une phase passée est perdu, noté.
  const late = apply(playState({ pot: ["onApex"], triangle: triangleOf(placed("plain"), null, placed("plain")) }), { type: "resolve" }, made);
  const lateEffect = late.events.find((event) => event.type === "effect" && event.trigger === "pocketReaction");
  run.same("réaction, cible : le bonus d'une phase passée, perdu et noté", [{ slot: "leftBase", reason: "phasePassed", speed: 2, mass: 0 }], lateEffect.lost);

  // Les réactions comptent aux valeurs de partie, sans être écoutables.
  run("réaction : comptée (pocketReaction)", 3, drawing.state.tally.pocketReaction.turn);

  // Validation : une clé écoutable passe ; une quantité réelle, Vitesse et Masse,
  // les réactions elles-mêmes et l'inconnu sont refusés.
  const valid = (pocketed) => !throws(() => validateTable({ x: { pocketed } }));
  const speed1 = [{ action: "speed", amount: 1 }];
  run("validation, réaction : évènement réel accepté", true, valid({ shuffles: speed1 }));
  run("validation, réaction : mot-clé accepté", true, valid({ final: speed1 }));
  run("validation, réaction : moment fixe d'En poche accepté", true, valid({ pocketEntry: speed1 }));
  run("validation, réaction : action acceptée", true, valid({ crack: speed1 }));
  run("validation, réaction : quantité réelle refusée", false, valid({ polishQuantity: speed1 }));
  run("validation, réaction : gains de Vitesse refusés", false, valid({ speedGains: speed1 }));
  run("validation, réaction : total de Masse refusé", false, valid({ massGained: speed1 }));
  run("validation, réaction : réagir aux réactions refusé", false, valid({ pocketReaction: speed1 }));
  run("validation, réaction : clé inconnue refusée", false, valid({ nope: speed1 }));
  run("validation, réaction : sur elle-même refusé", false, valid({ flick: [{ action: "polish", amount: 1 }] }));
  run("validation, réaction : une action ciblée acceptée", true, valid({ flick: [{ action: "polish", amount: 1, target: "apex" }] }));
  run("validation, réaction : le message dit pourquoi", true, /ne s'écoute pas/.test(caughtMessage(() => validateTable({ x: { pocketed: { drawQuantity: speed1 } } }))));

  // Boucle directe : réagir au déclenchement d'une action qu'on produit, refusé.
  run("validation, boucle directe : à chaque polissage, Polissage 1, refusé", false, valid({ polish: [{ action: "polish", amount: 1, target: "apex" }] }));
  run("validation, boucle directe : à chaque pioche, Pioche 1, refusé", false, valid({ draw: [{ action: "draw", amount: 1 }] }));
  run("validation, boucle directe : le message dit la boucle", true, /boucle/.test(caughtMessage(() => validateTable({ x: { pocketed: { crack: [{ action: "crack", amount: 1, target: "apex" }] } } }))));
  run("validation : réagir à une autre action que la sienne, accepté", true, valid({ polish: [{ action: "crack", amount: 1, target: "apex" }] }));

  // Boucle indirecte : deux billes du pot qui se répondent (Fêlure, Polissage), sur
  // une bille qui ne s'use jamais assez. La limite du bus arrête la chaîne, l'action
  // aboutit, le journal le note : une anomalie, que la fumée guette.
  const looping = fabricatedRules({
    ...table,
    sturdy: { maxWear: 100 },
    cracker: { pocketed: { polish: [{ action: "crack", amount: 1, target: "apex" }] } },
    healer: { pocketed: { crack: [{ action: "polish", amount: 1, target: "apex" }] } },
  });
  const loop = looping.reduce(playState({ hand: inHand(["polisher", "plain"]), pot: ["cracker", "healer"], triangle: triangleOf(null, null, placed("sturdy", 50)) }), {
    type: "place",
    handIndex: 0,
    slot: "leftBase",
  });
  run("boucle indirecte : l'action aboutit", true, loop.ok);
  run("boucle indirecte : la chaîne interrompue, notée une fois", 1, loop.events.filter((event) => event.type === "chainInterrupted").length);
  run("boucle indirecte : la pose va à son terme", "polisher", loop.state.triangle.leftBase?.marble);
  run("boucle indirecte : plus rien n'est joué après l'arrêt", false, loop.events.slice(loop.events.findIndex((event) => event.type === "chainInterrupted")).some((event) => event.type === "effect"));
  const resolved = looping.reduce(loop.state, { type: "resolve" });
  run("boucle indirecte : la partie continue", true, resolved.ok);
}

function caughtMessage(fn) {
  try {
    fn();
  } catch (error) {
    return error.message;
  }
  return "";
}

// CIBLES AU CHOIX : choix simple et multiple, modes, éligibilité, suspension et
// reprise par rejeu, refus pendant l'attente, sérialisation, validation. Billes
// fabriquées pour isoler chaque règle, puis les billes de test.
function checkChoices(run) {
  const choose = (zones, extra = {}) => ({ type: "choice", zones, pick: "marble", count: 1, ...extra });
  const table = {
    plain: { apex: [{ action: "speed", amount: 1 }] },
    sturdy: { maxWear: 9 },
    // Tic : Polissage 1 à 2 billes actives au choix, obligatoire.
    twoPolish: { hit: [{ action: "polish", amount: 1, target: choose(["triangle"], { count: 2 }) }] },
    // Tic : Polissage 1 à 3 billes actives au choix (jamais assez de cibles ici).
    threePolish: { hit: [{ action: "polish", amount: 1, target: choose(["triangle"], { count: 3 }) }] },
    // Tic : Polissage 1 à jusqu'à 2 billes actives au choix.
    upToPolish: { hit: [{ action: "polish", amount: 1, target: choose(["triangle"], { count: 2, upTo: true }) }] },
    // Tic : Empocher une bille, de la main ou active, au choix.
    anyPocket: { hit: [{ action: "pocket", target: choose(["hand", "triangle"]) }] },
    // Base : Vitesse +2 à une bille active au choix (un bonus de phase).
    booster: { base: [{ action: "speed", amount: 2, target: choose(["triangle"]) }] },
    // Final : Polissage 1 à une bille active au choix, et la même, cible fixe.
    finalChooser: { maxWear: 1, final: [{ action: "polish", amount: 1, target: choose(["triangle"]) }] },
    finalFixed: { maxWear: 1, final: [{ action: "polish", amount: 1, target: "rightBase" }] },
    // En poche, à chaque chiquenaude : Fêlure 1 au choix, et la même, cible fixe.
    potChooser: { pocketed: { flick: [{ action: "crack", amount: 1, target: choose(["triangle"]) }] } },
    potFixed: { pocketed: { flick: [{ action: "crack", amount: 1, target: "leftBase" }] } },
    flicker: { flick: [{ action: "speed", amount: 1 }] },
  };
  const made = fabricatedRules(table);
  const reduce = (state, action) => made.reduce(state, action);
  const answer = (state, slot) => reduce(state, { type: "choose", target: { zone: "triangle", slot } });
  const slots = (pending) => pending.eligible.map((target) => target.slot ?? `main${target.index}`);
  const types = (events) => events.map((event) => event.type);

  // Choix multiple obligatoire : une cible choisie n'est plus éligible ; l'action
  // s'applique ensuite, dans l'ordre des choix ; arrêt à N.
  const triple = playState({ hand: inHand(["twoPolish"]), triangle: triangleOf(placed("sturdy", 3), placed("sturdy", 3), placed("plain")) });
  const opened = reduce(triple, { type: "place", handIndex: 0, slot: "apex" });
  run("choix : la pose s'arrête sur le choix", true, opened.ok && opened.state.pendingChoice !== null);
  run.same("choix : les billes actives, la posée comprise", ["leftBase", "rightBase", "apex"], slots(opened.state.pendingChoice));
  run.same(
    "choix : la question en attente",
    { action: "polish", amount: 1, zones: ["triangle"], pick: "marble", count: 2, upTo: false, remaining: 2, chosen: [] },
    (({ action, amount, zones, pick, count, upTo, remaining, chosen }) => ({ action, amount, zones, pick, count, upTo, remaining, chosen }))(opened.state.pendingChoice)
  );
  run("choix : le journal s'arrête au choix ouvert", "choice", opened.events.at(-1).type);
  const first = answer(opened.state, "rightBase");
  run.same("choix : la cible choisie n'est plus éligible", ["leftBase", "apex"], slots(first.state.pendingChoice));
  run("choix : encore une", 1, first.state.pendingChoice.remaining);
  run.same("choix : chaque réponse rend la suite du journal seulement", ["chosen"], types(first.events));
  const second = answer(first.state, "leftBase");
  run("choix : fini à N choix, plus rien n'attend", null, second.state.pendingChoice);
  run.same(
    "choix : appliqué dans l'ordre des choix",
    ["rightBase", "leftBase"],
    second.events.filter((event) => event.type === "polished").map((event) => event.slot)
  );
  run.same("choix : la fin de la sélection notée", { reason: "count", chosen: 2 }, (({ reason, chosen }) => ({ reason, chosen }))(second.events.find((event) => event.type === "choiceEnded")));
  run("choix : les lancers comptés une seule fois", 1, second.state.throwsUsed);

  // Pas assez de cibles : arrêt quand plus rien n'est éligible.
  const few = reduce(playState({ hand: inHand(["threePolish"]), triangle: triangleOf(placed("sturdy", 3), null, placed("plain")) }), { type: "place", handIndex: 0, slot: "apex" });
  const fewDone = answer(answer(few.state, "leftBase").state, "apex");
  run("choix, pas assez de cibles : arrêt quand plus rien n'est éligible", null, fewDone.state.pendingChoice);
  run("choix, pas assez de cibles : noté", "exhausted", fewDone.events.find((event) => event.type === "choiceEnded").reason);

  // Aucune cible dès le départ : rien ne s'ouvre, le journal le note.
  const none = reduce(playState({ hand: inHand(["anyPocket"]), triangle: triangleOf(null, null, placed("plain")) }), { type: "place", handIndex: 0, slot: "apex" });
  run("choix, aucune cible… : la posée elle-même est éligible", true, none.state.pendingChoice !== null);
  const empty = reduce(playState({ hand: inHand(["finalChooser"]), bag: ["plain"], triangle: triangleOf(null, null, placed("finalChooser")) }), { type: "resolve" });
  run("choix, aucune cible : aucune attente", null, empty.state.pendingChoice);
  run("choix, aucune cible : noté au journal", true, empty.events.some((event) => event.type === "targetEmpty" && event.target === "choice"));
  run("choix, aucune cible : aucun choix ouvert", false, empty.events.some((event) => event.type === "choice"));

  // « Jusqu'à N » : Terminer, à zéro choix ou après un ; refusé en mode obligatoire.
  const upTo = reduce(playState({ hand: inHand(["upToPolish"]), triangle: triangleOf(placed("sturdy", 3), null, placed("plain")) }), { type: "place", handIndex: 0, slot: "apex" });
  const zero = reduce(upTo.state, { type: "choose", done: true });
  run("jusqu'à N : Terminer à zéro choix", null, zero.state.pendingChoice);
  run("jusqu'à N : rien poli", false, zero.events.some((event) => event.type === "polished"));
  run("jusqu'à N : terminé, noté", "done", zero.events.find((event) => event.type === "choiceEnded").reason);
  const one = reduce(answer(upTo.state, "leftBase").state, { type: "choose", done: true });
  run.same("jusqu'à N : Terminer après un choix", ["leftBase"], one.events.filter((event) => event.type === "polished").map((event) => event.slot));
  run("obligatoire : Terminer refusé", "choiceRequired", reduce(opened.state, { type: "choose", done: true }).error);
  run.same("jusqu'à N : Terminer parmi les actions légales", { type: "choose", done: true }, legalActions(upTo.state).at(-1));
  run.same("obligatoire : seulement les cibles", ["choose", "choose", "choose"], legalActions(opened.state).map((action) => action.type));

  // Pendant l'attente : toute autre action refusée ; une cible non éligible refusée ;
  // « choisir » sans choix en attente refusé.
  for (const action of [{ type: "resolve" }, { type: "draw" }, { type: "place", handIndex: 0, slot: "leftBase" }, { type: "swap", a: "leftBase", b: "apex" }]) {
    run(`attente : ${action.type} refusé`, "choicePending", reduce(first.state, action).error);
  }
  run("attente : une cible déjà choisie refusée", "invalidChoice", answer(first.state, "rightBase").error);
  run("attente : une zone hors du choix refusée", "invalidChoice", reduce(first.state, { type: "choose", target: { zone: "hand", index: 0 } }).error);
  run("hors attente : choisir refusé", "noChoicePending", reduce(triple, { type: "choose", done: true }).error);

  // La main et le triangle : la bille de la main, par sa place.
  const both = reduce(playState({ hand: inHand(["anyPocket", "plain", "sturdy"]), triangle: triangleOf(null, null, placed("plain")) }), { type: "place", handIndex: 0, slot: "apex" });
  run.same("main et triangle : les billes de la main puis les actives", ["main0", "main1", "apex"], slots(both.state.pendingChoice));
  const fromHand = reduce(both.state, { type: "choose", target: { zone: "hand", index: 1 } });
  run.same("main : la bille choisie au pot, l'autre reste", { pot: ["sturdy"], hand: ["plain"] }, { pot: fromHand.state.pot, hand: handIds(fromHand.state) });

  // Règle des cibles : un bonus ne va qu'à une phase à venir. En base gauche, pendant
  // la résolution : la base gauche (en cours) n'est pas éligible.
  const boosting = reduce(playState({ triangle: triangleOf(placed("booster"), placed("plain"), placed("plain")) }), { type: "resolve" });
  run.same("éligibilité : un bonus, seulement les phases à venir", ["rightBase", "apex"], slots(boosting.state.pendingChoice));
  const boosted = answer(boosting.state, "apex");
  // La pointe ordinaire : Vitesse +1, plus le bonus de 2 ; la base droite ne produit rien.
  run("éligibilité : le bonus compté à la phase choisie", 1 + 2, boosted.events.find((event) => event.type === "impact").speed);

  // Reprise exacte : un choix équivaut à la même cible fixe. Au milieu d'une
  // résolution (un Final), puis dans une réaction du pot (pendant la pose).
  // Les évènements du choix à part, et la clause imprimée (au choix ou fixe) mise de
  // côté : tout le reste doit être identique.
  const withoutChoice = (events) =>
    events.filter((event) => !["choice", "chosen", "choiceEnded"].includes(event.type)).map(({ operations, ...event }) => event);
  const strip = (events) => JSON.stringify(withoutChoice(events)).replaceAll("finalChooser", "X").replaceAll("finalFixed", "X").replaceAll("potChooser", "X").replaceAll("potFixed", "X");
  const resolving = (marble) => playState({ bag: ["plain"], triangle: triangleOf(placed("plain"), placed("sturdy", 3), placed(marble)) });
  const suspended = reduce(resolving("finalChooser"), { type: "resolve" });
  run("reprise, résolution : suspendue au Final", "final", suspended.state.pendingChoice.by.trigger);
  run("reprise, résolution : l'Impact n'a pas encore eu lieu", false, suspended.events.some((event) => event.type === "impact"));
  const resumed = answer(suspended.state, "rightBase");
  const fixed = reduce(resolving("finalFixed"), { type: "resolve" });
  run("reprise, résolution : même journal qu'une cible fixe", strip(fixed.events), strip([...suspended.events, ...resumed.events]));
  run("reprise, résolution : même état qu'une cible fixe", JSON.stringify(fixed.state).replaceAll("finalFixed", "X"), JSON.stringify(resumed.state).replaceAll("finalChooser", "X"));
  const reacting = (marble) => playState({ hand: inHand(["flicker"]), pot: [marble], triangle: triangleOf(placed("sturdy"), null, null) });
  const inPot = reduce(reacting("potChooser"), { type: "place", handIndex: 0, slot: "apex" });
  run("reprise, réaction du pot : suspendue à la réaction", "pocketReaction", inPot.state.pendingChoice.by.trigger);
  run("reprise, réaction du pot : la bille lancée pas encore posée", false, inPot.events.some((event) => event.type === "placed"));
  const potResumed = answer(inPot.state, "leftBase");
  const potFixed = reduce(reacting("potFixed"), { type: "place", handIndex: 0, slot: "apex" });
  run("reprise, réaction du pot : même journal qu'une cible fixe", strip(potFixed.events), strip([...inPot.events, ...potResumed.events]));

  // Sérialisable : un aller-retour JSON de l'état en attente ne change rien.
  const roundTrip = JSON.parse(JSON.stringify(first.state));
  run.same("sérialisation : l'état en attente fait l'aller-retour", first.state, roundTrip);
  run.same("sérialisation : la reprise depuis la copie est la même", answer(first.state, "leftBase"), answer(roundTrip, "leftBase"));
  const frozen = deepFreeze(structuredClone(first.state));
  run("pureté : l'état en attente reçu n'est pas modifié", true, answer(frozen, "leftBase").ok);

  // Les billes de test : le gorille (main), le verre (triangle), la porcelaine
  // (jusqu'à 2, pendant la résolution).
  const gorilla = rules.reduce(playState({ hand: inHand(["gorilla", "clay", "agate"]), triangle: triangleOf(null, null, placed("clay")) }), { type: "place", handIndex: 0, slot: "apex" });
  run.same("gorille : les billes de la main", ["clay", "agate"], gorilla.state.pendingChoice.eligible.map((target) => target.marble));
  const pocketedAgate = rules.reduce(gorilla.state, { type: "choose", target: { zone: "hand", index: 1 } });
  run.same("gorille : l'agate choisie au pot", ["agate"], pocketedAgate.state.pot);
  const porcelain = rules.reduce(playState({ bag: ["clay"], triangle: triangleOf(placed("clay"), placed("agate", 1), placed("porcelain", 1)) }), { type: "resolve" });
  run.same("porcelaine : son Final, jusqu'à 2 billes actives", { upTo: true, count: 2, trigger: "final" }, { upTo: porcelain.state.pendingChoice.upTo, count: porcelain.state.pendingChoice.count, trigger: porcelain.state.pendingChoice.by.trigger });

  // Validation : les combinaisons impossibles refusées au chargement.
  const valid = (clause, field = "hit") => !throws(() => validateTable({ x: { [field]: [clause] } }));
  run("validation, choix : Polissage au choix sur le triangle permis", true, valid({ action: "polish", amount: 1, target: choose(["triangle"]) }));
  run("validation, choix : Empocher dans la main permis", true, valid({ action: "pocket", target: choose(["hand"]) }));
  run("validation, choix : Polissage dans la main refusé", false, valid({ action: "polish", amount: 1, target: choose(["hand"]) }));
  run("validation, choix : le pot pas encore disponible", false, valid({ action: "pocket", target: choose(["pot"]) }));
  run("validation, choix : zone inconnue refusée", false, valid({ action: "pocket", target: choose(["nowhere"]) }));
  run("validation, choix : un emplacement vide n'a rien à polir", false, valid({ action: "polish", amount: 1, target: choose(["triangle"], { pick: "slot" }) }));
  run("validation, choix : nombre nul refusé", false, valid({ action: "polish", amount: 1, target: choose(["triangle"], { count: 0 }) }));
  run("validation, choix : champ inconnu refusé", false, valid({ action: "polish", amount: 1, target: choose(["triangle"], { extra: 1 }) }));
  run("validation, choix : la Pioche ne se choisit pas", false, valid({ action: "draw", amount: 1, target: choose(["triangle"]) }));
  run("validation, choix : bonus au choix pendant la pose permis", true, valid({ action: "speed", amount: 1, target: choose(["triangle"]) }));
  run("validation, choix : bonus au choix au Final refusé (plus aucune phase)", false, valid({ action: "speed", amount: 1, target: choose(["triangle"]) }, "final"));
  run("validation, choix : bonus au choix en pointe refusé (plus aucune phase après)", false, valid({ action: "speed", amount: 1, target: choose(["triangle"]) }, "apex"));
  run("validation, choix : bonus au choix en base permis (la pointe vient après)", true, valid({ action: "speed", amount: 1, target: choose(["triangle"]) }, "base"));
}

// ÉJECTER : chaque forme de cible, l'ordre (Éjection, retrait, défausse), ni Tic ni
// Final, la phase sautée, la référence des conditions de calibre, les compteurs et
// les réactions du pot, la plombée qui vide l'emplacement visé.
function checkEject(run) {
  const journal = (events) =>
    events.map((event) => {
      if (event.type === "effect") return `effect:${event.trigger}:${event.marble}`;
      if (event.type === "removed" || event.type === "discarded") return `${event.type}:${event.marble}:${event.cause}`;
      if (event.type === "targetEmpty") return `targetEmpty:${event.action}:${event.target ?? event.slot}`;
      return event.marble === undefined ? event.type : `${event.type}:${event.marble}`;
    });
  const table = {
    plain: { apex: [{ action: "speed", amount: 1 }], base: [{ action: "speed", amount: 1 }] },
    small: { size: SMALL, apex: [{ action: "speed", amount: 1 }] },
    smallKnock: { size: SMALL, knockout: [{ action: "speed", amount: 2 }] },
    large: { size: LARGE },
    // Éjection : Vitesse +5 si la bille « posée » (ici, celle qui éjecte) est plus grosse.
    sizeKnock: { size: MEDIUM, knockout: [{ action: "speed", amount: 5, when: { type: "relativeSize", marble: "placed", is: "larger" } }] },
    // Base : s'éjecter elle-même.
    selfEjector: { base: [{ action: "eject" }] },
    // Tic : Éjecter la pointe ; et toutes les minibilles actives ; et toutes.
    apexEjector: { hit: [{ action: "eject", target: "apex" }] },
    smallEjector: { size: LARGE, hit: [{ action: "eject", target: { type: "all", filters: [{ type: "size", size: SMALL }] } }] },
    allEjector: { base: [{ action: "eject", target: { type: "all" } }] },
    chooserEjector: { hit: [{ action: "eject", target: { type: "choice", zones: ["triangle"], pick: "marble", count: 2 } }] },
    // Base gauche : Éjecter la pointe, avant sa phase.
    earlyEjector: { base: [{ action: "eject", target: "apex" }] },
    wornOut: { maxWear: 1, apex: [{ action: "speed", amount: 1 }], final: [{ action: "speed", amount: 9 }] },
    // Son Éjection l'éjecterait à nouveau : sans effet, pas de boucle.
    loopKnock: { knockout: [{ action: "eject" }] },
    onEjected: { pocketed: { ejectedMarbles: [{ action: "mass", amount: 1 }] } },
  };
  const made = fabricatedRules(table);
  const go = (state, action) => apply(state, action, made);
  const toApex = { type: "place", handIndex: 0, slot: "apex" };
  const toLeft = { type: "place", handIndex: 0, slot: "leftBase" };

  // Un emplacement : l'Éjection de la visée, son retrait, sa défausse ; ni Tic ni Final.
  const fixed = go(playState({ hand: inHand(["apexEjector"]), triangle: triangleOf(placed("plain"), null, placed("smallKnock")) }), toLeft);
  run.same(
    "éjecter, emplacement : Éjection, retrait, défausse",
    ["eject:smallKnock", "knockout:smallKnock", "effect:knockout:smallKnock", "removed:smallKnock:eject", "discarded:smallKnock:eject"],
    journal(fixed.events).slice(journal(fixed.events).indexOf("eject:smallKnock"))
  );
  run("éjecter : la pointe vidée", null, fixed.state.triangle.apex);
  run("éjecter : la bille à la défausse", "plain,smallKnock", fixed.state.discard.join());
  run("éjecter : ni Final ni Tic de plus", 1, fixed.events.filter((event) => event.type === "hit").length);
  run("éjecter : pas de Final", false, fixed.events.some((event) => event.type === "final"));
  run("éjecter : son Éjection compte au tour (Vitesse +2)", 2, fixed.state.speed);
  run.same("éjecter : l'Éjection provoquée porte l'éjection", { trigger: "hit", slot: "leftBase", marble: "apexEjector" }, fixed.events.find((event) => event.trigger === "knockout").ejectedBy);

  // La bille elle-même, sur le triangle ; refusée hors du triangle.
  const self = go(playState({ bag: ["plain"], triangle: triangleOf(placed("selfEjector"), null, placed("plain")) }), { type: "resolve" });
  run("éjecter soi-même : quitte le triangle pendant sa phase", true, self.events.some((event) => event.type === "removed" && event.marble === "selfEjector" && event.cause === "eject"));
  const refused = (field, clause = { action: "eject" }) => throws(() => validateTable({ x: { [field]: [clause] } }));
  run("validation, éjecter soi-même : dans une Chiquenaude refusé", true, refused("flick"));
  run("validation, éjecter soi-même : dans un Final refusé", true, refused("final"));
  run("validation, éjecter soi-même : à l'Éveil refusé", true, refused("awaken"));
  run("validation, éjecter soi-même : en poche refusé", true, throws(() => validateTable({ x: { pocketed: { entry: [{ action: "eject" }] } } })));
  run("validation, éjecter soi-même : au Tic permis", false, refused("hit"));
  run("validation, éjecter : un montant refusé", true, refused("hit", { action: "eject", amount: 1, target: "apex" }));
  run("validation, éjecter : au choix dans la main refusé", true, refused("hit", { action: "eject", target: { type: "choice", zones: ["hand"], pick: "marble", count: 1 } }));
  run("validation, « toutes » : un filtre inconnu refusé", true, refused("hit", { action: "eject", target: { type: "all", filters: [{ type: "matter", matter: "glass" }] } }));
  run("validation, « toutes » : un calibre inconnu refusé", true, refused("hit", { action: "eject", target: { type: "all", filters: [{ type: "size", size: 9 }] } }));
  run("validation, « toutes » : deux filtres de calibre refusés", true, refused("hit", { action: "eject", target: { type: "all", filters: [{ type: "size", size: SMALL }, { type: "size", size: LARGE }] } }));
  run("validation, « toutes » : pour une autre action refusé", true, refused("hit", { action: "polish", amount: 1, target: { type: "all" } }));
  run("validation, « toutes » : sans filtre permis", false, refused("hit", { action: "eject", target: { type: "all" } }));

  // Toutes les minibilles actives : dans l'ordre des phases, seulement elles.
  const smalls = go(
    playState({ hand: inHand(["smallEjector"]), triangle: triangleOf(placed("small"), placed("plain"), placed("smallKnock")) }),
    { type: "place", handIndex: 0, slot: "rightBase" }
  );
  run.same("éjecter toutes les minibilles : dans l'ordre des phases", ["small", "smallKnock"], smalls.events.filter((event) => event.type === "eject").map((event) => event.marble));
  run.same("éjecter toutes les minibilles : la bille normale reste", "smallEjector", smalls.state.triangle.rightBase.marble);
  // Toutes : la bille elle-même comprise, sur le triangle.
  const everyone = go(playState({ bag: ["plain"], triangle: triangleOf(placed("allEjector"), placed("plain"), placed("plain")) }), { type: "resolve" });
  run.same("éjecter toutes : chaque bille active, elle comprise, dans l'ordre des phases", ["leftBase", "rightBase", "apex"], everyone.events.filter((event) => event.type === "eject").map((event) => event.slot));
  // Aucune bille visée : sans effet, noté.
  const noneSmall = go(playState({ hand: inHand(["smallEjector"]), triangle: triangleOf(placed("plain"), null, placed("plain")) }), toApex);
  run("éjecter toutes les minibilles : aucune, noté", true, journal(noneSmall.events).includes("targetEmpty:eject:all"));

  // Au choix : dans l'ordre de sélection.
  const choosing = go(playState({ hand: inHand(["chooserEjector"]), triangle: triangleOf(placed("plain"), placed("small"), placed("plain")) }), toApex);
  const first = made.reduce(choosing.state, { type: "choose", target: { zone: "triangle", slot: "rightBase" } });
  const second = made.reduce(first.state, { type: "choose", target: { zone: "triangle", slot: "leftBase" } });
  run.same("éjecter au choix : dans l'ordre de sélection", ["rightBase", "leftBase"], second.events.filter((event) => event.type === "eject").map((event) => event.slot));

  // Cible vide.
  const empty = go(playState({ hand: inHand(["apexEjector"]), triangle: triangleOf(placed("plain"), null, null) }), toLeft);
  run("éjecter, emplacement vide : noté", true, journal(empty.events).includes("targetEmpty:eject:apex"));

  // Avant sa phase : la phase sautée, la bille dite retirée avant.
  const early = go(playState({ bag: ["plain"], triangle: triangleOf(placed("earlyEjector"), null, placed("wornOut")) }), { type: "resolve" });
  run.same("éjecter avant la phase : phase sautée", { type: "phaseSkipped", slot: "apex" }, early.events.find((event) => event.type === "phaseSkipped" && event.slot === "apex"));
  run("éjecter : pas de Final, même à l'usure maximale", false, early.events.some((event) => event.type === "final"));

  // La comparaison de calibre : la bille qui éjecte est la référence (« posée »).
  const bigger = go(playState({ hand: inHand(["smallEjector"]), triangle: triangleOf(placed("sizeKnock"), null, null) }), toApex);
  run("calibre : plus petite que la grosse qui l'éjecte… (pas de minibille visée)", 0, bigger.state.speed);
  const sizeTable = fabricatedRules({ ...table, bigEjector: { size: LARGE, hit: [{ action: "eject", target: "leftBase" }] }, smallEjectorFixed: { size: SMALL, hit: [{ action: "eject", target: "leftBase" }] } });
  const byBig = apply(playState({ hand: inHand(["bigEjector"]), triangle: triangleOf(placed("sizeKnock"), null, placed("plain")) }), toApex, sizeTable);
  run("calibre : éjectée par un calot, la condition « plus grosse » vaut", 5, byBig.events.find((event) => event.trigger === "knockout").speedDelta);
  const bySmall = apply(playState({ hand: inHand(["smallEjectorFixed"]), triangle: triangleOf(placed("sizeKnock"), null, placed("plain")) }), toApex, sizeTable);
  run("calibre : éjectée par une minibille, elle ne vaut pas", 0, bySmall.events.find((event) => event.trigger === "knockout").speedDelta);

  // Une Éjection qui éjecterait sa propre bille : sans effet, pas de boucle.
  const loop = go(playState({ hand: inHand(["apexEjector"]), triangle: triangleOf(placed("plain"), null, placed("loopKnock")) }), toLeft);
  run("éjecter : une Éjection qui s'éjecte elle-même, sans boucle", false, loop.events.some((event) => event.type === "chainInterrupted"));
  run("éjecter : elle part une seule fois", 1, loop.events.filter((event) => event.type === "removed" && event.marble === "loopKnock").length);

  // Compteurs : billes éjectées, sorties du triangle, Éjection seulement avec l'effet,
  // Éjecter et sa quantité réelle ; la réaction du pot « à chaque bille éjectée ».
  const counted = go(
    playState({ hand: inHand(["smallEjector"]), pot: ["onEjected"], triangle: triangleOf(placed("small"), placed("large"), placed("smallKnock")) }),
    { type: "place", handIndex: 0, slot: "rightBase" }
  );
  const tally = (id) => counted.state.tally[id].turn;
  // La pose chasse le calot de la base droite (1), Éjecter les deux minibilles (2).
  run.same(
    "compteurs : éjectées (pose et Éjecter), sorties, Éjection (une seule a l'effet), Éjecter, quantité",
    { ejectedMarbles: 3, triangleExits: 3, knockout: 1, eject: 2, ejectQuantity: 2 },
    { ejectedMarbles: tally("ejectedMarbles"), triangleExits: tally("triangleExits"), knockout: tally("knockout"), eject: tally("eject"), ejectQuantity: tally("ejectQuantity") }
  );
  run("compteurs : la réaction du pot à chaque bille éjectée, pose comprise", 3, counted.events.filter((event) => event.type === "pocketReaction").length);
  run("compteurs : cible vide, un déclenchement, aucune bille", "1/0", `${noneSmall.state.tally.eject.turn}/${noneSmall.state.tally.ejectQuantity.turn}`);

  // La plombée : posée en pointe sur une bille, sa Chiquenaude l'éjecte ; la pose se
  // poursuit comme sur un emplacement vide, ni Éjection par la pose ni Tic.
  const leaded = apply(playState({ hand: inHand(["leaded"]), triangle: triangleOf(null, null, placed("magnifier")) }), toApex);
  run.same(
    "plombée : sa Chiquenaude éjecte la pointe, puis la pose sur l'emplacement vidé",
    ["flick:leaded", "effect:flick:leaded", "eject:magnifier", "knockout:magnifier", "effect:knockout:magnifier", "removed:magnifier:eject", "discarded:magnifier:eject", "placed:leaded"],
    journal(leaded.events)
  );
  run("plombée : ni Tic", false, leaded.events.some((event) => event.type === "hit"));
  run("plombée : l'Éjection de la loupe compte (Vitesse +3)", 3, leaded.state.speed);
  // La géante : son Final éjecte toutes les minibilles actives, la loupe y joue son Éjection.
  const giant = apply(playState({ bag: ["clay"], triangle: triangleOf(placed("magnifier"), placed("clay"), placed("giant")) }), { type: "resolve" });
  run.same("géante : son Final éjecte la loupe, seule minibille", ["magnifier"], giant.events.filter((event) => event.type === "eject").map((event) => event.marble));
  run("géante : la loupe joue son Éjection", true, giant.events.some((event) => event.trigger === "knockout" && event.marble === "magnifier" && event.speedDelta === 3));
}

function checkSwap(run) {
  const clay = placed("clay", 1);
  const glass = placed("glass", 2);

  const both = apply(playState({ triangle: triangleOf(clay, glass, null) }), { type: "swap", a: "leftBase", b: "rightBase" });
  run.same("échange : contenu interverti, usure gardée", triangleOf(glass, clay, null), both.state.triangle);
  run.same("échange : ni Tic ni Éjection", ["swapped"], eventTypes(both.events));

  const move = apply(playState({ triangle: triangleOf(clay, null, null) }), { type: "swap", a: "leftBase", b: "apex" });
  run.same("échange avec un vide : déplacement, usure gardée", triangleOf(null, null, clay), move.state.triangle);

  const moveBack = apply(playState({ triangle: triangleOf(null, null, clay) }), { type: "swap", a: "leftBase", b: "apex" });
  run.same("échange depuis un vide : même déplacement", triangleOf(clay, null, null), moveBack.state.triangle);

  run("échange : une seule fois par tour", "swapAlreadyUsed", rules.reduce(both.state, { type: "swap", a: "leftBase", b: "apex" }).error);
  run("échange : deux vides refusés", "swapBothEmpty", rules.reduce(playState({ triangle: triangleOf(clay, null, null) }), { type: "swap", a: "rightBase", b: "apex" }).error);
  run("échange : même emplacement refusé", "swapSameSlot", rules.reduce(playState({ triangle: triangleOf(clay, null, null) }), { type: "swap", a: "leftBase", b: "leftBase" }).error);
  run("échange : emplacement inconnu refusé", "invalidSlot", rules.reduce(playState(), { type: "swap", a: "leftBase", b: "top" }).error);

  // Un refus ne consomme rien : l'état rendu est l'état reçu.
  const state = playState({ triangle: triangleOf(clay, null, null) });
  run("refus : état inchangé", state, rules.reduce(state, { type: "swap", a: "rightBase", b: "apex" }).state);
  run.same("refus : journal vide", [], rules.reduce(state, { type: "swap", a: "rightBase", b: "apex" }).events);

  // L'ordre du tour : l'échange vient avant la pose.
  const afterPlace = apply(playState({ hand: inHand(["agate"]), triangle: triangleOf(clay, null, null) }), { type: "place", handIndex: 0, slot: "apex" });
  run("échange : refusé après une pose", "swapAfterPlacement", rules.reduce(afterPlace.state, { type: "swap", a: "leftBase", b: "apex" }).error);
  run("swapRefusal : disponible", null, swapRefusal(playState()));
  run("swapRefusal : même code que l'action", "swapAfterPlacement", swapRefusal(afterPlace.state));

  // L'échange revient au tour suivant.
  const nextTurn = apply({ ...both.state, stage: "draw", hand: inHand([]), bag: ["agate", "mica", "tiger", "sulphide", "stoneware"] }, { type: "draw" });
  run("échange : rendu par la pioche du tour suivant", null, swapRefusal(nextTurn.state));
  const placeThenDraw = apply({ ...afterPlace.state, stage: "draw", hand: inHand([]), bag: ["mica", "tiger", "sulphide", "stoneware", "gorilla"] }, { type: "draw" });
  run("pose : l'échange revient au tour suivant", null, swapRefusal(placeThenDraw.state));
}

// Les LANCERS : une pose depuis la main en est un, l'échange non ; la limite du
// tour borne ce que le joueur peut enchaîner.
function checkThrows(run) {
  run("lancers : 5 par tour, réglage du jeu", 5, MARBLES_SETTINGS.throwsPerTurn);
  run("lancers : une partie neuve n'en a joué aucun", 0, rules.createGame(1).throwsUsed);
  run("lancers : la limite vient du réglage", 5, rules.createGame(1).throwsPerTurn);
  run("lancers : un seul permis (plus de poses obligatoires au premier tour)", 1, rules.createGame(1, { throwsPerTurn: 1 }).throwsPerTurn);
  run("lancers : zéro refusé", true, throws(() => rules.createGame(1, { throwsPerTurn: 0 })));

  // Cinq poses, puis plus rien. Le sac de la main : six billes pour en avoir une de trop.
  let state = playState({ hand: inHand(["clay", "glass", "agate", "mica", "tiger"]), maxHandSize: 6, throwsPerTurn: 5 });
  state = { ...state, hand: [...state.hand, ...inHand(["giant"])] };
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
  const swapped = apply(playState({ hand: inHand(["clay"]), triangle: triangleOf(placed("glass"), null, null) }), { type: "swap", a: "leftBase", b: "apex" });
  run("lancers : l'échange n'en compte pas", 0, swapped.state.throwsUsed);

  // Remis à zéro à la pioche du tour.
  const next = apply({ ...state, stage: "draw", bag: ["clay"] }, { type: "draw" });
  run("lancers : remis à zéro à la pioche", 0, next.state.throwsUsed);

  // Au premier tour, plus aucune protection : le joueur peut dépenser ses lancers
  // en remplacements, quitte à laisser des emplacements vides.
  const firstTurn = playState({ turn: 1, hand: inHand(["clay", "glass", "agate", "mica"]), throwsUsed: 3, triangle: triangleOf(placed("tiger"), null, null) });
  run("premier tour : 2 lancers pour 2 vides, remplacer reste permis", null, placeRefusal(firstTurn, 0, "leftBase"));
  // Le Tic du verre fait choisir sa cible : la première répond.
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
  run.same("imprimé : la Pioche se lit comme une autre valeur", 1, printedStat(rules.effectAt("mica", "leftBase"), "draw"));

  // Tic qui pioche : l'effet, puis la bille. Elle se joue dans le même tour.
  const hit = apply(
    playState({ hand: inHand(["cats_eye"]), bag: ["sulphide", "agate"], triangle: triangleOf(null, null, placed("glass")) }),
    { type: "place", handIndex: 0, slot: "apex" }
  );
  run.same("tic qui pioche : journal", ["flick", "knockout", "removed", "discarded", "placed", "hit", "effect", "draw", "awaken"], eventTypes(hit.events));
  run("tic qui pioche : l'effet dit sa Pioche", 1, hit.events[6].draw);
  run("tic qui pioche : le haut du sac", "sulphide", hit.events[7].marble);
  run("tic qui pioche : en main", "sulphide", handIds(hit.state).join());
  const replay = rules.reduce(hit.state, { type: "place", handIndex: 0, slot: "leftBase" });
  run("tic qui pioche : la bille piochée se joue dans le même tour", true, replay.ok);

  // Éjection qui pioche.
  const knockout = apply(
    playState({ hand: inHand(["clay"]), bag: ["agate"], triangle: triangleOf(null, null, placed("stoneware")) }),
    { type: "place", handIndex: 0, slot: "apex" }
  );
  // L'argile a une Chiquenaude (à 0 tour en main, elle ne produit rien) : son effet passe.
  run.same(
    "éjection qui pioche : journal",
    ["flick", "effect", "knockout", "effect", "draw", "awaken", "removed", "discarded", "placed", "hit", "effect"],
    eventTypes(knockout.events)
  );
  run("éjection qui pioche : en main", "agate", handIds(knockout.state).join());

  // Phase qui pioche : la bille attend le tour suivant (elle est en main à sa pioche).
  const phase = apply(playState({ hand: inHand([]), bag: ["agate", "tiger"], triangle: triangleOf(placed("mica"), null, null) }), { type: "resolve" });
  run.same("phase qui pioche : l'effet puis la bille", ["phase", "effect", "draw", "awaken", "wear"], eventTypes(phase.events).slice(0, 5));
  run("phase qui pioche : la Pioche ne touche ni Vitesse ni Masse", 0, phase.events[1].speedDelta + phase.events[1].massDelta);
  run("phase qui pioche : en main après la résolution", "agate", handIds(phase.state).join());
  run("phase qui pioche : le tour suivant reste à piocher", "draw", phase.state.stage);
  run("phase qui pioche : pas jouable avant la pioche du tour", "mustDraw", placeRefusal(phase.state, 0, "apex"));
  const nextTurn = apply(phase.state, { type: "draw" });
  run("phase qui pioche : jouable au tour suivant", null, placeRefusal(nextTurn.state, 0, "apex"));

  // Régénération pendant la phase de jeu (un Tic) et pendant la résolution.
  const regenPlay = apply(
    playState({ hand: inHand(["cats_eye"]), bag: [], discard: ["agate", "porcelain"], triangle: triangleOf(null, null, placed("glass")) }),
    { type: "place", handIndex: 0, slot: "apex" }
  );
  // La régénération, puis la Trouvaille de chaque bille active (ici l'œil-de-chat, sans
  // ce champ : l'évènement passe, sans effet), puis la pioche reprend.
  run.same("régénération en jeu : dans le journal de la pose", ["hit", "effect", "bagRegenerated", "windfall", "draw", "awaken"], eventTypes(regenPlay.events).slice(-6));
  run("régénération en jeu : la défausse entière, bille remplacée comprise", 3, regenPlay.events.find((event) => event.type === "bagRegenerated").size);
  run("régénération en jeu : la partie continue", "play", regenPlay.state.stage);
  const regenResolve = apply(playState({ hand: inHand([]), bag: [], discard: ["agate"], triangle: triangleOf(placed("mica"), null, null) }), { type: "resolve" });
  run.same("régénération en résolution : dans le journal", ["phase", "effect", "bagRegenerated", "windfall", "draw", "awaken"], eventTypes(regenResolve.events).slice(0, 6));
  run("régénération en résolution : la bille en main", "agate", handIds(regenResolve.state).join());

  // Arrêts : main pleine (pas de régénération), plus de billes (pas de fin de partie).
  const full = apply(
    playState({ hand: inHand(["cats_eye", "clay", "glass", "agate", "tiger"]), bag: [], discard: ["gorilla"], triangle: triangleOf(null, null, placed("sulphide")) }),
    { type: "place", handIndex: 0, slot: "apex" }
  );
  run.same("tic qui pioche, main pleine après la pose : la pioche passe", ["draw", "awaken"], eventTypes(full.events).slice(-2));
  const fuller = { ...playState({ hand: inHand(["cats_eye", "clay", "glass", "agate", "tiger"]), maxHandSize: 4 }) };
  const stopped = apply({ ...fuller, bag: [], discard: ["giant"], triangle: triangleOf(null, null, placed("sulphide")) }, { type: "place", handIndex: 0, slot: "apex" });
  run.same("tic qui pioche, main pleine : arrêt sans régénération", ["effect", "drawSkipped"], eventTypes(stopped.events).slice(-2));
  run("tic qui pioche, main pleine : motif", "handFull", stopped.events.at(-1).reason);
  const none = apply(playState({ hand: inHand(["cats_eye"]), bag: [], discard: [], triangle: triangleOf(null, null, placed("glass")) }), { type: "place", handIndex: 0, slot: "apex" });
  // La bille remplacée vient d'arriver en défausse : elle est repiochée.
  run("tic qui pioche, sac vide : la remplacée revient", "glass", handIds(none.state).join());
  const nothing = apply(playState({ hand: inHand([]), bag: [], discard: [], triangle: triangleOf(placed("mica"), null, null) }), { type: "resolve" });
  run("phase qui pioche, rien à piocher : arrêt annoncé", "noMarbles", nothing.events.find((event) => event.type === "drawSkipped").reason);
  run("phase qui pioche, rien à piocher : jamais une fin de partie en cours de tour", "draw", nothing.state.stage);

  // ANTI-BOUCLE : un Tic qui pioche à chaque pose, avec régénération possible ;
  // les lancers arrêtent le joueur à 5 poses.
  let loop = playState({
    hand: inHand(["cats_eye"]),
    bag: [],
    discard: [],
    triangle: triangleOf(placed("cats_eye"), placed("cats_eye"), placed("cats_eye")),
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

// La liste des déclencheurs, déclarée une fois (config/marbles-values.js).
function checkTriggers(run) {
  run.same(
    "déclencheurs : éveil, chiquenaude, tic, trouvaille, éjection, final, dans l'ordre de la fiche",
    ["awaken", "flick", "hit", "windfall", "knockout", "final"],
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

// Le FINAL : au retrait par usure seulement, la bille déjà à la défausse, avant
// l'Impact, ses valeurs comptant pour le tour.
function checkFinal(run) {
  // Porcelaine (usure 2) en pointe, déjà usée une fois : elle s'use, part, son Final joue.
  const worn = apply(playState({ hand: inHand([]), bag: ["clay"], triangle: triangleOf(null, null, placed("porcelain", 1)) }), { type: "resolve" });
  run.same(
    "final : retrait, défausse, Final (son Polissage au choix sans aucune cible), puis l'Impact",
    ["phase", "effect", "wear", "removed", "discarded", "final", "effect", "targetEmpty", "impact"],
    eventTypes(worn.events).slice(eventTypes(worn.events).indexOf("phase"), eventTypes(worn.events).indexOf("impact") + 1)
  );
  const final = worn.events.filter((event) => event.type === "effect").at(-1);
  run.same("final : son effet", { trigger: "final", slot: "apex", marble: "porcelain", speedDelta: 4, massDelta: 0, draw: 0 }, {
    trigger: final.trigger,
    slot: final.slot,
    marble: final.marble,
    speedDelta: final.speedDelta,
    massDelta: final.massDelta,
    draw: final.draw,
  });
  run("final : la bille est déjà à la défausse", "porcelain", worn.state.discard.join());
  run("final : sa Vitesse compte pour l'Impact du tour (5 de phase + 4)", 9, worn.events.find((event) => event.type === "impact").impact);

  // Tigrée : la Masse du Final compte aussi.
  // La tigrée d'avant Éjecter : sa base donne Vitesse +3, sans choix.
  const tiger = apply(playState({ hand: inHand([]), bag: ["clay"], triangle: triangleOf(placed("tiger", 3), null, null) }), { type: "resolve" }, fixedRules);
  run.same("final : la Masse compte (Vitesse 3, Masse 1 + 1)", { speed: 3, mass: 2, impact: 6 }, (({ speed, mass, impact }) => ({ speed, mass, impact }))(tiger.events.find((event) => event.type === "impact")));

  // Pas usée : pas de Final.
  const fresh = apply(playState({ hand: inHand([]), bag: ["clay"], triangle: triangleOf(null, null, placed("porcelain", 0)) }), { type: "resolve" });
  run("final : pas d'usure maximale, pas de Final", false, eventTypes(fresh.events).includes("final"));

  // Jamais à une éjection, un échange, une pose.
  const knocked = apply(playState({ hand: inHand(["clay"]), bag: ["glass"], triangle: triangleOf(null, null, placed("porcelain", 1)) }), { type: "place", handIndex: 0, slot: "apex" });
  run("final : jamais à une éjection", false, eventTypes(knocked.events).includes("final"));
  const swapped = apply(playState({ hand: inHand([]), triangle: triangleOf(placed("porcelain", 1), null, placed("tiger", 3)) }), { type: "swap", a: "leftBase", b: "apex" });
  run("final : jamais à un échange", false, eventTypes(swapped.events).includes("final"));
  const placedGiant = apply(playState({ hand: inHand(["giant"]), bag: ["glass"] }), { type: "place", handIndex: 0, slot: "apex" });
  run("final : jamais à une pose, même d'une bille d'usure 1", false, eventTypes(placedGiant.events).includes("final"));

  // Plusieurs retraits : dans l'ordre des phases, chacun avec son Final.
  const both = apply(playState({ hand: inHand([]), bag: ["clay"], triangle: triangleOf(placed("tiger", 3), null, placed("porcelain", 1)) }), { type: "resolve" }, fixedRules);
  run.same(
    "final : dans l'ordre des phases",
    ["tiger", "porcelain"],
    both.events.filter((event) => event.type === "effect" && event.trigger === "final").map((event) => event.marble)
  );

  // Géante : son Final pioche par la pioche unifiée ; la bille attend le tour suivant.
  const giant = apply(playState({ hand: inHand([]), bag: ["agate"], triangle: triangleOf(null, null, placed("giant")) }), { type: "resolve" });
  run.same("final, pioche : l'effet, puis la bille, avant l'Impact", ["final", "effect", "draw", "impact"], eventTypes(giant.events).filter((type) => ["final", "effect", "draw", "impact"].includes(type)).slice(-4));
  run("final, pioche : en main", "agate", handIds(giant.state).join());
  run("final, pioche : pas jouable avant la pioche du tour", "mustDraw", placeRefusal(giant.state, 0, "apex"));
  run("final, pioche : jouable au tour suivant", null, placeRefusal(apply(giant.state, { type: "draw" }).state, 0, "apex"));

  // Sac vide : la défausse, géante comprise (elle vient d'y arriver), devient le sac.
  const regen = apply(playState({ hand: inHand([]), bag: [], discard: ["clay"], triangle: triangleOf(null, null, placed("giant")) }), { type: "resolve" });
  run.same("final, pioche : régénération au cours de la résolution", ["final", "effect", "bagRegenerated", "draw"], eventTypes(regen.events).filter((type) => ["final", "effect", "bagRegenerated", "draw"].includes(type)).slice(-4));
  run("final, pioche : la défausse entière, géante comprise", 2, regen.events.find((event) => event.type === "bagRegenerated").size);
  run("final, pioche : aucune bille perdue", 2, marbleCount(regen.state));
}

function checkPlace(run) {
  const onEmpty = apply(playState({ hand: inHand(["clay", "glass"]), triangle: triangleOf(null, null, null) }), { type: "place", handIndex: 1, slot: "apex" });
  run.same("pose : la bille va sur l'emplacement, usure 0", placed("glass"), onEmpty.state.triangle.apex);
  run("pose : quitte la main", "clay", handIds(onEmpty.state).join());
  run.same("pose : journal", ["flick", "placed"], eventTypes(onEmpty.events));

  const replacing = apply(
    playState({ hand: inHand(["clay"]), triangle: triangleOf(null, null, placed("giant", 0)), discard: ["mica"] }),
    { type: "place", handIndex: 0, slot: "apex" }
  );
  run.same("remplacement : nouvelle bille à usure 0", placed("clay"), replacing.state.triangle.apex);
  run("remplacement : ancienne bille à la défausse", "mica,giant", replacing.state.discard.join());
  run("remplacement : journal nomme l'ancienne", "giant", replacing.events.find((event) => event.type === "knockout").marble);
  run.same(
    "remplacement : cause de la défausse",
    { type: "discarded", slot: "apex", marble: "giant", cause: "replacement" },
    replacing.events.find((event) => event.type === "discarded")
  );

  // Une bille usée qui revient repart à zéro : hors du triangle, elle n'est
  // plus qu'un id.
  const worn = apply(playState({ hand: inHand(["agate"]), triangle: triangleOf(placed("clay", 2), null, null) }), { type: "place", handIndex: 0, slot: "leftBase" });
  run("remplacement : aucune usure en défausse", "clay", worn.state.discard[0]);
  const back = apply(playState({ hand: inHand(["clay"]), triangle: triangleOf(null, null, null) }), { type: "place", handIndex: 0, slot: "leftBase" });
  run("une bille qui revient repart à usure 0", 0, back.state.triangle.leftBase.wear);

  run("pose : index hors main refusé", "invalidHandIndex", rules.reduce(playState({ hand: inHand(["clay"]) }), { type: "place", handIndex: 3, slot: "apex" }).error);
  run("pose : index non entier refusé", "invalidHandIndex", rules.reduce(playState({ hand: inHand(["clay"]) }), { type: "place", handIndex: "0", slot: "apex" }).error);
  run("pose : emplacement inconnu refusé", "invalidSlot", rules.reduce(playState({ hand: inHand(["clay"]) }), { type: "place", handIndex: 0, slot: "top" }).error);

  // Plusieurs poses dans le même tour.
  let many = playState({ hand: inHand(["clay", "glass", "agate"]) });
  many = apply(many, { type: "place", handIndex: 0, slot: "leftBase" }).state;
  many = apply(many, { type: "place", handIndex: 0, slot: "rightBase" }).state;
  many = apply(many, { type: "place", handIndex: 0, slot: "apex" }).state;
  run("pose : autant de billes que voulu", 0, many.hand.length);

  // Doublons : deux exemplaires, deux emplacements indépendants.
  let doubles = playState({ hand: inHand(["clay", "clay"]) });
  doubles = apply(doubles, { type: "place", handIndex: 0, slot: "leftBase" }).state;
  doubles = apply(doubles, { type: "place", handIndex: 0, slot: "apex" }).state;
  run("doublons : deux exemplaires posés", "clay,clay", [doubles.triangle.leftBase.marble, doubles.triangle.apex.marble].join());

  // Tour 1 : le joueur est seul responsable de ses poses, plus rien ne protège le
  // triangle. Quatre remplacements de suite sur la pointe passent.
  // Le Tic du verre fait choisir sa cible : la première répond.
  let firstTurn = playState({ turn: 1, hand: inHand(["clay", "glass", "agate", "mica", "tiger"]) });
  firstTurn = answerChoices(rules, apply(firstTurn, { type: "place", handIndex: 0, slot: "apex" })).state;
  firstTurn = answerChoices(rules, apply(firstTurn, { type: "place", handIndex: 0, slot: "apex" })).state;
  firstTurn = answerChoices(rules, apply(firstTurn, { type: "place", handIndex: 0, slot: "apex" })).state;
  run("tour 1 : remplacer encore reste permis", true, rules.reduce(firstTurn, { type: "place", handIndex: 0, slot: "apex" }).ok);
  run("placeRefusal : même réponse que l'action", null, placeRefusal(firstTurn, 0, "apex"));
  run("tour 1 : remplir un vide reste permis", null, placeRefusal(firstTurn, 0, "leftBase"));
  run("placeRefusal : pose permise", null, placeRefusal(playState({ hand: inHand(["clay"]) }), 0, "apex"));
  const later = playState({ turn: 2, hand: inHand(["clay"]), triangle: triangleOf(null, null, placed("mica")) });
  run("tour 2 : le remplacement n'a plus de limite", null, placeRefusal(later, 0, "apex"));
}

// Le déroulé d'une pose, les compteurs du tour : Tic et Éjection.
function checkHitAndKnockout(run) {
  // Ordre sur un emplacement occupé : Chiquenaude de A, Éjection de B, retrait,
  // défausse, pose de A, Tic de A.
  const state = playState({ hand: inHand(["clay"]), triangle: triangleOf(null, null, placed("gorilla", 1)) });
  const both = apply(state, { type: "place", handIndex: 0, slot: "apex" });
  run.same(
    "pose sur occupé : ordre du journal",
    ["flick", "effect", "knockout", "effect", "removed", "discarded", "placed", "hit", "effect"],
    eventTypes(both.events)
  );
  run.same(
    "pose sur occupé : qui joue quoi",
    ["flick:clay", "effect:clay", "knockout:gorilla", "effect:gorilla", "removed:gorilla", "discarded:gorilla", "placed:clay", "hit:clay", "effect:clay"],
    both.events.map((event) => `${event.type}:${event.marble}`)
  );
  run.same(
    "Éjection : son effet et le cumul",
    { type: "effect", trigger: "knockout", slot: "apex", marble: "gorilla", speedDelta: 3, massDelta: 0, draw: 0, operations: [], given: [], lost: [], speed: 3, mass: 1 },
    both.events[3]
  );
  run.same(
    "Tic : son effet et le cumul",
    { type: "effect", trigger: "hit", slot: "apex", marble: "clay", speedDelta: 2, massDelta: 0, draw: 0, operations: [], given: [], lost: [], speed: 5, mass: 1 },
    both.events[8]
  );

  // Les bons moments : au Tic, la nouvelle bille est là ; à l'Éjection, encore en main.
  const seenByKnockout = {
    witness: { knockout: [{ action: "speed", amount: 1, when: { type: "printedStat", slot: "apex", stat: "speed", atLeast: 5 } }], apex: [{ action: "speed", amount: 5 }] },
    arrival: { hit: [{ action: "mass", amount: 1, when: { type: "printedStat", slot: "apex", stat: "mass", atLeast: 2 } }], apex: [{ action: "mass", amount: 2 }] },
  };
  const moments = apply(playState({ hand: inHand(["arrival"]), triangle: triangleOf(null, null, placed("witness")) }), { type: "place", handIndex: 0, slot: "apex" }, seenByKnockout);
  run("Éjection : jouée avant le retrait de la bille", 1, moments.events.find((event) => event.trigger === "knockout").speedDelta);
  run("Tic : joué après l'arrivée de la bille", 1, moments.events.find((event) => event.trigger === "hit").massDelta);

  // Compteurs du tour, modifiés avant la résolution, et l'Impact en tient compte.
  run("compteurs : Vitesse du tour modifiée", 5, both.state.speed);
  run("compteurs : Masse du tour inchangée", 1, both.state.mass);
  const resolved = apply(both.state, { type: "resolve" });
  // 3 (Éjection du gorille) + 2 (Tic de l'argile) + 4 (argile en pointe).
  run("compteurs : la résolution en part", 9, resolved.events.find((event) => event.type === "impact").impact);
  run("compteurs : remis à zéro après la résolution", "0,1", `${resolved.state.speed},${resolved.state.mass}`);

  // Masse : Éjection de la plombée +1, Tic de l'agate +1, agate en pointe +1 (la base
  // gauche, une argile, n'est pas un calot), argile en base +1 de Vitesse.
  const massive = apply(playState({ hand: inHand(["agate"]), triangle: triangleOf(placed("clay"), null, placed("leaded")) }), { type: "place", handIndex: 0, slot: "apex" });
  run("Masse : Éjection et Tic", 3, massive.state.mass);
  const massImpact = apply(massive.state, { type: "resolve" }).events.find((event) => event.type === "impact");
  run.same("Masse : l'Impact en tient compte", { speed: 1, mass: 4, impact: 4 }, { speed: massImpact.speed, mass: massImpact.mass, impact: massImpact.impact });

  // Plusieurs poses : les compteurs s'accumulent.
  const twice = apply(apply(playState({ hand: inHand(["clay", "agate"]), triangle: triangleOf(placed("gorilla"), placed("leaded"), null) }), { type: "place", handIndex: 0, slot: "leftBase" }).state, { type: "place", handIndex: 0, slot: "rightBase" });
  run("compteurs : deux poses, Vitesse", 5, twice.state.speed);
  run("compteurs : deux poses, Masse", 3, twice.state.mass);

  // Une bille sans Tic ni Éjection : les évènements passent, aucun effet.
  const plain = apply(playState({ hand: inHand(["tiger"]), triangle: triangleOf(null, null, placed("porcelain")) }), { type: "place", handIndex: 0, slot: "apex" });
  run.same("sans Tic ni Éjection : aucun effet", ["flick", "knockout", "removed", "discarded", "placed", "hit"], eventTypes(plain.events));
  run("sans Tic ni Éjection : compteurs intacts", "0,1", `${plain.state.speed},${plain.state.mass}`);

  // Ni Tic ni Éjection ailleurs.
  const noReaction = (result) =>
    result.events.filter((event) => ["hit", "knockout"].includes(event.type) || ["hit", "knockout"].includes(event.trigger)).map((event) => event.type);
  const onEmpty = apply(playState({ hand: inHand(["clay"]) }), { type: "place", handIndex: 0, slot: "apex" });
  run.same("pose sur vide : ni Tic ni Éjection", [], noReaction(onEmpty));
  const swapped = apply(playState({ triangle: triangleOf(placed("gorilla"), placed("clay"), null) }), { type: "swap", a: "leftBase", b: "rightBase" });
  run.same("échange : ni Tic ni Éjection, même sur des billes qui en ont", [], noReaction(swapped));
  const worn = apply(playState({ triangle: triangleOf(null, null, placed("gorilla", 2)) }), { type: "resolve" });
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

// La Loupe : en base gauche, +4 à une pointe qui imprime de la Vitesse.
function checkMagnifier(run) {
  const withApex = (marble, apexOver = {}) =>
    apply(playState({ triangle: triangleOf(placed("magnifier"), null, marble === null ? null : { ...placed(marble), ...apexOver }) }), { type: "resolve" });
  const apexEffect = (result) => result.events.find((event) => event.type === "effect" && event.slot === "apex");

  const gorilla = withApex("gorilla");
  run("loupe : gorille en pointe, Vitesse +10", 10, apexEffect(gorilla).speedDelta);
  run("loupe : Impact 10", 10, gorilla.state.score);
  run.same(
    "loupe : ce qu'elle donne, dans son effet",
    [{ slot: "apex", marble: "gorilla", speed: 4, mass: 0 }],
    gorilla.events.find((event) => event.slot === "leftBase" && event.type === "effect").given
  );
  run("loupe : rien pour elle-même", 0, gorilla.events.find((event) => event.slot === "leftBase" && event.type === "effect").speedDelta);

  run("loupe : argile, 4 + 4", 8, apexEffect(withApex("clay")).speedDelta);
  run("loupe : une autre loupe en pointe, 2 + 4", 6, apexEffect(withApex("magnifier")).speedDelta);
  run("loupe : agate, aucun bonus", 0, apexEffect(withApex("agate")).speedDelta);
  run("loupe : agate garde sa Masse", 1, apexEffect(withApex("agate")).massDelta);
  run("loupe : sulfure, aucun bonus", 0, apexEffect(withApex("sulphide")).speedDelta);
  run("loupe : grès, sans effet de pointe, aucun bonus", 0, apexEffect(withApex("stoneware")).speedDelta);
  run("loupe : plombée, imprime du négatif, aucun bonus", -3, apexEffect(withApex("leaded")).speedDelta);
  run.same("loupe : pointe sans Vitesse, rien de donné", [], withApex("agate").events.find((event) => event.slot === "leftBase" && event.type === "effect").given);
  run.same("loupe : pointe vide, rien de donné", [], withApex(null).events.find((event) => event.slot === "leftBase" && event.type === "effect").given);

  // La condition lit l'imprimé, jamais l'effet déjà modifié : un bonus reçu ne
  // fait pas passer une pointe négative pour une pointe à Vitesse.
  const boosted = withApex("leaded", { bonus: { speed: 10, mass: 0 } });
  run.same("anti-boucle : un bonus reçu n'ouvre pas la condition", [], boosted.events.find((event) => event.slot === "leftBase" && event.type === "effect").given);
  run("anti-boucle : la pointe garde son bonus", 7, apexEffect(boosted).speedDelta);

  // Sur l'autre base et en pointe, ses autres effets.
  const right = apply(playState({ triangle: triangleOf(null, placed("magnifier"), placed("gorilla")) }), { type: "resolve" });
  run("loupe en base droite : Vitesse +1, pas de bonus", 7, right.state.score);
  const onApex = apply(playState({ triangle: triangleOf(null, null, placed("magnifier")) }), { type: "resolve" });
  run("loupe en pointe : Vitesse +2", 2, onApex.state.score);
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
    selfBreaker: { knockout: [crack(5)] },
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
  const broken = resolveOf(playState({ bag: ["plain"], triangle: triangleOf(placed("cracker"), null, placed("fragile", 1)) }));
  run.same(
    "Fêlure : l'effet, la fêlure, le retrait, le Final, avant la suite",
    ["phase", "effect", "cracked", "removed", "discarded", "final", "effect", "wear", "phaseSkipped", "phaseSkipped"],
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

  // Une bille fêlée jusqu'au retrait par sa propre Éjection ne part qu'une fois.
  const self = act(playState({ hand: inHand(["plain"]), triangle: triangleOf(null, null, placed("selfBreaker")) }), { type: "place", handIndex: 0, slot: "apex" });
  run("Éjection qui se fêle : une seule défausse", "selfBreaker", self.state.discard.join());
  run("Éjection qui se fêle : la posée arrive", "plain", self.state.triangle.apex.marble);
  run("Éjection qui se fêle : aucune bille perdue ni dupliquée", marbleCount(playState({ hand: inHand(["plain"]), triangle: triangleOf(null, null, placed("selfBreaker")) })), marbleCount(self.state));
}

// Polissage et Fêlure sur les billes de test du jeu : par un Tic, en phase avec
// retrait immédiat, sur soi, depuis un Final.
function checkWearMarbles(run) {
  const find = (result, type) => result.events.find((event) => event.type === type);
  // Verre : son Tic polit une bille active au choix, ici la pointe.
  const glassPlaced = apply(playState({ hand: inHand(["glass"]), triangle: triangleOf(placed("clay"), null, placed("porcelain", 1)) }), { type: "place", handIndex: 0, slot: "leftBase" });
  run.same(
    "verre : le Tic propose les billes actives, lui compris",
    ["leftBase", "apex"],
    glassPlaced.state.pendingChoice.eligible.map((target) => target.slot)
  );
  const glass = apply(glassPlaced.state, { type: "choose", target: { zone: "triangle", slot: "apex" } });
  run.same("verre : le Tic polit la bille choisie", { slot: "apex", marble: "porcelain", wear: 0 }, (({ slot, marble, wear }) => ({ slot, marble, wear }))(find(glass, "polished")));

  // Une Fêlure de base sur la pointe (une bille fabriquée) : la porcelaine (usure 1 sur
  // 2) part aussitôt, son Final joue, sa phase est sautée.
  // La porcelaine sans le Polissage au choix de son Final : ce cas porte sur la Fêlure.
  const plainPorcelain = { ...MARBLE_TYPES.porcelain, final: [{ action: "speed", amount: 4 }] };
  const crackerTable = { cracker: { base: [{ action: "crack", amount: 1, target: "apex" }] }, porcelain: plainPorcelain, clay: MARBLE_TYPES.clay };
  const cracked = apply(playState({ bag: ["clay"], triangle: triangleOf(placed("cracker"), null, placed("porcelain", 1)) }), { type: "resolve" }, crackerTable);
  run.same(
    "Fêlure en phase : retrait, Final de la porcelaine, puis la suite",
    ["phase", "effect", "cracked", "removed", "discarded", "final", "effect", "wear", "phaseSkipped", "phaseSkipped"],
    eventTypes(cracked.events).slice(0, 10)
  );
  run("Fêlure en phase : la Vitesse du Final compte, la phase de la porcelaine non", 4, find(cracked, "impact").impact);

  // Mica en pointe : Vitesse +2 et Polissage sur lui-même, puis son +1 d'usure.
  const mica = apply(playState({ bag: ["clay"], triangle: triangleOf(null, null, placed("mica", 2)) }), { type: "resolve" });
  run.same("mica : l'effet, le Polissage, puis l'usure", ["effect", "polished", "wear"], eventTypes(mica.events).filter((type) => ["effect", "polished", "wear"].includes(type)));
  run.same("mica : usure 2, polie à 1, puis 2 : il reste", [1, 2, false], [find(mica, "polished").wear, find(mica, "wear").wear, mica.events.some((event) => event.type === "removed")]);

  // Agate : son Final polit la pointe, qui n'est alors plus retirée.
  const agate = apply(
    playState({ bag: ["clay"], triangle: triangleOf({ ...placed("agate", 2) }, null, placed("porcelain", 1)) }),
    { type: "resolve" }
  );
  run.same("agate : Final ciblé, la porcelaine usée est sauvée", ["agate"], agate.events.filter((event) => event.type === "removed").map((event) => event.marble));
  run("agate : la porcelaine polie de 2 à 1", 1, find(agate, "polished").wear);
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
  refused("base vers la base gauche (toujours passée)", { base: [speedTo("leftBase")] });
  refused("variante de base droite vers la base droite", { baseVariant: { rightBase: [speedTo("rightBase")] } });
  accepted("base vers la base droite (depuis la base gauche)", { base: [speedTo("rightBase")] });
  accepted("base vers la pointe", { base: [speedTo("apex")] });
  accepted("variante de base gauche vers la base droite", { baseVariant: { leftBase: [speedTo("rightBase")] } });
  accepted("tic vers n'importe quel emplacement", { hit: [speedTo("leftBase"), speedTo("apex")] });
  accepted("éjection vers la base gauche", { knockout: [massTo("leftBase")] });
  accepted("Final sans cible", { final: [{ action: "speed", amount: 2 }] });
}

function checkBonus(run) {
  const toApex = (amount, action = "speed") => ({ action, amount, target: "apex" });
  const table = {
    plain: { apex: [{ action: "speed", amount: 1 }], base: [{ action: "speed", amount: 1 }] },
    giver: { hit: [toApex(2)], knockout: [toApex(3), toApex(1, "mass")] },
    // Une base qui vise la base droite : possible depuis la base gauche, perdu depuis
    // la base droite (sa propre phase a commencé).
    late: { base: [{ action: "speed", amount: 1, target: "rightBase" }] },
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

  const tooLate = resolveOf(playState({ triangle: triangleOf(placed("plain"), placed("late"), null) }));
  run("bonus : phase de la cible commencée, sans effet sur l'Impact", 1, tooLate.state.score);
  run("bonus : phase de la cible commencée, ne survit pas au tour", undefined, tooLate.state.triangle.leftBase.bonus);
  run.same(
    "bonus : perdu, noté au journal",
    [{ slot: "rightBase", reason: "phasePassed", speed: 1, mass: 0 }],
    tooLate.events.find((event) => event.type === "effect" && event.marble === "late").lost
  );
  run.same("bonus : perdu, rien de donné", [], tooLate.events.find((event) => event.type === "effect" && event.marble === "late").given);
  const inTime = resolveOf(playState({ triangle: triangleOf(placed("late"), placed("plain"), null) }));
  run("bonus : depuis la base gauche, la base droite le reçoit (1 + 1)", 2, inTime.events.find((event) => event.type === "effect" && event.slot === "rightBase").speedDelta);
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
  // Ordre : base gauche, base droite, pointe, puis Impact, retrait, rotation.
  const full = playState({ triangle: triangleOf(placed("clay"), placed("glass"), placed("agate")) });
  const result = apply(full, { type: "resolve" });
  run.same(
    "résolution : ordre du journal",
    ["phase", "effect", "wear", "phase", "effect", "wear", "phase", "effect", "wear", "impact", "rotation", "turnEnded"],
    eventTypes(result.events)
  );
  run.same(
    "résolution : ordre des phases",
    ["leftBase", "rightBase", "apex"],
    result.events.filter((event) => event.type === "phase").map((event) => event.slot)
  );
  // Argile en base (Vitesse +1), Verre en base (Masse +1), Agate en pointe (Masse +1 :
  // la base gauche, une argile, n'est pas un calot).
  const impact = result.events.find((event) => event.type === "impact");
  run.same("résolution : Vitesse 1, Masse 3, Impact 3", { type: "impact", speed: 1, mass: 3, impact: 3, score: 3 }, impact);
  run("résolution : le Score cumule", 3, result.state.score);
  run("résolution : le tour avance", 3, result.state.turn);
  run("résolution : la pioche suivante reste à faire", "draw", result.state.stage);

  const second = apply(playState({ score: 10, triangle: triangleOf(placed("clay"), placed("glass"), placed("agate")) }), { type: "resolve" });
  run("Impact ajouté au Score", 13, second.state.score);

  const effect = result.events.find((event) => event.type === "effect" && event.slot === "rightBase");
  run.same(
    "effet : deltas et cumul",
    { type: "effect", trigger: "phase", slot: "rightBase", marble: "glass", speedDelta: 0, massDelta: 1, draw: 0, operations: [], given: [], lost: [], speed: 1, mass: 2 },
    effect
  );

  // Usure qui se remplit, sans retrait avant le maximum.
  const worn = apply(playState({ triangle: triangleOf(placed("clay", 1), null, null) }), { type: "resolve" });
  const wearEvent = worn.events.find((event) => event.type === "wear");
  run.same("usure : +1 et maximum dans le journal", { type: "wear", slot: "leftBase", marble: "clay", wear: 2, maxWear: 3 }, wearEvent);
  run("usure : pas de retrait avant le maximum", false, eventTypes(worn.events).includes("retired"));
  run("usure : gardée après rotation (base gauche -> pointe)", 2, worn.state.triangle.apex.wear);

  // Retrait : la bille joue son effet, puis part à la défausse.
  const last = apply(playState({ triangle: triangleOf(placed("clay", 2), null, null) }), { type: "resolve" });
  run("retrait : effet joué malgré le maximum atteint", 1, last.events.find((event) => event.type === "impact").impact);
  run("retrait : part à la défausse", "clay", last.state.discard.join());
  run.same("retrait : emplacement vidé", triangleOf(null, null, null), last.state.triangle);
  run.same(
    "retrait : après les phases, avant l'Impact et la rotation",
    ["removed", "discarded", "final", "impact", "rotation", "turnEnded"],
    eventTypes(last.events).slice(-6)
  );

  const giant = apply(playState({ bag: ["agate"], triangle: triangleOf(null, null, placed("giant")) }), { type: "resolve" });
  run("géante : joue puis part dès le premier tour", 6, giant.state.score);
  run("géante : retirée", "giant", giant.state.discard.join());

  const porcelain = apply(playState({ triangle: triangleOf(null, null, placed("porcelain", 1)) }), { type: "resolve" });
  run("porcelaine : retirée à usure 2", "porcelain", porcelain.state.discard.join());
  const tiger = apply(playState({ triangle: triangleOf(null, null, placed("tiger", 2)) }), { type: "resolve" });
  run("tigrée : pas retirée à usure 3 sur 4", 0, tiger.state.discard.length);

  const twoRetired = apply(playState({ bag: ["agate"], triangle: triangleOf(placed("giant"), placed("clay", 2), placed("glass")) }), { type: "resolve" });
  run("retrait : dans l'ordre des emplacements", "giant,clay", twoRetired.state.discard.join());

  // Rotation : base gauche -> pointe, pointe -> base droite, base droite -> base gauche.
  run.same(
    "rotation : billes",
    triangleOf(placed("glass", 1), placed("agate", 1), placed("clay", 1)),
    result.state.triangle
  );
  run.same("rotation : journal porte le triangle d'après", result.state.triangle, result.events.find((event) => event.type === "rotation").triangle);
  const withHole = apply(playState({ triangle: triangleOf(placed("clay"), null, null) }), { type: "resolve" });
  run.same("rotation : les vides tournent aussi", triangleOf(null, null, placed("clay", 1)), withHole.state.triangle);

  // Emplacement vide : phase sautée.
  const skipped = apply(playState({ triangle: triangleOf(null, placed("clay"), null) }), { type: "resolve" });
  run.same("phase vide : sautée, dans l'ordre", ["phaseSkipped", "phase", "effect", "wear", "phaseSkipped", "impact", "rotation", "turnEnded"], eventTypes(skipped.events));

  // Œil-de-chat : la variante suit la base où il se trouve.
  const leftEye = apply(playState({ triangle: triangleOf(placed("cats_eye"), null, null) }), { type: "resolve" });
  run.same("œil-de-chat en base gauche : Vitesse +3", { speed: 3, mass: 1 }, pickTotals(leftEye));
  const rightEye = apply(playState({ triangle: triangleOf(null, placed("cats_eye"), null) }), { type: "resolve" });
  run.same("œil-de-chat en base droite : Masse +1", { speed: 0, mass: 2 }, pickTotals(rightEye));
  const apexEye = apply(playState({ triangle: triangleOf(null, null, placed("cats_eye")) }), { type: "resolve" });
  run.same("œil-de-chat en pointe : Vitesse +3", { speed: 3, mass: 1 }, pickTotals(apexEye));

  // Planchers : à l'Impact seulement.
  const negative = apply(playState({ score: 5, triangle: triangleOf(null, null, placed("leaded")) }), { type: "resolve" });
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
  run("calibre, comptage dans un Final : retirée, elle se compte encore", 4, ghost.events.find((event) => event.trigger === "final").speedDelta);
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

// Les billes de test des conditions de calibre, sur la vraie table : le gorille
// (comparaison au Tic), le mica (comparaison à l'Éjection), le grès (comptage),
// l'agate (calibre d'un emplacement, vide compris).
function checkSizeMarbles(run) {
  run.same(
    "calibres des billes de test",
    "porcelain:small mica:small magnifier:small clay:medium glass:medium agate:medium cats_eye:medium stoneware:medium tiger:medium gorilla:large leaded:large sulphide:large giant:large",
    ["porcelain", "mica", "magnifier", "clay", "glass", "agate", "cats_eye", "stoneware", "tiger", "gorilla", "leaded", "sulphide", "giant"]
      .map((id) => `${id}:${MARBLE_SIZES[MARBLE_TYPES[id].size]}`)
      .join(" ")
  );
  const effectOf = (events, trigger) => events.find((event) => event.type === "effect" && event.trigger === trigger);

  // Gorille, Tic : Vitesse +4 si l'éjectée est plus petite.
  const gorillaOn = (occupant) =>
    effectOf(apply(playState({ hand: inHand(["gorilla"]), triangle: triangleOf(null, null, placed(occupant)) }), { type: "place", handIndex: 0, slot: "apex" }).events, "hit").speedDelta;
  run("gorille : éjecte une minibille, Vitesse +4", 4, gorillaOn("porcelain"));
  run("gorille : éjecte une normale, Vitesse +4", 4, gorillaOn("clay"));
  run("gorille : éjecte un calot, rien", 0, gorillaOn("giant"));

  // Mica, Éjection : Pioche 1 si la posée est plus grosse.
  const micaKnocked = (incoming) => {
    const result = apply(playState({ hand: inHand([incoming]), bag: ["tiger"], triangle: triangleOf(placed("mica"), null, null) }), { type: "place", handIndex: 0, slot: "leftBase" });
    return { draw: effectOf(result.events, "knockout").draw, hand: handIds(result.state) };
  };
  run.same("mica : délogé par une normale, Pioche 1", { draw: 1, hand: ["tiger"] }, micaKnocked("clay"));
  run.same("mica : délogé par un calot, Pioche 1", { draw: 1, hand: ["tiger"] }, micaKnocked("giant"));
  run.same("mica : délogé par une minibille, rien", { draw: 0, hand: [] }, micaKnocked("porcelain"));

  // Grès, base : Vitesse +1 par minibille active.
  const stonewareSpeed = (rightBase, apex) =>
    apply(playState({ triangle: triangleOf(placed("stoneware"), rightBase, apex) }), { type: "resolve" }).events.find((event) => event.trigger === "phase" && event.slot === "leftBase").speedDelta;
  run("grès : deux minibilles actives, Vitesse +2", 2, stonewareSpeed(placed("porcelain"), placed("magnifier")));
  run("grès : une seule, Vitesse +1", 1, stonewareSpeed(placed("clay"), placed("mica")));
  run("grès : aucune, rien", 0, stonewareSpeed(placed("clay"), null));

  // Agate, pointe : Masse +1, et Masse +2 si la base gauche est un calot.
  const agateMass = (leftBase) =>
    apply(playState({ triangle: triangleOf(leftBase, null, placed("agate")) }), { type: "resolve" }).events.find((event) => event.trigger === "phase" && event.slot === "apex").massDelta;
  run("agate : base gauche un calot, Masse +3", 3, agateMass(placed("leaded")));
  run("agate : base gauche une normale, Masse +1", 1, agateMass(placed("clay")));
  run("agate : base gauche vide, Masse +1", 1, agateMass(null));
}

// La Chiquenaude (doc/marbles.md, « Déroulé d'une pose ») : à chaque pose, avant tout
// le reste, la bille en cours de lancer, ni en main ni sur le triangle.
function checkFlick(run) {
  const toApex = { type: "place", handIndex: 0, slot: "apex" };
  const effectOf = (result, trigger) => result.events.find((event) => event.type === "effect" && event.trigger === trigger);

  // L'ordre du journal, sur un vide puis sur un occupé (la porcelaine : Masse +1).
  const onEmpty = apply(playState({ hand: inHand(["porcelain"]) }), toApex);
  run.same("chiquenaude, vide : la Chiquenaude, son effet, la pose", ["flick", "effect", "placed"], eventTypes(onEmpty.events));
  const { trigger, slot, marble, massDelta, mass } = onEmpty.events[1];
  run.same("chiquenaude : son effet, à l'emplacement visé, compté au tour", { trigger: "flick", slot: "apex", marble: "porcelain", massDelta: 1, mass: 2 }, { trigger, slot, marble, massDelta, mass });
  const onOccupied = apply(playState({ hand: inHand(["porcelain"]), triangle: triangleOf(null, null, placed("gorilla")) }), toApex);
  run.same(
    "chiquenaude, occupé : Chiquenaude, Éjection, retrait, défausse, pose, Tic",
    ["flick", "effect", "knockout", "effect", "removed", "discarded", "placed", "hit"],
    eventTypes(onOccupied.events)
  );
  const counted = apply(playState({ hand: inHand(["tiger"], 3) }), toApex);
  run.same("chiquenaude : l'évènement porte le compteur de la bille lancée", { type: "flick", slot: "apex", marble: "tiger", turnsInHand: 3 }, counted.events[0]);
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

  // La Chiquenaude qui vide l'emplacement visé par une Fêlure : la plombée d'avant
  // Éjecter (Fêlure 3 à la pointe) sur une argile (usure maximale 3). Celle d'aujourd'hui
  // l'éjecte : checkEject.
  const cleared = apply(playState({ hand: inHand(["leaded"]), triangle: triangleOf(null, null, placed("clay")) }), toApex, fixedRules);
  run.same(
    "chiquenaude qui vide l'emplacement : retrait par usure, puis la pose, ni Éjection ni Tic",
    ["flick", "effect", "cracked", "removed", "discarded", "final", "placed"],
    eventTypes(cleared.events)
  );
  run("chiquenaude qui vide l'emplacement : l'occupante part par usure", "wear", cleared.events.find((event) => event.type === "discarded").cause);
  run.same(
    "chiquenaude qui vide l'emplacement : la plombée en pointe, l'argile à la défausse",
    { apex: placed("leaded"), discard: ["clay"] },
    { apex: cleared.state.triangle.apex, discard: cleared.state.discard }
  );
  // Final compris : la porcelaine (usure maximale 2) joue le sien, compté au tour.
  // La porcelaine d'avant les choix : ce cas porte sur l'ordre du Final.
  const withFinal = apply(playState({ hand: inHand(["leaded"]), triangle: triangleOf(null, null, placed("porcelain")) }), toApex, fixedRules);
  run.same(
    "chiquenaude qui vide l'emplacement : le Final de l'occupante, puis la pose",
    ["flick", "effect", "cracked", "removed", "discarded", "final", "effect", "placed"],
    eventTypes(withFinal.events)
  );
  run("chiquenaude qui vide l'emplacement : le Final compte pour le tour", 4, withFinal.state.speed);
  // La Fêlure ne suffit pas (la tigrée, usure maximale 4) : un remplacement ordinaire.
  const notCleared = apply(playState({ hand: inHand(["leaded"]), triangle: triangleOf(null, null, placed("tiger")) }), toApex, fixedRules);
  run.same(
    "chiquenaude : l'emplacement encore occupé, Éjection et Tic comme d'habitude",
    ["flick", "effect", "cracked", "knockout", "removed", "discarded", "placed", "hit"],
    eventTypes(notCleared.events)
  );
  // Posée ailleurs, la plombée fêle quand même la pointe.
  const elsewhere = apply(playState({ hand: inHand(["leaded"]), triangle: triangleOf(null, null, placed("tiger")) }), { type: "place", handIndex: 0, slot: "leftBase" }, fixedRules);
  run.same("chiquenaude : la Fêlure ciblée, posée ailleurs", { marble: "tiger", wear: 3 }, elsewhere.state.triangle.apex);

  // Validation : la règle des cibles et les conditions.
  run("chiquenaude : une Vitesse ciblée est permise", false, throws(() => validateTable({ a: { flick: [{ action: "speed", amount: 1, target: "apex" }] } })));
  run("chiquenaude : une Fêlure ciblée est permise", false, throws(() => validateTable({ a: { flick: [{ action: "crack", amount: 1, target: "apex" }] } })));
  run("chiquenaude : une action sur elle-même est refusée", true, throws(() => validateTable({ a: { flick: [{ action: "polish", amount: 1 }] } })));
  run(
    "chiquenaude : pas de calibre relatif, aucun remplacement en cours",
    true,
    throws(() => validateTable({ a: { flick: [{ action: "speed", amount: 1, when: { type: "relativeSize", marble: "placed", is: "larger" } }] } }))
  );
}

// Le compteur de tours en main (core/marbles.js, en-tête).
function checkTurnsInHand(run) {
  const start = apply(
    { ...playState({ hand: [{ marble: "clay", turnsInHand: 0 }, { marble: "tiger", turnsInHand: 2 }], bag: ["glass"] }), stage: "draw" },
    { type: "draw" }
  );
  run.same(
    "compteur : +1 en début de tour pour les billes déjà en main, 0 pour la bille piochée",
    [
      { marble: "clay", turnsInHand: 1 },
      { marble: "tiger", turnsInHand: 3 },
      { marble: "glass", turnsInHand: 0 },
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

// Les montants calculés (core/marbles-effects.js, en-tête) : base + pas × source,
// plafonnés, évalués au déclenchement.
function checkComputedAmounts(run) {
  const clayFlick = (turnsInHand) =>
    apply(playState({ hand: inHand(["clay"], turnsInHand) }), { type: "place", handIndex: 0, slot: "apex" }).events.find((event) => event.trigger === "flick").speedDelta;
  run("montant calculé : l'argile à 0 tour en main, Vitesse +0", 0, clayFlick(0));
  run("montant calculé : 2 tours, Vitesse +2", 2, clayFlick(2));
  run("montant calculé : 5 tours, au plafond", 5, clayFlick(5));
  run("montant calculé : 9 tours, plafonné à +5", 5, clayFlick(9));

  const inHandFor = (turnsInHand) => ({ triangle: null, holder: { marble: "x", zone: "hand", turnsInHand }, replacement: null });
  const source = { type: "turnsInHand" };
  run("montant calculé : base + pas × source", 8, amountOf({ base: 2, step: 3, source }, inHandFor(2)));
  run("montant calculé : plafonné", 6, amountOf({ base: 2, step: 3, source, max: 6 }, inHandFor(2)));
  run("montant calculé : base négative permise pour une Vitesse", -1, amountOf({ base: -3, step: 1, source }, inHandFor(2)));
  run("montant calculé : un entier reste lui-même", 4, amountOf(4, inHandFor(2)));
  run("montant calculé : jamais dans l'imprimé", 0, printedStat(MARBLE_TYPES.clay.flick, "speed"));

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
  // La tigrée d'avant Éjecter (sa base donne Vitesse +3, sans choix) : ces cas portent
  // sur la Trouvaille.
  const apply = (state, action, marbles = fixedRules) => applyWith(state, action, marbles);
  // Chaque évènement, avec sa bille ; une pioche sans la sienne, que le mélange choisit.
  const typesAndMarbles = (events) => events.map((event) => (event.marble === undefined || event.type === "draw" ? event.type : `${event.type}:${event.marble}`));
  // De `first` à la première entrée `last` qui le suit.
  const between = (events, first, last) => {
    const types = typesAndMarbles(events);
    const from = types.indexOf(first);
    return types.slice(from, types.indexOf(last, from) + 1);
  };

  // Phase de jeu : le Tic de l'œil-de-chat pioche, la défausse devient le sac.
  const play = apply(
    playState({ hand: inHand(["cats_eye"]), bag: [], discard: ["clay"], triangle: triangleOf(placed("tiger"), placed("agate", 1), placed("glass")) }),
    { type: "place", handIndex: 0, slot: "apex" }
  );
  run.same(
    "trouvaille, phase de jeu : régénération, trouvailles dans l'ordre des phases, puis la pioche",
    [
      "bagRegenerated",
      "windfall:tiger",
      "effect:tiger",
      "windfall:agate",
      "effect:agate",
      "polished:agate",
      "windfall:cats_eye",
      "draw",
    ],
    between(play.events, "bagRegenerated", "draw")
  );
  run("trouvaille, phase de jeu : la Vitesse au compteur du tour", 3, play.state.speed);
  run("trouvaille, phase de jeu : le Polissage sur elle-même", 0, play.state.triangle.rightBase.wear);

  // Résolution : la Pioche du mica en phase, puis celle du Final de la géante.
  const resolved = apply(playState({ bag: [], discard: ["clay"], triangle: triangleOf(placed("mica"), placed("giant"), placed("tiger")) }), { type: "resolve" });
  const regenerations = resolved.events.filter((event) => event.type === "bagRegenerated").length;
  run("trouvaille, résolution : deux régénérations, en phase et au Final", 2, regenerations);
  run.same(
    "trouvaille, résolution : chez les billes encore actives, la géante retirée n'en a plus",
    ["windfall:mica", "windfall:giant", "windfall:tiger", "windfall:mica", "windfall:tiger"],
    typesAndMarbles(resolved.events).filter((entry) => entry.startsWith("windfall"))
  );
  run("trouvaille, résolution : comptée dans l'Impact (6 − 1 + 3 + 3)", 11, resolved.events.find((event) => event.type === "impact").impact);

  // Début de tour : les compteurs, remis à zéro par la résolution, reçoivent la
  // Trouvaille du nouveau tour.
  const ended = apply(playState({ hand: inHand(["glass"]), bag: [], discard: ["clay"], triangle: triangleOf(placed("tiger"), null, null) }), { type: "resolve" });
  run("trouvaille, début de tour : compteurs remis à zéro après la résolution", "0,1", `${ended.state.speed},${ended.state.mass}`);
  const started = apply(ended.state, { type: "draw" });
  run.same(
    "trouvaille, début de tour : régénération, trouvaille, pioche",
    ["turnStarted", "bagRegenerated", "windfall:tiger", "effect:tiger", "draw", "awaken:clay"],
    typesAndMarbles(started.events)
  );
  run("trouvaille, début de tour : la Vitesse au compteur du nouveau tour", 3, started.state.speed);

  // Seulement les billes actives : en main, au sac, en défausse, rien.
  const idle = apply(playState({ hand: inHand(["tiger", "cats_eye"]), bag: [], discard: ["tiger", "agate"], triangle: triangleOf(null, null, placed("glass")) }), {
    type: "place",
    handIndex: 1,
    slot: "apex",
  });
  run.same(
    "trouvaille : seulement chez les billes actives",
    ["windfall:cats_eye"],
    typesAndMarbles(idle.events).filter((entry) => entry.startsWith("windfall"))
  );
  run("trouvaille : aucun effet sans bille active qui en a une", 0, idle.state.speed);
  // En cours de lancer : la Chiquenaude qui pioche régénère, la bille lancée n'a pas
  // la sienne.
  const thrownTable = { thrower: { flick: [{ action: "draw", amount: 1 }], windfall: [{ action: "speed", amount: 5 }] }, plain: {} };
  const thrown = apply(playState({ hand: inHand(["thrower"]), bag: [], discard: ["plain"] }), { type: "place", handIndex: 0, slot: "apex" }, thrownTable);
  run.same("trouvaille : pas chez la bille en cours de lancer", [], typesAndMarbles(thrown.events).filter((entry) => entry.startsWith("windfall")));

  // Retrait immédiat par Fêlure après une régénération : le sulfure fêle la
  // porcelaine (usure maximale 2), qui rejoint la défausse tout juste vidée, son
  // Final compris, avant la reprise de la pioche.
  const cracked = apply(
    { ...playState({ bag: [], discard: ["clay"], triangle: triangleOf(placed("sulphide"), placed("porcelain", 1), null) }), stage: "draw" },
    { type: "draw" },
    fixedRules
  );
  run.same(
    "trouvaille, Fêlure : retrait, défausse, Final, puis la pioche",
    ["windfall:sulphide", "effect:sulphide", "cracked:porcelain", "removed:porcelain", "discarded:porcelain", "final:porcelain", "effect:porcelain", "draw"],
    between(cracked.events, "windfall:sulphide", "draw")
  );
  run.same("trouvaille, Fêlure : la porcelaine seule dans la défausse vidée", ["porcelain"], cracked.state.discard);
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
  const lastTurn = apply(playState({ turn: 9, score: 3, triangle: triangleOf(placed("clay"), null, null) }), { type: "resolve" });
  run("fin : après le 9e tour", "over", lastTurn.state.stage);
  run("fin : motif", "turnsCompleted", lastTurn.state.endReason);
  run("fin : le tour reste à 9", 9, lastTurn.state.turn);
  run.same("fin : dernier du journal", { type: "gameOver", reason: "turnsCompleted", score: 4 }, lastTurn.events.at(-1));
  run.same("fin : la rotation et la fin du tour ont lieu avant", ["rotation", "turnEnded"], eventTypes(lastTurn.events).slice(-3, -1));
  run("fin : plus aucune action", "gameOver", rules.reduce(lastTurn.state, { type: "draw" }).error);
  run("fin : plus de résolution", "gameOver", rules.reduce(lastTurn.state, { type: "resolve" }).error);
  run("fin : plus d'échange", "gameOver", swapRefusal(lastTurn.state));
  run("fin : plus de pose", "gameOver", placeRefusal(lastTurn.state, 0, "apex"));

  // Plus de règle « sac régénéré de moins de 3 billes » : un sac de 2 se joue.
  const small = apply(
    { ...playState({ score: 12, hand: inHand(["clay"]), bag: [], discard: ["agate", "porcelain"] }), stage: "draw" },
    { type: "draw" }
  );
  run("sac régénéré de 2 billes : la partie continue", "play", small.state.stage);
  run.same("sac régénéré de 2 billes : journal", ["turnStarted", "bagRegenerated", "draw", "awaken"], eventTypes(small.events));

  // Pioche impossible, faute de billes : la partie finit.
  const empty = apply({ ...playState({ score: 12, hand: inHand(["clay"]), bag: [], discard: [] }), stage: "draw" }, { type: "draw" });
  run("sac et défausse vides : partie finie", "over", empty.state.stage);
  run("sac et défausse vides : motif", "outOfMarbles", empty.state.endReason);
  run.same("sac et défausse vides : journal", ["turnStarted", "drawSkipped", "gameOver"], eventTypes(empty.events));
  run("sac et défausse vides : arrêt annoncé", "noMarbles", empty.events[1].reason);
  run.same("sac et défausse vides : score compté", { type: "gameOver", reason: "outOfMarbles", score: 12 }, empty.events[2]);
  run("sac et défausse vides : plus de pose", "gameOver", placeRefusal(empty.state, 0, "apex"));

  // Une seule bille piochée sur trois : la partie continue.
  const partial = apply({ ...playState({ hand: inHand([]), bag: ["glass"], discard: [], drawPerTurn: 3 }), stage: "draw" }, { type: "draw" });
  run("pioche partielle : la partie continue", "play", partial.state.stage);
  run.same("pioche partielle : journal", ["turnStarted", "draw", "awaken", "drawSkipped"], eventTypes(partial.events));

  // Main pleine, sac et défausse vides : jamais une fin de partie.
  const full = apply({ ...playState({ hand: inHand(["clay", "glass", "agate", "mica", "tiger"]), bag: [], discard: [] }), stage: "draw" }, { type: "draw" });
  run("main pleine, rien à piocher : la partie continue", "play", full.state.stage);
  run("main pleine, rien à piocher : motif de l'arrêt", "handFull", full.events[1].reason);

  // Plus de sac minimal : un sac plus petit que le triangle se joue, un sac vide
  // s'arrête à la première pioche, faute de billes.
  run("sac de 2 billes : la partie se joue", "play", apply(rules.createGame(1, { bag: ["clay", "glass"] }), { type: "draw" }).state.stage);
  run("sac vide : partie finie à la première pioche", "outOfMarbles", apply(rules.createGame(1, { bag: [] }), { type: "draw" }).state.endReason);
  run.same("fins de partie : les raisons, dans l'ordre", ["outOfMarbles", "turnsCompleted"], END_REASONS);
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
  run("partie complète : 9 tours joués", 9, a.journal.filter((event) => event.type === "turnStarted").length);
  run("partie complète : fin normale", "turnsCompleted", a.state.endReason);
  run("partie complète : billes conservées", STARTING_BAG.length, marbleCount(a.state));
  run("autre graine : autre partie", false, JSON.stringify(a.journal) === JSON.stringify(scriptedGame(1235).journal));
  run("graine en chaîne acceptée", true, scriptedGame("billes").state.stage === "over");

  // Le réducteur ne touche jamais à l'état reçu.
  const frozen = deepFreeze(apply(rules.createGame(5), { type: "draw" }).state);
  run("pureté : pose sur un état figé", false, throws(() => apply(frozen, { type: "place", handIndex: 0, slot: "apex" })));
  run("pureté : résolution sur un état figé", false, throws(() => rules.reduce(deepFreeze(playState({ triangle: triangleOf(placed("clay"), null, placed("giant")) })), { type: "resolve" })));
  run("pureté : pioche sur un état figé", false, throws(() => apply(deepFreeze({ ...playState({ hand: inHand([]), bag: [], discard: ["clay", "glass", "agate", "mica", "tiger"] }), stage: "draw" }), { type: "draw" })));
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

// Choix au hasard, à graine : le PRNG du test, jamais celui de la partie.
function createPicker(seed) {
  let rngState = seed >>> 0;
  return (count) => {
    const { value, state } = nextRandom(rngState);
    rngState = state;
    return Math.floor(value * count);
  };
}

// Joue une partie par choix aléatoires, actions refusées comprises. Rend les
// fautes d'invariants trouvées et les types d'évènements vus.
function playRandomGame(seed, options, seenTypes) {
  const pick = createPicker(seed);
  let state = rules.createGame(seed, options);
  const total = marbleCount(state);
  const faults = [];
  let score = 0;
  let actions = 0;

  const verify = (result) => {
    state = result.state;
    actions += 1;
    for (const event of result.events) seenTypes.add(event.type);
    // Un état suspendu sur un choix est un instantané en pleine action : une bille
    // peut y être en cours de lancer, ni en main ni sur le triangle. Le compte se
    // vérifie hors choix.
    if (!state.pendingChoice && marbleCount(state) !== total) faults.push(`billes : ${marbleCount(state)} au lieu de ${total}`);
    if (state.score < 0) faults.push(`score négatif : ${state.score}`);
    if (state.score < score) faults.push(`score en baisse : ${score} -> ${state.score}`);
    score = state.score;
    if (state.hand.length > state.maxHandSize) faults.push(`main trop grande : ${state.hand.length}`);
    if (state.stage !== "play" && (state.speed !== 0 || state.mass !== 1)) faults.push(`compteurs non remis à zéro : ${state.speed}, ${state.mass}`);
    if (state.turn > state.turnCount) faults.push(`tour hors bornes : ${state.turn}`);
    for (const slot of SLOTS) {
      const placedHere = state.triangle[slot];
      if (placedHere !== null && placedHere.wear >= rules.maxWearOf(placedHere.marble) && state.stage === "draw") {
        faults.push(`bille à usure maximale restée sur le triangle : ${placedHere.marble}`);
      }
      if (placedHere?.bonus !== undefined && state.stage !== "play") faults.push(`bonus resté après la résolution : ${placedHere.marble}`);
    }
  };

  // Borne large : une partie sans issue la dépasserait, et serait signalée.
  while (state.stage !== "over" && actions < 2000) {
    // Un choix en attente : une réponse légale au hasard (Terminer compris), mais
    // aussi, une fois sur quatre, une autre action, qui doit être refusée.
    if (state.pendingChoice) {
      if (pick(4) === 0) {
        const refusedResult = rules.reduce(state, { type: "resolve" });
        if (refusedResult.ok || refusedResult.error !== "choicePending") faults.push(`action acceptée pendant un choix : ${refusedResult.error}`);
      }
      const answers = legalActions(state);
      verify(rules.reduce(state, answers[pick(answers.length)]));
      continue;
    }
    if (state.stage === "draw") {
      verify(rules.reduce(state, { type: "draw" }));
      continue;
    }
    switch (pick(6)) {
      case 0:
        verify(rules.reduce(state, { type: "swap", a: SLOTS[pick(3)], b: SLOTS[pick(3)] }));
        break;
      case 1:
      case 2:
      case 3:
        verify(rules.reduce(state, { type: "place", handIndex: pick(state.maxHandSize), slot: SLOTS[pick(3)] }));
        break;
      default:
        verify(rules.reduce(state, { type: "resolve" }));
    }
  }
  if (state.stage !== "over") faults.push("partie sans issue");
  return faults;
}

function checkSmoke(run) {
  const seen = new Set();
  const bags = [
    undefined, // le sac de test, le cas principal
    { bag: ["clay", "clay", "clay", "giant", "giant", "giant", "porcelain", "porcelain"] },
    { bag: ["giant", "giant", "giant", "giant", "giant", "giant"] },
    { bag: ["clay", "glass", "agate", "mica", "tiger"] },
    { bag: ["clay", "glass", "agate"] },
    { bag: ["mica", "mica", "mica"] }, // le plus petit sac permis : la pioche finit par manquer de billes
  ];
  const faults = [];
  let games = 0;
  let exceptions = 0;
  for (let seed = 1; seed <= 300; seed++) {
    // Une graine sur deux pour le sac de test, les autres se partagent les
    // petits sacs.
    const options = bags[seed % 2 === 0 ? 0 : 1 + ((seed - 1) / 2) % (bags.length - 1)];
    games += 1;
    try {
      faults.push(...playRandomGame(seed, options, seen).map((fault) => `graine ${seed} : ${fault}`));
    } catch (error) {
      exceptions += 1;
      faults.push(`graine ${seed} : exception ${error.message}`);
    }
  }
  run("fumée : 300 parties jouées", 300, games);
  run("fumée : aucune exception", 0, exceptions);
  run.same("fumée : invariants tenus", [], faults.slice(0, 5));
  run(
    "fumée : tous les évènements rencontrés",
    "awaken,bagRegenerated,choice,choiceEnded,chosen,cracked,discarded,draw,drawSkipped,effect,eject,final,flick,gameOver,hit,impact,knockout,lost,phase,phaseSkipped,placed,pocketReaction,pocketed,polished,potResolution,removed,rotation,swapped,targetEmpty,turnEnded,turnStarted,wear,windfall",
    [...seen].sort().join()
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
    "tour 2, échange possible": playState({ hand: inHand(["clay", "glass"]), triangle: triangleOf(placed("agate"), null, placed("mica")) }),
    "tour 2, échange déjà fait": playState({ hand: inHand(["clay"]), swapUsed: true, triangle: triangleOf(placed("agate"), null, null) }),
    "tour 2, triangle vide, main vide": playState({ hand: inHand([]) }),
    "partie finie": playState({ stage: "over", endReason: "turnsCompleted" }),
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
