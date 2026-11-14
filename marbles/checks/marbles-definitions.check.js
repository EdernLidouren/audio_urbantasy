// Vérifications des DÉFINITIONS DE PARTIE du jeu des billes (marbles/core/definitions.js) :
// leur validation, leur copie dans l'état, la source du sac (fourni ou tiré), et ce
// que les outils en font (surcharges, recherche par id). Lancées par
// core/checks/index.js/runChecks (`node tools/run-checks.js marbles-definitions`).

import { throws } from "../../lib/check.js";
import { NO_STATUSES, endTurn, ordinaryInstances, ruleInstance, ruleInstances, useCharges } from "../core/statuses.js";
import { applyStatus as gain } from "../content/effects.js";
import { createSeed } from "../../lib/rng.js";
import { randomBag, startingList, tierOf, turnLimit, turnsHeld } from "../core/definitions.js";
import { validateGameDefinition, validateGameDefinitions } from "../core/validation.js";
import { createMarblesRules } from "../core/rules.js";
import { DEFAULT_GAME_DEFINITION, GAME_RULES, definitionById, gameSetup, withSettings } from "../tools/game-rules.js";
import { FIXTURE_BAG, FIXTURE_DEFINITION, FIXTURE_STATUSES, FIXTURE_TYPES, fixtureRules } from "./fixtures/marbles.js";
import { caughtMessage, eventTypes, forecastMatches, inHand, marblesPlayState, mustReduce, overState, placed, playRandomMarblesGame, triangleOf, withSizes } from "./helpers.js";

const rules = fixtureRules();

export default function checkMarblesDefinitions(run) {
  run.section("validation", checkValidation);
  run.section("état", checkState);
  run.section("sac de départ", checkBag);
  run.section("objectifs : validation", checkGoalValidation);
  run.section("partie libre", checkFree);
  run.section("cible", checkTarget);
  run.section("endurance", checkEndurance);
  run.section("règles", checkRules);
  run.section("outils", checkTools);
  run.section("définitions du jeu, invariants", checkGameDefinitions);
}

// CHAQUE DÉFINITION DU JEU (marbles/content/definitions/) jouée au hasard, avec les
// vraies billes et les vrais statuts : les invariants habituels (helpers.js/
// playRandomMarblesGame), aucune action verrouillée acceptée, un résultat juste.
function checkGameDefinitions(run) {
  for (const definition of Object.values(GAME_RULES.definitions)) {
    const setup = gameSetup(definition);
    const played = { ...GAME_RULES, createGame: (seed) => GAME_RULES.createGame(seed, setup.definition, setup.options) };
    const faults = [];
    for (let seed = 1; seed <= 6; seed++) faults.push(...playRandomMarblesGame(played, seed, {}, new Set()).map((fault) => `graine ${seed} : ${fault}`));
    run.same(`${definition.id} : aucune anomalie`, [], faults.slice(0, 3));
  }
}

