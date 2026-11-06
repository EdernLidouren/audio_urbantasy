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
  createMarblesGame,
  marblesReduce,
  effectAt,
  impactOf,
  maxWearOf,
  swapRefusal,
  placeRefusal,
  validateMarbleTypes,
} from "../marbles.js";
import { printedStat } from "../marbles-effects.js";
import { MARBLE_TYPES, STARTING_BAG, MARBLES_SETTINGS } from "../../config/marbles-values.js";

// Partie en cours de tour : le tour 2 par défaut, sans contrainte de triangle
// plein. `over` remplace ce que le test veut fixer.
function playState(over = {}) {
  return {
    ...createMarblesGame(1, { bag: [] }),
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
function apply(state, action, types) {
  const result = marblesReduce(state, action, types);
  if (!result.ok) throw new Error(`action refusée (${result.error}) : ${JSON.stringify(action)}`);
  return result;
}

function eventTypes(events) {
  return events.map((event) => event.type);
}

function marbleCount(state) {
  const onTriangle = SLOTS.filter((slot) => state.triangle[slot] !== null).length;
  return state.bag.length + state.hand.length + state.discard.length + onTriangle;
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
  checkHitAndKnockout(run);
  checkMagnifier(run);
  checkBonus(run);
  checkResolution(run);
  checkEndOfGame(run);
  checkDeterminism(run);
  checkSerialization(run);
  checkSmoke(run);
}

function checkTable(run) {
  run("table : 13 billes", 13, Object.keys(MARBLE_TYPES).length);
  run.same("sac de test : un exemplaire de chaque", Object.keys(MARBLE_TYPES).sort(), [...STARTING_BAG].sort());
  run("usure par défaut", 3, maxWearOf("clay"));
  run("usure propre", 6, maxWearOf("mica"));
  run("usure 1 de la géante", 1, maxWearOf("giant"));
  run("usure de la loupe", 3, maxWearOf("magnifier"));

  const amount = (clauses) => clauses[0].amount;
  run("variante : œil-de-chat, base gauche", 3, amount(effectAt("cats_eye", "leftBase")));
  run("variante : œil-de-chat, base droite", "mass", effectAt("cats_eye", "rightBase")[0].action);
  run("variante : la base droite n'a pas la Vitesse de base", 0, printedStat(effectAt("cats_eye", "rightBase"), "speed"));
  run("sans variante : même effet sur les deux bases", effectAt("clay", "leftBase"), effectAt("clay", "rightBase"));
  run("pointe", 4, amount(effectAt("clay", "apex")));
  run("effet absent : aucun effet", 0, effectAt("shooter", "leftBase").length);
  run("effet absent : la même valeur partout", effectAt("shooter", "leftBase"), effectAt("stoneware", "apex"));

  run.same("Tic de l'argile", [{ action: "speed", amount: 2 }], MARBLE_TYPES.clay.hit);
  run.same("Tic de l'agate", [{ action: "mass", amount: 1 }], MARBLE_TYPES.agate.hit);
  run.same("Éjection du calot", [{ action: "speed", amount: 3 }], MARBLE_TYPES.shooter.knockout);
  run.same("Éjection de la plombée", [{ action: "mass", amount: 1 }], MARBLE_TYPES.leaded.knockout);

  run("imprimé : ce que la clause donne", 8, printedStat(effectAt("shooter", "apex"), "speed"));
  run("imprimé : une autre statistique ne compte pas", 0, printedStat(effectAt("agate", "apex"), "speed"));
  run("imprimé : négatif", -3, printedStat(effectAt("leaded", "apex"), "speed"));
  run("imprimé : une clause conditionnelle ne compte pas", 0, printedStat(effectAt("magnifier", "leftBase"), "speed"));

  const refused = (name, table) => run(`table refusée : ${name}`, true, throws(() => validateMarbleTypes(table)));
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
  run("table acceptée : une bille sans aucun effet", false, throws(() => validateMarbleTypes({ a: {} })));
  run("table acceptée : une variante", false, throws(() => validateMarbleTypes({ a: { baseVariant: { rightBase: [clause] } } })));
  run("table acceptée : valeur négative", false, throws(() => validateMarbleTypes({ a: { apex: [{ action: "mass", amount: -2 }] } })));
}

function checkSetup(run) {
  const game = createMarblesGame(42);
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

  run("sac : bille inconnue refusée", true, throws(() => createMarblesGame(1, { bag: ["clay", "nope"] })));
  run("réglages : première pioche plus petite que le triangle refusée", true, throws(() => createMarblesGame(1, { firstTurnDraw: 2 })));
  run("réglages : main plus petite que la première pioche refusée", true, throws(() => createMarblesGame(1, { maxHandSize: 4 })));
  run("réglages : pioche par tour nulle refusée", true, throws(() => createMarblesGame(1, { drawPerTurn: 0 })));
  const doubles = createMarblesGame(1, { bag: ["clay", "clay", "clay", "glass", "glass", "agate"] });
  run("sac : doublons acceptés", 3, doubles.bag.filter((id) => id === "clay").length);

  const fresh = createMarblesGame(42);
  run("action inconnue refusée", "unknownAction", marblesReduce(fresh, { type: "cheat" }).error);
  run("action sans type refusée", "unknownAction", marblesReduce(fresh, null).error);
}

function checkDraw(run) {
  const game = createMarblesGame(42);
  run("pioche obligatoire : pas de pose avant", "mustDraw", marblesReduce(game, { type: "place", handIndex: 0, slot: "apex" }).error);
  run("pioche obligatoire : pas d'échange avant", "mustDraw", marblesReduce(game, { type: "swap", a: "apex", b: "leftBase" }).error);
  run("pioche obligatoire : pas de résolution avant", "mustDraw", marblesReduce(game, { type: "resolve" }).error);

  const first = apply(game, { type: "draw" });
  run("pioche : 5 billes au premier tour", 5, first.state.hand.length);
  run("pioche : prend le haut du sac, dans l'ordre", game.bag.slice(0, 5).join(), first.state.hand.join());
  run("pioche : sac diminué", 8, first.state.bag.length);
  run.same("pioche : journal", ["turnStarted", "draw", "draw", "draw", "draw", "draw"], eventTypes(first.events));
  run("pioche : refusée une seconde fois", "alreadyDrawn", marblesReduce(first.state, { type: "draw" }).error);

  // Tours suivants : une seule bille, ajoutée à ce qui reste en main.
  const later = apply({ ...playState({ hand: ["clay", "glass", "agate"], bag: ["mica", "tiger", "giant"] }), stage: "draw" }, { type: "draw" });
  run("pioche : 1 bille aux tours suivants", "clay,glass,agate,mica", later.state.hand.join());
  run("pioche : le reste au sac", "tiger,giant", later.state.bag.join());
  run.same("pioche : journal du tour suivant", ["turnStarted", "draw"], eventTypes(later.events));

  // Main pleine : la pioche est sautée, la bille reste au sac.
  const fullHand = ["clay", "glass", "agate", "mica", "tiger"];
  const skipped = apply({ ...playState({ hand: fullHand, bag: ["giant", "shooter"] }), stage: "draw" }, { type: "draw" });
  run.same("main pleine : journal", ["turnStarted", "drawSkipped"], eventTypes(skipped.events));
  run("main pleine : motif", "handFull", skipped.events[1].reason);
  run("main pleine : main inchangée", fullHand.join(), skipped.state.hand.join());
  run("main pleine : la bille reste au sac", "giant,shooter", skipped.state.bag.join());
  run("main pleine : le tour se joue", "play", skipped.state.stage);
  const fullNoBag = apply({ ...playState({ hand: fullHand, bag: [], discard: ["giant"] }), stage: "draw" }, { type: "draw" });
  run("main pleine : pas de régénération, même sac vide", false, eventTypes(fullNoBag.events).includes("bagRegenerated"));
  run("main pleine : la partie continue, même défausse courte", "play", fullNoBag.state.stage);
  const almostFull = apply({ ...playState({ hand: fullHand.slice(0, 4), bag: ["giant", "shooter"] }), stage: "draw" }, { type: "draw" });
  run("main à 4 billes : la pioche passe", 5, almostFull.state.hand.length);

  // Une pioche de plusieurs billes s'arrête quand la main est pleine.
  const large = apply({ ...playState({ hand: fullHand.slice(0, 4), bag: ["giant", "shooter", "mica"], drawPerTurn: 3 }), stage: "draw" }, { type: "draw" });
  run.same("pioche de 3 : s'arrête à la main pleine", ["turnStarted", "draw", "drawSkipped"], eventTypes(large.events));
  run("pioche de 3 : le reste au sac", "shooter,mica", large.state.bag.join());

  // Régénération pendant la pioche : le mélange, puis la bille.
  const regen = apply({ ...playState({ hand: ["clay"], bag: [], discard: ["agate", "mica", "tiger", "giant"] }), stage: "draw" }, { type: "draw" });
  run.same("régénération : journal dans l'ordre", ["turnStarted", "bagRegenerated", "draw"], eventTypes(regen.events));
  run("régénération : taille annoncée", 4, regen.events[1].size);
  run("régénération : défausse vidée", 0, regen.state.discard.length);
  run("régénération : une bille piochée", 2, regen.state.hand.length);
  run("régénération : le reste au sac", 3, regen.state.bag.length);
  run("régénération : mêmes billes après coup", "agate,clay,giant,mica,tiger", [...regen.state.hand, ...regen.state.bag].sort().join());

  const midDraw = apply(
    { ...playState({ hand: [], bag: ["glass"], discard: ["agate", "mica", "tiger"], turn: 1 }), stage: "draw" },
    { type: "draw" }
  );
  run.same(
    "régénération en cours de pioche : ce qui restait d'abord",
    ["turnStarted", "draw", "bagRegenerated", "draw", "draw", "draw"],
    eventTypes(midDraw.events).slice(0, 6)
  );
  run("régénération en cours de pioche : la bille du sac en premier", "glass", midDraw.state.hand[0]);

  // Un sac qui se vide sans que la pioche demande une bille de plus ne régénère pas.
  const exact = apply({ ...playState({ hand: ["clay"], bag: ["mica"], discard: ["giant"] }), stage: "draw" }, { type: "draw" });
  run("pas de régénération sans bille demandée", false, eventTypes(exact.events).includes("bagRegenerated"));
  run("pas de régénération : sac vide", 0, exact.state.bag.length);
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

  run("échange : une seule fois par tour", "swapAlreadyUsed", marblesReduce(both.state, { type: "swap", a: "leftBase", b: "apex" }).error);
  run("échange : deux vides refusés", "swapBothEmpty", marblesReduce(playState({ triangle: triangleOf(clay, null, null) }), { type: "swap", a: "rightBase", b: "apex" }).error);
  run("échange : même emplacement refusé", "swapSameSlot", marblesReduce(playState({ triangle: triangleOf(clay, null, null) }), { type: "swap", a: "leftBase", b: "leftBase" }).error);
  run("échange : emplacement inconnu refusé", "invalidSlot", marblesReduce(playState(), { type: "swap", a: "leftBase", b: "top" }).error);

  // Un refus ne consomme rien : l'état rendu est l'état reçu.
  const state = playState({ triangle: triangleOf(clay, null, null) });
  run("refus : état inchangé", state, marblesReduce(state, { type: "swap", a: "rightBase", b: "apex" }).state);
  run.same("refus : journal vide", [], marblesReduce(state, { type: "swap", a: "rightBase", b: "apex" }).events);

  // L'ordre du tour : l'échange vient avant la pose.
  const afterPlace = apply(playState({ hand: ["agate"], triangle: triangleOf(clay, null, null) }), { type: "place", handIndex: 0, slot: "apex" });
  run("échange : refusé après une pose", "swapAfterPlacement", marblesReduce(afterPlace.state, { type: "swap", a: "leftBase", b: "apex" }).error);
  run("swapRefusal : disponible", null, swapRefusal(playState()));
  run("swapRefusal : même code que l'action", "swapAfterPlacement", swapRefusal(afterPlace.state));

  // L'échange revient au tour suivant.
  const nextTurn = apply({ ...both.state, stage: "draw", hand: [], bag: ["agate", "mica", "tiger", "sulphide", "stoneware"] }, { type: "draw" });
  run("échange : rendu par la pioche du tour suivant", null, swapRefusal(nextTurn.state));
  const placeThenDraw = apply({ ...afterPlace.state, stage: "draw", hand: [], bag: ["mica", "tiger", "sulphide", "stoneware", "shooter"] }, { type: "draw" });
  run("pose : l'échange revient au tour suivant", null, swapRefusal(placeThenDraw.state));
}

function checkPlace(run) {
  const onEmpty = apply(playState({ hand: ["clay", "glass"], triangle: triangleOf(null, null, null) }), { type: "place", handIndex: 1, slot: "apex" });
  run.same("pose : la bille va sur l'emplacement, usure 0", placed("glass"), onEmpty.state.triangle.apex);
  run("pose : quitte la main", "clay", onEmpty.state.hand.join());
  run.same("pose : journal", ["placed"], eventTypes(onEmpty.events));

  const replacing = apply(
    playState({ hand: ["clay"], triangle: triangleOf(null, null, placed("giant", 0)), discard: ["mica"] }),
    { type: "place", handIndex: 0, slot: "apex" }
  );
  run.same("remplacement : nouvelle bille à usure 0", placed("clay"), replacing.state.triangle.apex);
  run("remplacement : ancienne bille à la défausse", "mica,giant", replacing.state.discard.join());
  run("remplacement : journal nomme l'ancienne", "giant", replacing.events[0].marble);
  run.same(
    "remplacement : cause de la défausse",
    { type: "discarded", slot: "apex", marble: "giant", cause: "replacement" },
    replacing.events.find((event) => event.type === "discarded")
  );

  // Une bille usée qui revient repart à zéro : hors du triangle, elle n'est
  // plus qu'un id.
  const worn = apply(playState({ hand: ["agate"], triangle: triangleOf(placed("clay", 2), null, null) }), { type: "place", handIndex: 0, slot: "leftBase" });
  run("remplacement : aucune usure en défausse", "clay", worn.state.discard[0]);
  const back = apply(playState({ hand: ["clay"], triangle: triangleOf(null, null, null) }), { type: "place", handIndex: 0, slot: "leftBase" });
  run("une bille qui revient repart à usure 0", 0, back.state.triangle.leftBase.wear);

  run("pose : index hors main refusé", "invalidHandIndex", marblesReduce(playState({ hand: ["clay"] }), { type: "place", handIndex: 3, slot: "apex" }).error);
  run("pose : index non entier refusé", "invalidHandIndex", marblesReduce(playState({ hand: ["clay"] }), { type: "place", handIndex: "0", slot: "apex" }).error);
  run("pose : emplacement inconnu refusé", "invalidSlot", marblesReduce(playState({ hand: ["clay"] }), { type: "place", handIndex: 0, slot: "top" }).error);

  // Plusieurs poses dans le même tour.
  let many = playState({ hand: ["clay", "glass", "agate"] });
  many = apply(many, { type: "place", handIndex: 0, slot: "leftBase" }).state;
  many = apply(many, { type: "place", handIndex: 0, slot: "rightBase" }).state;
  many = apply(many, { type: "place", handIndex: 0, slot: "apex" }).state;
  run("pose : autant de billes que voulu", 0, many.hand.length);

  // Doublons : deux exemplaires, deux emplacements indépendants.
  let doubles = playState({ hand: ["clay", "clay"] });
  doubles = apply(doubles, { type: "place", handIndex: 0, slot: "leftBase" }).state;
  doubles = apply(doubles, { type: "place", handIndex: 0, slot: "apex" }).state;
  run("doublons : deux exemplaires posés", "clay,clay", [doubles.triangle.leftBase.marble, doubles.triangle.apex.marble].join());

  // Tour 1 : remplacer trop laisserait la partie sans issue (la main ne se
  // recomplète qu'au tour suivant).
  let firstTurn = playState({ turn: 1, hand: ["clay", "glass", "agate", "mica", "tiger"] });
  firstTurn = apply(firstTurn, { type: "place", handIndex: 0, slot: "apex" }).state;
  firstTurn = apply(firstTurn, { type: "place", handIndex: 0, slot: "apex" }).state;
  firstTurn = apply(firstTurn, { type: "place", handIndex: 0, slot: "apex" }).state;
  run("tour 1 : remplacement sans issue refusé", "placementBlocksTriangle", marblesReduce(firstTurn, { type: "place", handIndex: 0, slot: "apex" }).error);
  run("placeRefusal : même code que l'action", "placementBlocksTriangle", placeRefusal(firstTurn, 0, "apex"));
  run("tour 1 : remplir un vide reste permis", null, placeRefusal(firstTurn, 0, "leftBase"));
  run("placeRefusal : pose permise", null, placeRefusal(playState({ hand: ["clay"] }), 0, "apex"));
  const later = playState({ turn: 2, hand: ["clay"], triangle: triangleOf(null, null, placed("mica")) });
  run("tour 2 : le remplacement n'a plus de limite", null, placeRefusal(later, 0, "apex"));
}

// Le déroulé d'une pose, les compteurs du tour : Tic et Éjection.
function checkHitAndKnockout(run) {
  // Ordre sur un emplacement occupé : Éjection de B, retrait, défausse, pose de A, Tic de A.
  const state = playState({ hand: ["clay"], triangle: triangleOf(null, null, placed("shooter", 1)) });
  const both = apply(state, { type: "place", handIndex: 0, slot: "apex" });
  run.same(
    "pose sur occupé : ordre du journal",
    ["knockout", "effect", "removed", "discarded", "placed", "hit", "effect"],
    eventTypes(both.events)
  );
  run.same(
    "pose sur occupé : qui joue quoi",
    ["knockout:shooter", "effect:shooter", "removed:shooter", "discarded:shooter", "placed:clay", "hit:clay", "effect:clay"],
    both.events.map((event) => `${event.type}:${event.marble}`)
  );
  run.same(
    "Éjection : son effet et le cumul",
    { type: "effect", trigger: "knockout", slot: "apex", marble: "shooter", speedDelta: 3, massDelta: 0, given: [], speed: 3, mass: 1 },
    both.events[1]
  );
  run.same(
    "Tic : son effet et le cumul",
    { type: "effect", trigger: "hit", slot: "apex", marble: "clay", speedDelta: 2, massDelta: 0, given: [], speed: 5, mass: 1 },
    both.events[6]
  );

  // Les bons moments : au Tic, la nouvelle bille est là ; à l'Éjection, encore en main.
  const seenByKnockout = {
    witness: { knockout: [{ action: "speed", amount: 1, when: { type: "printedStat", slot: "apex", stat: "speed", atLeast: 5 } }], apex: [{ action: "speed", amount: 5 }] },
    arrival: { hit: [{ action: "mass", amount: 1, when: { type: "printedStat", slot: "apex", stat: "mass", atLeast: 2 } }], apex: [{ action: "mass", amount: 2 }] },
  };
  const moments = apply(playState({ hand: ["arrival"], triangle: triangleOf(null, null, placed("witness")) }), { type: "place", handIndex: 0, slot: "apex" }, seenByKnockout);
  run("Éjection : jouée avant le retrait de la bille", 1, moments.events.find((event) => event.trigger === "knockout").speedDelta);
  run("Tic : joué après l'arrivée de la bille", 1, moments.events.find((event) => event.trigger === "hit").massDelta);

  // Compteurs du tour, modifiés avant la résolution, et l'Impact en tient compte.
  run("compteurs : Vitesse du tour modifiée", 5, both.state.speed);
  run("compteurs : Masse du tour inchangée", 1, both.state.mass);
  const resolved = apply(both.state, { type: "resolve" });
  // 3 (Éjection du calot) + 2 (Tic de l'argile) + 4 (argile en pointe).
  run("compteurs : la résolution en part", 9, resolved.events.find((event) => event.type === "impact").impact);
  run("compteurs : remis à zéro après la résolution", "0,1", `${resolved.state.speed},${resolved.state.mass}`);

  // Masse : Éjection de la plombée +1, Tic de l'agate +1, agate en pointe +2, argile en base +1 de Vitesse.
  const massive = apply(playState({ hand: ["agate"], triangle: triangleOf(placed("clay"), null, placed("leaded")) }), { type: "place", handIndex: 0, slot: "apex" });
  run("Masse : Éjection et Tic", 3, massive.state.mass);
  const massImpact = apply(massive.state, { type: "resolve" }).events.find((event) => event.type === "impact");
  run.same("Masse : l'Impact en tient compte", { speed: 1, mass: 5, impact: 5 }, { speed: massImpact.speed, mass: massImpact.mass, impact: massImpact.impact });

  // Plusieurs poses : les compteurs s'accumulent.
  const twice = apply(apply(playState({ hand: ["clay", "agate"], triangle: triangleOf(placed("shooter"), placed("leaded"), null) }), { type: "place", handIndex: 0, slot: "leftBase" }).state, { type: "place", handIndex: 0, slot: "rightBase" });
  run("compteurs : deux poses, Vitesse", 5, twice.state.speed);
  run("compteurs : deux poses, Masse", 3, twice.state.mass);

  // Une bille sans Tic ni Éjection : les évènements passent, aucun effet.
  const plain = apply(playState({ hand: ["glass"], triangle: triangleOf(null, null, placed("mica")) }), { type: "place", handIndex: 0, slot: "apex" });
  run.same("sans Tic ni Éjection : aucun effet", ["knockout", "removed", "discarded", "placed", "hit"], eventTypes(plain.events));
  run("sans Tic ni Éjection : compteurs intacts", "0,1", `${plain.state.speed},${plain.state.mass}`);

  // Ni Tic ni Éjection ailleurs.
  const noReaction = (result) => eventTypes(result.events).filter((type) => type === "hit" || type === "knockout" || type === "effect");
  const onEmpty = apply(playState({ hand: ["clay"] }), { type: "place", handIndex: 0, slot: "apex" });
  run.same("pose sur vide : ni Tic ni Éjection", [], noReaction(onEmpty));
  const swapped = apply(playState({ triangle: triangleOf(placed("shooter"), placed("clay"), null) }), { type: "swap", a: "leftBase", b: "rightBase" });
  run.same("échange : ni Tic ni Éjection, même sur des billes qui en ont", [], noReaction(swapped));
  const worn = apply(playState({ triangle: triangleOf(null, null, placed("shooter", 2)) }), { type: "resolve" });
  run("retrait par usure : pas d'Éjection", false, eventTypes(worn.events).includes("knockout"));
  run("retrait par usure : Impact de la phase seule", 8, worn.state.score);
  run("retrait par usure : cause", "wear", worn.events.find((event) => event.type === "discarded").cause);

  // Un plancher ne vaut qu'à l'Impact : une Éjection négative pèse dans le compteur.
  const negative = { drain: { knockout: [{ action: "speed", amount: -5 }, { action: "mass", amount: -3 }] }, boost: { apex: [{ action: "speed", amount: 2 }] } };
  const drained = apply(playState({ hand: ["boost"], triangle: triangleOf(null, null, placed("drain")) }), { type: "place", handIndex: 0, slot: "apex" }, negative);
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

  const shooter = withApex("shooter");
  run("loupe : calot en pointe, Vitesse +12", 12, apexEffect(shooter).speedDelta);
  run("loupe : Impact 12", 12, shooter.state.score);
  run.same(
    "loupe : ce qu'elle donne, dans son effet",
    [{ slot: "apex", marble: "shooter", speed: 4, mass: 0 }],
    shooter.events.find((event) => event.slot === "leftBase" && event.type === "effect").given
  );
  run("loupe : rien pour elle-même", 0, shooter.events.find((event) => event.slot === "leftBase" && event.type === "effect").speedDelta);

  run("loupe : argile, 4 + 4", 8, apexEffect(withApex("clay")).speedDelta);
  run("loupe : une autre loupe en pointe, 2 + 4", 6, apexEffect(withApex("magnifier")).speedDelta);
  run("loupe : agate, aucun bonus", 0, apexEffect(withApex("agate")).speedDelta);
  run("loupe : agate garde sa Masse", 2, apexEffect(withApex("agate")).massDelta);
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
  const right = apply(playState({ triangle: triangleOf(null, placed("magnifier"), placed("shooter")) }), { type: "resolve" });
  run("loupe en base droite : Vitesse +1, pas de bonus", 9, right.state.score);
  const onApex = apply(playState({ triangle: triangleOf(null, null, placed("magnifier")) }), { type: "resolve" });
  run("loupe en pointe : Vitesse +2", 2, onApex.state.score);
}

// Le bonus, sur des billes fictives : ce que la table du jeu ne fait pas encore.
function checkBonus(run) {
  const toApex = (amount, action = "speed") => ({ action, amount, target: "apex" });
  const table = {
    plain: { apex: [{ action: "speed", amount: 1 }], base: [{ action: "speed", amount: 1 }] },
    giver: { hit: [toApex(2)], knockout: [toApex(3), toApex(1, "mass")] },
    late: { apex: [{ action: "speed", amount: 1, target: "leftBase" }] },
    both: { base: [{ action: "speed", amount: 5 }, toApex(2)] },
    conditional: { hit: [{ action: "speed", amount: 9, when: { type: "printedStat", slot: "apex", stat: "mass", atLeast: 1 } }] },
  };
  const act = (state, action) => apply(state, action, table);
  const resolveOf = (state) => act(state, { type: "resolve" });

  const hit = act(playState({ hand: ["giver"], triangle: triangleOf(placed("plain"), null, placed("plain")) }), { type: "place", handIndex: 0, slot: "leftBase" });
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

  const stacked = act(playState({ hand: ["plain"], triangle: triangleOf(placed("giver"), null, { ...placed("plain"), bonus: { speed: 1, mass: 0 } }) }), { type: "place", handIndex: 0, slot: "leftBase" });
  run.same("bonus : s'additionne, deux clauses", { speed: 4, mass: 1 }, stacked.state.triangle.apex.bonus);

  const toEmpty = act(playState({ hand: ["giver"], triangle: triangleOf(placed("plain"), null, null) }), { type: "place", handIndex: 0, slot: "leftBase" });
  run.same("bonus : emplacement vide, perdu", [], toEmpty.events.find((event) => event.trigger === "hit").given);
  run("bonus : emplacement vide, reste vide", null, toEmpty.state.triangle.apex);

  const swapped = act(playState({ triangle: triangleOf(null, placed("plain"), { ...placed("plain"), bonus: { speed: 2, mass: 0 } }) }), { type: "swap", a: "rightBase", b: "apex" });
  run.same("bonus : suit la bille dans un échange", { speed: 2, mass: 0 }, swapped.state.triangle.rightBase.bonus);
  const replaced = act(playState({ hand: ["plain"], triangle: triangleOf(null, null, { ...placed("plain"), bonus: { speed: 2, mass: 0 } }) }), { type: "place", handIndex: 0, slot: "apex" });
  run("bonus : perdu avec une bille remplacée", undefined, replaced.state.triangle.apex.bonus);

  const tooLate = resolveOf(playState({ triangle: triangleOf(placed("plain"), null, placed("late")) }));
  run("bonus : après la phase de la cible, sans effet sur l'Impact", 1, tooLate.state.score);
  run("bonus : après la phase de la cible, ne survit pas au tour", undefined, tooLate.state.triangle.apex.bonus);

  const mixed = resolveOf(playState({ triangle: triangleOf(placed("both"), null, placed("plain")) }));
  const mixedEffect = mixed.events.find((event) => event.slot === "leftBase" && event.type === "effect");
  run("clauses mêlées : la part pour elle-même", 5, mixedEffect.speedDelta);
  run("clauses mêlées : la part donnée", 2, mixedEffect.given[0].speed);

  // Condition fausse : l'effet se joue, sans rien donner.
  const noMass = act(playState({ hand: ["conditional"], triangle: triangleOf(null, null, placed("plain")) }), { type: "place", handIndex: 0, slot: "leftBase" });
  run("condition fausse : pas d'effet du tout sur un vide", false, eventTypes(noMass.events).includes("effect"));
  const falseCondition = act(playState({ hand: ["conditional"], triangle: triangleOf(placed("plain"), null, placed("plain")) }), { type: "place", handIndex: 0, slot: "leftBase" });
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
  // Argile en base (Vitesse +1), Verre en base (Masse +1), Agate en pointe (Masse +2).
  const impact = result.events.find((event) => event.type === "impact");
  run.same("résolution : Vitesse 1, Masse 4, Impact 4", { type: "impact", speed: 1, mass: 4, impact: 4, score: 4 }, impact);
  run("résolution : le Score cumule", 4, result.state.score);
  run("résolution : le tour avance", 3, result.state.turn);
  run("résolution : la pioche suivante reste à faire", "draw", result.state.stage);

  const second = apply(playState({ score: 10, triangle: triangleOf(placed("clay"), placed("glass"), placed("agate")) }), { type: "resolve" });
  run("Impact ajouté au Score", 14, second.state.score);

  const effect = result.events.find((event) => event.type === "effect" && event.slot === "rightBase");
  run.same(
    "effet : deltas et cumul",
    { type: "effect", trigger: "phase", slot: "rightBase", marble: "glass", speedDelta: 0, massDelta: 1, given: [], speed: 1, mass: 2 },
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
    "retrait : après l'Impact, avant la rotation",
    ["impact", "removed", "discarded", "rotation", "turnEnded"],
    eventTypes(last.events).slice(-5)
  );

  const giant = apply(playState({ triangle: triangleOf(null, null, placed("giant")) }), { type: "resolve" });
  run("géante : joue puis part dès le premier tour", 6, giant.state.score);
  run("géante : retirée", "giant", giant.state.discard.join());

  const porcelain = apply(playState({ triangle: triangleOf(null, null, placed("porcelain", 1)) }), { type: "resolve" });
  run("porcelaine : retirée à usure 2", "porcelain", porcelain.state.discard.join());
  const mica = apply(playState({ triangle: triangleOf(null, null, placed("mica", 4)) }), { type: "resolve" });
  run("mica : pas retiré à usure 5 sur 6", 0, mica.state.discard.length);

  const twoRetired = apply(playState({ triangle: triangleOf(placed("giant"), placed("clay", 2), placed("glass")) }), { type: "resolve" });
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

  // Tour 1 : triangle plein exigé ; ensuite, zéro pose permise.
  const firstTurn = apply(createMarblesGame(7), { type: "draw" }).state;
  run("tour 1 : résolution refusée, triangle vide", "triangleIncomplete", marblesReduce(firstTurn, { type: "resolve" }).error);
  let partial = apply(firstTurn, { type: "place", handIndex: 0, slot: "apex" }).state;
  partial = apply(partial, { type: "place", handIndex: 0, slot: "leftBase" }).state;
  run("tour 1 : résolution refusée, triangle incomplet", "triangleIncomplete", marblesReduce(partial, { type: "resolve" }).error);
  partial = apply(partial, { type: "place", handIndex: 0, slot: "rightBase" }).state;
  run("tour 1 : résolution permise, triangle plein", true, marblesReduce(partial, { type: "resolve" }).ok);

  const empty = apply(playState(), { type: "resolve" });
  run("tour 2 : zéro pose et triangle vide, Impact 0", 0, empty.events.find((event) => event.type === "impact").impact);
  run("tour 2 : Score inchangé", 0, empty.state.score);
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
  run("fin : plus aucune action", "gameOver", marblesReduce(lastTurn.state, { type: "draw" }).error);
  run("fin : plus de résolution", "gameOver", marblesReduce(lastTurn.state, { type: "resolve" }).error);
  run("fin : plus d'échange", "gameOver", swapRefusal(lastTurn.state));
  run("fin : plus de pose", "gameOver", placeRefusal(lastTurn.state, 0, "apex"));

  // Sac régénéré de moins de 3 billes.
  const small = apply(
    { ...playState({ score: 12, hand: ["clay"], bag: [], discard: ["agate", "mica"] }), stage: "draw" },
    { type: "draw" }
  );
  run("sac régénéré < 3 : partie finie", "over", small.state.stage);
  run("sac régénéré < 3 : motif", "bagExhausted", small.state.endReason);
  run.same(
    "sac régénéré < 3 : journal",
    ["turnStarted", "bagRegenerated", "gameOver"],
    eventTypes(small.events)
  );
  run("sac régénéré < 3 : taille annoncée", 2, small.events[1].size);
  run("sac régénéré < 3 : score compté", 12, small.events[2].score);
  run("sac régénéré < 3 : rien de perdu", 3, marbleCount(small.state));

  const exactly = apply(
    { ...playState({ hand: ["clay", "glass"], bag: [], discard: ["agate", "mica", "tiger"] }), stage: "draw" },
    { type: "draw" }
  );
  run("sac régénéré de 3 billes : la partie continue", "play", exactly.state.stage);
  run("sac régénéré de 3 billes : une bille piochée", 3, exactly.state.hand.length);

  // Sac trop petit dès le départ : jamais de partie bloquée au tour 1.
  const tiny = apply(createMarblesGame(1, { bag: ["clay", "glass"] }), { type: "draw" });
  run("sac de 2 billes : partie finie dès la pioche", "bagExhausted", tiny.state.endReason);
  run("sac de 5 billes : la partie se joue", "play", apply(createMarblesGame(1, { bag: ["clay", "glass", "agate", "mica", "tiger"] }), { type: "draw" }).state.stage);
}

// Une partie complète, décisions fixes : toujours la première bille sur les
// emplacements vides, un échange au tour 3. Rend état et journal.
function scriptedGame(seed) {
  let state = createMarblesGame(seed);
  const journal = [];
  const step = (action) => {
    const result = apply(state, action);
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
  const frozen = deepFreeze(apply(createMarblesGame(5), { type: "draw" }).state);
  run("pureté : pose sur un état figé", false, throws(() => apply(frozen, { type: "place", handIndex: 0, slot: "apex" })));
  run("pureté : résolution sur un état figé", false, throws(() => marblesReduce(deepFreeze(playState({ triangle: triangleOf(placed("clay"), null, placed("giant")) })), { type: "resolve" })));
  run("pureté : pioche sur un état figé", false, throws(() => apply(deepFreeze({ ...playState({ hand: [], bag: [], discard: ["clay", "glass", "agate", "mica", "tiger"] }), stage: "draw" }), { type: "draw" })));
}

function checkSerialization(run) {
  // Aller-retour JSON à chaque action : la partie rejouée à travers la
  // sérialisation doit finir exactement comme l'originale.
  const original = scriptedGame(99);
  let state = createMarblesGame(99);
  const journal = [];
  let findings = [];
  const step = (action) => {
    const result = apply(JSON.parse(JSON.stringify(state)), action);
    auditNonSerializable(result.state, "state", new Set(), findings);
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
  let state = createMarblesGame(seed, options);
  const total = marbleCount(state);
  const faults = [];
  let score = 0;
  let actions = 0;

  const verify = (result) => {
    state = result.state;
    actions += 1;
    for (const event of result.events) seenTypes.add(event.type);
    if (marbleCount(state) !== total) faults.push(`billes : ${marbleCount(state)} au lieu de ${total}`);
    if (state.score < 0) faults.push(`score négatif : ${state.score}`);
    if (state.score < score) faults.push(`score en baisse : ${score} -> ${state.score}`);
    score = state.score;
    if (state.hand.length > state.maxHandSize) faults.push(`main trop grande : ${state.hand.length}`);
    if (state.stage !== "play" && (state.speed !== 0 || state.mass !== 1)) faults.push(`compteurs non remis à zéro : ${state.speed}, ${state.mass}`);
    if (state.turn > state.turnCount) faults.push(`tour hors bornes : ${state.turn}`);
    for (const slot of SLOTS) {
      const placedHere = state.triangle[slot];
      if (placedHere !== null && placedHere.wear >= maxWearOf(placedHere.marble) && state.stage === "draw") {
        faults.push(`bille à usure maximale restée sur le triangle : ${placedHere.marble}`);
      }
      if (placedHere?.bonus !== undefined && state.stage !== "play") faults.push(`bonus resté après la résolution : ${placedHere.marble}`);
    }
  };

  // Borne large : une partie sans issue la dépasserait, et serait signalée.
  while (state.stage !== "over" && actions < 2000) {
    if (state.stage === "draw") {
      verify(marblesReduce(state, { type: "draw" }));
      continue;
    }
    switch (pick(6)) {
      case 0:
        verify(marblesReduce(state, { type: "swap", a: SLOTS[pick(3)], b: SLOTS[pick(3)] }));
        break;
      case 1:
      case 2:
      case 3:
        verify(marblesReduce(state, { type: "place", handIndex: pick(state.maxHandSize), slot: SLOTS[pick(3)] }));
        break;
      default:
        verify(marblesReduce(state, { type: "resolve" }));
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
    { bag: ["mica"] },
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
    "bagRegenerated,discarded,draw,drawSkipped,effect,gameOver,hit,impact,knockout,phase,phaseSkipped,placed,removed,rotation,swapped,turnEnded,turnStarted,wear",
    [...seen].sort().join()
  );
}