// LES RÈGLES : des statuts de la table, posés au début, verrouillés, d'origine « règle ».
function checkRules(run) {
  const refused = (rulesList) => throws(() => validateGameDefinition({ ...FIXTURE_DEFINITION, rules: rulesList }, FIXTURE_TYPES, FIXTURE_STATUSES));
  run("validation : une règle valide", false, refused(["pot_game"]));
  run("validation : statut inconnu refusé", true, refused(["nope"]));
  run("validation : en double refusée", true, refused(["pot_game", "pot_game"]));
  run("validation : un statut en tours refusé", true, refused(["gain_add"]));
  run("validation : un statut en charges refusé", true, refused(["gain_charge"]));
  run("validation : sans table des statuts, inconnue", true, throws(() => validateGameDefinition({ ...FIXTURE_DEFINITION, rules: ["pot_game"] }, FIXTURE_TYPES)));

  const made = fixtureRules(withSizes({ giver: { flick: [gain("pot_game")] }, plain: {} }), FIXTURE_STATUSES);
  const game = made.createGame(1, { bag: ["plain", "plain", "plain"], rules: ["pot_game", "throw_react"] });
  run.same("au départ : les règles, dans l'ordre, verrouillées, d'origine « règle »", [ruleInstance("pot_game"), ruleInstance("throw_react")], game.statuses);
  run("au départ : origine « règle »", "rule", game.statuses[0].origin.trigger);
  run("au départ : appliquées dès le début (pot +1)", FIXTURE_DEFINITION.start.potCapacity + 1, made.characteristic(game, "potCapacity"));
  run("au départ : aucun évènement, aucune valeur de partie", 0, game.tally.statusesReceived.game);
  run.same("touche A : absentes des statuts ordinaires", [], ordinaryInstances(game.statuses));
  run("touche O : les règles", 2, ruleInstances(game.statuses).length);

  // Un effet qui donne le même statut : sans effet, la règle reste telle quelle.
  const played = mustReduce(made, overState(marblesPlayState(made, { hand: inHand(["giver"]), rules: ["pot_game"] }), { statuses: [ruleInstance("pot_game")] }), { type: "place", handIndex: 0, slot: "apex" });
  const unchanged = played.events.find((event) => event.type === "statusUnchanged");
  run("renforcer : impossible, dit sans effet", true, unchanged?.locked === true);
  run.same("renforcer : la règle intacte", [ruleInstance("pot_game")], played.state.statuses);
  run("renforcer : rien de reçu ni de renforcé", false, played.events.some((event) => ["statusGained", "statusStrengthened"].includes(event.type)));
  // Ni charges consommées, ni fin de tour : une règle ne s'use jamais.
  run.same("charges : jamais consommées", [ruleInstance("pot_game")], useCharges([ruleInstance("pot_game")], FIXTURE_STATUSES, ["pot_game"]).instances);
  run.same("fin de tour : jamais", { instances: [ruleInstance("pot_game")], expired: [] }, endTurn([ruleInstance("pot_game")], FIXTURE_STATUSES));
  // Une réaction de règle joue comme celle d'un statut.
  const reacting = mustReduce(made, overState(marblesPlayState(made, { hand: inHand(["plain"]) }), { statuses: [ruleInstance("throw_react")] }), { type: "place", handIndex: 0, slot: "apex" });
  run("réaction d'une règle : elle joue", true, reacting.events.some((event) => event.type === "statusReaction" && event.status === "throw_react"));
  run("prévision : une règle comprise", true, forecastMatches(made, overState(marblesPlayState(made, { hand: inHand(["plain"]) }), { statuses: [ruleInstance("throw_react")] }), { type: "place", handIndex: 0, slot: "apex" }));
}

// Une résolution qui fait un Impact de 1 (la bille sur la base gauche), ou de 0
// (triangle vide), depuis un état de jeu de la définition de test, champs remplacés.
const ONE = triangleOf(placed("aging_flick"), null, null);
const resolveFrom = (over) => mustReduce(rules, marblesPlayState(rules, over), { type: "resolve" });
const drawFrom = (over) => mustReduce(rules, { ...marblesPlayState(rules, { hand: inHand([]), bag: [], discard: [], ...over }), stage: "draw" }, { type: "draw" });

function checkGoalValidation(run) {
  const refused = (over) => throws(() => validateGameDefinition({ ...FIXTURE_DEFINITION, ...over }, FIXTURE_TYPES));
  run("libre : paliers absents refusés", true, refused({ goal: { kind: "free" } }));
  run("libre : palier manquant refusé", true, refused({ goal: { kind: "free", tiers: { bronze: 1, silver: 2 } } }));
  run("libre : paliers non croissants refusés", true, refused({ goal: { kind: "free", tiers: { bronze: 5, silver: 5, gold: 9 } } }));
  run("libre : sans limite de tours refusé", true, refused({ turns: null }));
  run("cible : score nul refusé", true, refused({ goal: { kind: "target", score: 0 } }));
  run("cible : valide", false, refused({ goal: { kind: "target", score: 50 }, turns: 8 }));
  run("cible : sans limite de tours refusée", true, refused({ goal: { kind: "target", score: 50 }, turns: null }));
  run("endurance : minimum nul refusé", true, refused({ goal: { kind: "endurance", minimum: 0 } }));
  run("endurance : sans limite de tours permise", false, refused({ goal: { kind: "endurance", minimum: 5 }, turns: null }));
  run("endurance : champ d'un autre objectif refusé", true, refused({ goal: { kind: "endurance", minimum: 5, score: 3 } }));
}

// LIBRE : le palier selon le score, dit quand il est franchi ; la partie va au bout.
function checkFree(run) {
  const tiers = FIXTURE_DEFINITION.goal.tiers;
  run.same("palier : chaque seuil", ["none", "bronze", "bronze", "silver", "gold"], [tiers.bronze - 1, tiers.bronze, tiers.silver - 1, tiers.silver, tiers.gold + 100].map((score) => tierOf(score, tiers)));
  const crossing = resolveFrom({ score: tiers.bronze - 1, triangle: ONE });
  run.same("palier franchi : dit juste après l'Impact", ["impact", "tierReached"], eventTypes(crossing.events).filter((type) => ["impact", "tierReached"].includes(type)));
  run("palier franchi : le palier", "bronze", crossing.events.find((event) => event.type === "tierReached").tier);
  run("palier non franchi : rien", false, resolveFrom({ score: 0, triangle: ONE }).events.some((event) => event.type === "tierReached"));
  const last = resolveFrom({ turn: 10, score: tiers.silver, triangle: ONE });
  run.same("dernier tour : le résultat", { goal: "free", end: "lastTurn", score: tiers.silver + 1, tier: "silver" }, last.state.result);
  run.same("pioche impossible : le palier du score", { goal: "free", end: "noMarbles", score: tiers.bronze, tier: "bronze" }, drawFrom({ score: tiers.bronze }).state.result);
}

// CIBLE : victoire dès que le score l'atteint, échec au dernier tour sans l'avoir.
function checkTarget(run) {
  const goal = { kind: "target", score: 5 };
  const reached = resolveFrom({ goal, turns: 8, turn: 2, score: 4, triangle: ONE });
  run("atteinte : la partie s'arrête aussitôt", "over", reached.state.stage);
  run.same("atteinte : victoire", { goal: "target", end: "targetReached", score: 5, outcome: "victory" }, reached.state.result);
  run.same("atteinte : la résolution se finit comme au dernier tour", ["impact", "rotation", "turnEnded", "gameOver"], eventTypes(reached.events).slice(-4));
  run("atteinte : le tour reste celui de la victoire", 2, reached.state.turn);
  run("pas atteinte : la partie continue", "draw", resolveFrom({ goal, turns: 8, turn: 2, score: 3, triangle: ONE }).state.stage);
  run("atteinte au dernier tour : victoire", "victory", resolveFrom({ goal, turns: 8, turn: 8, score: 4, triangle: ONE }).state.result.outcome);
  run.same("dernier tour sans l'atteindre : échec", { goal: "target", end: "lastTurn", score: 4, outcome: "defeat" }, resolveFrom({ goal, turns: 8, turn: 8, score: 3, triangle: ONE }).state.result);
  run.same("pioche impossible : échec", { goal: "target", end: "noMarbles", score: 2, outcome: "defeat" }, drawFrom({ goal, turns: 8, score: 2 }).state.result);
}

// ENDURANCE : l'Impact doit atteindre le minimum à chaque tour ; arrêt au premier tour
// raté, succès au nombre de tours s'il y en a un.
function checkEndurance(run) {
  const goal = { kind: "endurance", minimum: 1 };
  const held = resolveFrom({ goal, turns: null, turn: 3, triangle: ONE });
  run("tour tenu : la partie continue", "draw", held.state.stage);
  run("tour tenu : tours tenus après lui", 3, turnsHeld(held.state));
  run("en cours de tour : les tours finis", 2, turnsHeld(marblesPlayState(rules, { goal, turns: null, turn: 3 })));
  const missed = resolveFrom({ goal, turns: null, turn: 3 });
  run.same("tour raté : arrêt, les tours tenus avant lui", { goal: "endurance", end: "impactMissed", score: 0, held: 2, outcome: "ended" }, missed.state.result);
  run("tour raté : sans limite, aucun nombre de tours annoncé", null, rules.reduce({ ...marblesPlayState(rules, { goal, turns: null }), stage: "draw", bag: ["aging_flick"] }, { type: "draw" }).events[0].turnCount);
  run.same("nombre de tours atteint : succès", { goal: "endurance", end: "lastTurn", score: 1, held: 5, outcome: "success" }, resolveFrom({ goal, turns: 5, turn: 5, triangle: ONE }).state.result);
  run("dernier tour raté : pas de succès", "impactMissed", resolveFrom({ goal, turns: 5, turn: 5 }).state.result.end);
  run.same("pioche impossible : les tours tenus avant", { goal: "endurance", end: "noMarbles", score: 0, held: 3, outcome: "ended" }, drawFrom({ goal, turns: null, turn: 4 }).state.result);
}

// Une définition mal formée échoue, avec un message qui dit pourquoi.
function checkValidation(run) {
  const valid = (definition) => !throws(() => validateGameDefinition(definition, FIXTURE_TYPES, NO_STATUSES));
  const refused = (over) => !valid({ ...FIXTURE_DEFINITION, ...over });
  run("la définition de test est valide", true, valid(FIXTURE_DEFINITION));
  run("champ inconnu refusé", true, refused({ extra: 1 }));
  run("id absent refusé", true, refused({ id: "" }));
  run("valeur de départ inconnue refusée", true, refused({ start: { ...FIXTURE_DEFINITION.start, speed: 1 } }));
  run("valeur de départ absente refusée", true, refused({ start: { ...FIXTURE_DEFINITION.start, throws: undefined } }));
  run("main nulle refusée", true, refused({ start: { ...FIXTURE_DEFINITION.start, handSize: 0 } }));
  run("pot de capacité 0 permis", false, refused({ start: { ...FIXTURE_DEFINITION.start, potCapacity: 0 } }));
  run("main plus petite que la première pioche refusée", true, refused({ start: { ...FIXTURE_DEFINITION.start, handSize: 4 } }));
  run("tours nuls refusés", true, refused({ turns: 0 }));
  run("objectif inconnu refusé", true, refused({ goal: { kind: "nope" } }));
  run("source de sac inconnue refusée", true, refused({ bag: { kind: "nope" } }));
  run("sac du joueur : sans règles propres permis", false, refused({ bag: { kind: "player" } }));
  run("sac du joueur : règles propres permises", false, refused({ bag: { kind: "player", buildRules: { size: { min: 15, max: 15 } } } }));
  run("sac du joueur : une règle retirée (null) permise", false, refused({ bag: { kind: "player", buildRules: { copies: null } } }));
  run("sac du joueur : règle inconnue refusée", true, refused({ bag: { kind: "player", buildRules: { nope: {} } } }));
  run("sac du joueur : règle mal formée refusée", true, refused({ bag: { kind: "player", buildRules: { size: { min: 5, max: 2 } } } }));
  run("sac du joueur : champ inconnu refusé", true, refused({ bag: { kind: "player", marbles: [] } }));
  run("sac imposé : sans registre de sacs, inconnu", true, refused({ bag: { kind: "preset", bag: "starter" } }));
  run(
    "sac imposé : un sac du registre permis",
    true,
    !throws(() => validateGameDefinition({ ...FIXTURE_DEFINITION, bag: { kind: "preset", bag: "mine" } }, FIXTURE_TYPES, NO_STATUSES, { mine: { id: "mine", marbles: [] } }))
  );
  run("sac tiré : taille nulle refusée", true, refused({ bag: { kind: "random", size: 0, maxCopies: null } }));
  run("sac tiré : impossible avec la limite d'exemplaires", true, refused({ bag: { kind: "random", size: 100, maxCopies: 1 } }));
  run("sac tiré : sans limite permis", false, refused({ bag: { kind: "random", size: 30, maxCopies: null } }));
  run("le message nomme la définition", true, caughtMessage(() => validateGameDefinition({ ...FIXTURE_DEFINITION, turns: 0 }, FIXTURE_TYPES)).includes('"fixture"'));
  run("registre : une définition doit porter son id", true, throws(() => validateGameDefinitions({ other: FIXTURE_DEFINITION }, FIXTURE_TYPES)));
  run("registre : valide", false, throws(() => validateGameDefinitions({ fixture: FIXTURE_DEFINITION }, FIXTURE_TYPES)));
  run("règles : un registre invalide refusé à la composition", true, throws(() => createMarblesRules(FIXTURE_TYPES, NO_STATUSES, { fixture: { ...FIXTURE_DEFINITION, turns: -1 } })));
  run("création : une définition invalide refusée", true, throws(() => rules.createGame(1, { turns: 0 })));
}

// L'état porte une copie de sa définition, qui ne bouge plus.
function checkState(run) {
  const game = rules.createGame(5);
  run.same("copie de la définition dans l'état", FIXTURE_DEFINITION, game.definition);
  run("la copie n'est pas l'objet reçu", false, game.definition === FIXTURE_DEFINITION);
  run("aucune ancienne valeur de départ en haut de l'état", true, ["maxHandSize", "throwsPerTurn", "potCapacity", "firstTurnDraw", "drawPerTurn", "turnCount"].every((key) => !Object.hasOwn(game, key)));
  run("caractéristiques lues dans la définition", "5,5,3", ["throws", "handSize", "potCapacity"].map((key) => rules.characteristic(game, key)).join());
  run("tours lus dans la définition", 7, turnLimit(rules.createGame(5, { turns: 7 })));
  const drawn = rules.reduce(rules.createGame(5, { firstTurnDraw: 2 }), { type: "draw" }).state;
  run("pioche du premier tour lue dans la définition", 2, drawn.hand.length);
  run("annonce du début de tour : le nombre de tours de la définition", 7, rules.reduce(rules.createGame(5, { turns: 7 }), { type: "draw" }).events[0].turnCount);
}

// Les billes de départ : celles du sac reçu, dans l'ordre de sa composition (puis
// mélangées par la partie), ou un tirage déterministe par sa propre graine.
function checkBag(run) {
  const received = { id: "x", marbles: [{ marble: "a", count: 2 }, { marble: "b", count: 1 }] };
  run.same("sac reçu : ses exemplaires dans l'ordre de sa composition, avant le mélange", ["a", "a", "b"], startingList({ bag: { kind: "player" } }, 1, FIXTURE_TYPES, received));
  const random = { bag: { kind: "random", size: 8, maxCopies: 1 } };
  const bagOf = (seed) => [...rules.createGame(seed, random).bag].sort().join();
  run("tirage : même graine, même sac", bagOf(3), bagOf(3));
  run("tirage : la bonne taille", 8, rules.createGame(3, random).bag.length);
  run("tirage : la limite d'exemplaires tenue", true, new Set(rules.createGame(3, random).bag).size === 8);
  run("tirage : deux graines, deux sacs", true, [1, 2, 3, 4, 5].some((seed) => bagOf(seed) !== bagOf(seed + 10)));
  run.same(
    "tirage : celui du simulateur (même algorithme, même graine)",
    randomBag({ size: 5, maxCopies: null }, createSeed("x"), ["a", "b", "c"]),
    randomBag({ size: 5, maxCopies: null }, createSeed("x"), ["a", "b", "c"])
  );
  // Le tirage n'entame pas le hasard de la partie : le même mélange qu'une liste.
  const listed = rules.createGame(9, { bag: FIXTURE_BAG });
  run("tirage : le hasard de la partie reste celui de sa graine", rules.createGame(9).rngState, listed.rngState);
}

// Ce que les outils font d'une définition.
function checkTools(run) {
  run("par id : la définition du registre", DEFAULT_GAME_DEFINITION, definitionById(DEFAULT_GAME_DEFINITION.id));
  run("par id : inconnue refusée, avec la liste", true, caughtMessage(() => definitionById("nope")).includes(DEFAULT_GAME_DEFINITION.id));
  const changed = withSettings(DEFAULT_GAME_DEFINITION, { handSize: 7, turns: 4 });
  run("surcharge : valeur de départ", 7, changed.start.handSize);
  run("surcharge : tours", 4, changed.turns);
  run("surcharge : la définition reçue intacte", false, DEFAULT_GAME_DEFINITION.start.handSize === 7 || DEFAULT_GAME_DEFINITION.turns === 4);
  run("surcharge : nom inconnu refusé", true, throws(() => withSettings(DEFAULT_GAME_DEFINITION, { maxHandSize: 7 })));
  run(
    "chaque définition du jeu se joue",
    true,
    Object.values(GAME_RULES.definitions).every((definition) => {
      const setup = gameSetup(definition);
      return GAME_RULES.reduce(GAME_RULES.createGame(1, setup.definition, setup.options), { type: "draw" }).ok;
    })
  );
}
