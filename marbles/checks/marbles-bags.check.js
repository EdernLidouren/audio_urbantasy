// Vérifications des SACS du jeu des billes (marbles/core/bags.js) : leur format, les
// règles de construction et leur validation, la source de sac d'une partie, la copie
// de partie, le résultat rendu à l'hôte (marbles/core/outcome.js), et l'hôte lui-même
// (marbles/host/ : fournisseur de collection, magasins des emplacements, point
// d'entrée), la gestion des sacs du joueur (marbles/core/bag-editing.js), la relecture
// d'un sac sauvegardé, et le menu du choix du sac ; l'éditeur se joue au clavier dans
// le domaine marbles-bag-editor. Sur la table figée des vérifications ; les vrais
// sacs préfaits et les vrais textes : domaine marbles-content. Lancées par
// core/checks/index.js/runChecks (`node tools/run-checks.js marbles-bags`).

import { throws } from "../../lib/check.js";
import { BAG_BUILD_RULES, BAG_SLOTS } from "../config/values.js";
import {
  BAG_PROBLEMS,
  BUILD_RULE_KINDS,
  bagFromList,
  bagMarbles,
  bagProblems,
  bagSize,
  emptyBagSlots,
  repairBagRecord,
  slotBagId,
  slotIndexOf,
  mergeBuildRules,
  validateBagFormat,
  validateBuildRules,
  validatePresetBags,
  withBagSlot,
} from "../core/bags.js";
import { createMarblesRules } from "../core/rules.js";
import { marblesOutcome, turnsPlayed } from "../core/outcome.js";
import { NO_STATUSES } from "../core/statuses.js";
import { catalogCollection, listCollection } from "../host/collection.js";
import { createBagStore, createMemoryBagStore } from "../host/bag-store.js";
import { BAG_EDIT_REFUSALS, addMarble, bagStatus, copyBagToSlot, createEmptyBag, deleteBag, duplicateBag, emptySlotIndexes, removeMarble, sameComposition, storeBag } from "../core/bag-editing.js";
import { createMarblesLauncher } from "../host/entry.js";
import { createBagMenu } from "../view/bag-menu.js";
import { bagName, describeBagProblem, describeBagRefusal, describeLaunchRefusal, slotLineKey } from "../view/narration/bags.js";
import { FIXTURE_DEFINITION, FIXTURE_STATUSES, FIXTURE_TYPES, deepFreeze } from "./fixtures/marbles.js";
import { caughtMessage, createPicker, keyText, marbleCount } from "./helpers.js";

// Une table de raretés pour les règles : seul le champ `rarity` y sert.
const RARITY_TYPES = { c: { rarity: "common" }, u: { rarity: "uncommon" }, r: { rarity: "rare" }, e: { rarity: "epic" }, l: { rarity: "legendary" } };

// Un sac de la table des vérifications, d'après ses entrées [bille, exemplaires].
function bagOf(id, entries) {
  return { id, marbles: entries.map(([marble, count]) => ({ marble, count })) };
}

// Des sacs préfaits de la table des vérifications, valides selon les règles par
// défaut : 12 billes communes, 3 exemplaires au plus.
const PRESETS = deepFreeze({
  four: bagOf("four", [
    ["aging_flick", 3],
    ["hit_polish", 3],
    ["final_pocket", 3],
    ["hit_pocket", 3],
  ]),
  mixed: bagOf("mixed", [
    ["fragile", 2],
    ["base_pocket", 2],
    ["awaken_draw", 2],
    ["all_rounder", 2],
    ["split_base", 2],
    ["size_count", 2],
  ]),
});

// Les règles de la table des vérifications, avec ces sacs préfaits.
const rules = createMarblesRules(FIXTURE_TYPES, FIXTURE_STATUSES, {}, PRESETS);

// La définition de test, avec un sac du joueur aux règles par défaut, ou `bag`.
function definitionWith(bag = { kind: "player" }, over = {}) {
  return { ...FIXTURE_DEFINITION, ...over, bag };
}

export default function checkMarblesBags(run) {
  run.section("format", checkFormat);
  run.section("règles de construction", checkBuildRules);
  run.section("problèmes", checkProblems);
  run.section("sacs préfaits", checkPresets);
  run.section("source du sac", checkSources);
  run.section("copie de partie", checkCopy);
  run.section("résultat", checkOutcome);
  run.section("emplacements et magasin", checkSlots);
  run.section("hôte", checkHost);
  run.section("vue", checkView);
  run.section("gestion", checkEditing);
  run.section("relecture", checkRepair);
}

// Un sac bien formé, ou une erreur claire.
function checkFormat(run) {
  const valid = (bag) => !throws(() => validateBagFormat(bag));
  run("un sac préfait (sans nom) valide", true, valid(PRESETS.four));
  run("un sac du joueur (avec son nom) valide", true, valid({ ...PRESETS.four, name: "Mon sac" }));
  run("un sac vide bien formé", true, valid({ id: "empty", marbles: [] }));
  run("champ inconnu refusé", false, valid({ ...PRESETS.four, owner: "x" }));
  run("id vide refusé", false, valid({ ...PRESETS.four, id: "" }));
  run("nom vide refusé", false, valid({ ...PRESETS.four, name: " " }));
  run("marbles absent refusé", false, valid({ id: "x" }));
  run("exemplaires nuls refusés", false, valid(bagOf("x", [["aging_flick", 0]])));
  run("exemplaires non entiers refusés", false, valid(bagOf("x", [["aging_flick", 1.5]])));
  run("entrée à champ inconnu refusée", false, valid({ id: "x", marbles: [{ marble: "aging_flick", count: 1, wear: 2 }] }));
  run("une bille en double refusée", false, valid(bagOf("x", [["aging_flick", 1], ["aging_flick", 2]])));
  run("le message nomme le sac", true, caughtMessage(() => validateBagFormat(bagOf("named", [["aging_flick", 0]]))).includes('"named"'));
  run("taille : tous les exemplaires", 12, bagSize(PRESETS.four));
  run.same("billes : chaque exemplaire, dans l'ordre de la composition", ["a", "a", "b"], bagMarbles(bagOf("x", [["a", 2], ["b", 1]])));
  run.same("d'après une liste : doublons regroupés à leur première apparition", bagOf("x", [["b", 2], ["a", 1]]), bagFromList("x", ["b", "a", "b"]));
}

// Les règles de construction : leur forme, leur fusion avec celles par défaut.
function checkBuildRules(run) {
  const valid = (rulesToCheck, options) => !throws(() => validateBuildRules(rulesToCheck, (message) => { throw new Error(message); }, options));
  run("les règles par défaut sont valides", true, valid(BAG_BUILD_RULES));
  run("règles par défaut : la taille, 12 à 20", "12-20", `${BAG_BUILD_RULES.size.min}-${BAG_BUILD_RULES.size.max}`);
  run.same("règles par défaut : exemplaires par rareté", { common: 3, uncommon: 3, rare: 2, epic: 2, legendary: 1 }, BAG_BUILD_RULES.copies);
  run("sorte inconnue refusée", false, valid({ family: {} }));
  run("taille : min au-dessus de max refusé", false, valid({ size: { min: 5, max: 4 } }));
  run("taille : champ inconnu refusé", false, valid({ size: { min: 1, max: 4, exact: 2 } }));
  run("exemplaires : une rareté manquante refusée", false, valid({ copies: { common: 1 } }));
  run("exemplaires : zéro refusé", false, valid({ copies: { ...BAG_BUILD_RULES.copies, rare: 0 } }));
  run("null refusé hors d'une définition", false, valid({ size: null }));
  run("null permis dans une définition (retirer une sorte)", true, valid({ size: null }, { allowNull: true }));
  run("chaque sorte se déclare avec validate et check", true, Object.values(BUILD_RULE_KINDS).every((kind) => typeof kind.validate === "function" && typeof kind.check === "function"));

  const base = { size: { min: 12, max: 20 }, copies: BAG_BUILD_RULES.copies };
  run.same("fusion : rien, les règles par défaut", base, mergeBuildRules(base));
  run.same("fusion : une sorte donnée remplace celle par défaut", { size: { min: 15, max: 15 }, copies: base.copies }, mergeBuildRules(base, { size: { min: 15, max: 15 } }));
  run.same("fusion : null retire une sorte", { copies: base.copies }, mergeBuildRules(base, { size: null }));
  run.same("fusion : une sorte nouvelle s'ajoute", { size: base.size }, mergeBuildRules({}, { size: base.size }));
  run("fusion : la base intacte", 12, base.size.min);
  run.same("une définition : ses règles propres complètent celles par défaut", { size: { min: 15, max: 15 }, copies: BAG_BUILD_RULES.copies }, rules.buildRulesOf(definitionWith({ kind: "player", buildRules: { size: { min: 15, max: 15 } } })));
  run.same("une définition qui impose son sac : aucune règle", {}, rules.buildRulesOf(definitionWith({ kind: "preset", bag: "four" })));
}

// Chaque problème, ses paramètres, leur ordre ; un sac valide n'en a aucun.
function checkProblems(run) {
  const problems = (entries, over = {}) => bagProblems(bagOf("x", entries), over.rules ?? BAG_BUILD_RULES, { types: over.types ?? RARITY_TYPES, unlocked: over.unlocked ?? null });
  const twelve = [["c", 3], ["u", 3], ["r", 2], ["e", 2], ["l", 1], ["c2", 1]];
  const types = { ...RARITY_TYPES, c2: { rarity: "common" } };
  run.same("un sac valide : aucun problème", [], problems(twelve, { types }));
  run.same("trop petit", [{ code: "bagTooSmall", size: 10, min: 12 }], problems([["c", 3], ["u", 3], ["r", 2], ["e", 2]]));
  run.same("trop grand", [{ code: "bagTooLarge", size: 22, max: 20 }], bagProblems(bagOf("x", Array.from({ length: 22 }, (_, index) => [`m${index}`, 1])), BAG_BUILD_RULES, { types: Object.fromEntries(Array.from({ length: 22 }, (_, index) => [`m${index}`, { rarity: "common" }])) }));
  run.same("trop d'exemplaires, selon la rareté", [{ code: "tooManyCopies", marble: "l", count: 2, max: 1 }], problems([...twelve.slice(0, 4), ["l", 2]], { types }));
  run.same("bille inconnue", [{ code: "unknownMarble", marble: "nope" }], problems([...twelve, ["nope", 1]], { types: { ...types }, rules: {} }));
  run.same("bille non débloquée", [{ code: "lockedMarble", marble: "l" }], problems(twelve, { types, unlocked: ["c", "u", "r", "e", "c2"] }));
  run.same("sans collection (null) : tout est débloqué", [], problems(twelve, { types, unlocked: null }));
  run.same("une collection en Set", [{ code: "lockedMarble", marble: "c2" }], problems(twelve, { types, unlocked: new Set(["c", "u", "r", "e", "l"]) }));
  // L'ordre : inconnues et non débloquées dans l'ordre du sac, puis chaque sorte de
  // règle (taille, exemplaires), ses problèmes dans l'ordre du sac.
  run.same(
    "ordre : billes d'abord, puis la taille, puis les exemplaires",
    ["unknownMarble:nope", "lockedMarble:u", "bagTooLarge", "tooManyCopies:r", "tooManyCopies:l"],
    problems([["nope", 1], ["c", 3], ["u", 3], ["r", 9], ["l", 7]], { unlocked: ["c", "r", "l"] }).map((problem) => (problem.marble === undefined ? problem.code : `${problem.code}:${problem.marble}`))
  );
  run.same("une bille inconnue échappe aux règles d'exemplaires", ["unknownMarble"], problems([["nope", 9]], { rules: { copies: BAG_BUILD_RULES.copies } }).map((problem) => problem.code));
  run.same("sans règle : seules les billes comptent", [], problems([["c", 50]], { rules: {} }));
  run.same("chaque code a sa place dans BAG_PROBLEMS", true, ["unknownMarble", "lockedMarble", "bagTooSmall", "bagTooLarge", "tooManyCopies"].every((code) => BAG_PROBLEMS.includes(code)));
  run("règles propres d'une définition : la taille exacte prise en compte", true, rules.bagProblems(PRESETS.four, definitionWith({ kind: "player", buildRules: { size: { min: 15, max: 15 } } })).some((problem) => problem.code === "bagTooSmall"));
  run.same("règles propres d'une définition : une sorte retirée ne compte plus", [], rules.bagProblems(bagOf("x", [["aging_flick", 9]]), definitionWith({ kind: "player", buildRules: { size: null, copies: null } })));
}

// Le registre des sacs préfaits : validé à la composition des règles.
function checkPresets(run) {
  run("les sacs de test sont valides", false, throws(() => validatePresetBags(PRESETS, FIXTURE_TYPES, BAG_BUILD_RULES)));
  run("registre : un sac doit porter son id", true, throws(() => validatePresetBags({ other: PRESETS.four }, FIXTURE_TYPES, BAG_BUILD_RULES)));
  run("registre : un sac préfait n'a pas de nom propre", true, throws(() => validatePresetBags({ four: { ...PRESETS.four, name: "Quatre" } }, FIXTURE_TYPES, BAG_BUILD_RULES)));
  run("registre : un sac invalide refusé, ses problèmes dits", true, caughtMessage(() => validatePresetBags({ tiny: bagOf("tiny", [["aging_flick", 1]]) }, FIXTURE_TYPES, BAG_BUILD_RULES)).includes("bagTooSmall"));
  run("registre : une bille inconnue refusée", true, throws(() => validatePresetBags({ odd: bagOf("odd", [["nope", 12]]) }, FIXTURE_TYPES, BAG_BUILD_RULES)));
  run("règles : un registre invalide refusé à la composition", true, throws(() => createMarblesRules(FIXTURE_TYPES, NO_STATUSES, {}, { tiny: bagOf("tiny", [["aging_flick", 1]]) })));
  run("règles : le registre exposé", PRESETS, rules.bags);
}

// Les trois sources de sac : du joueur (validé), imposé, généré.
function checkSources(run) {
  const start = (definition, options) => rules.startGame(4, definition, options);
  // Sac du joueur.
  const player = start(definitionWith(), { bag: PRESETS.four });
  run("joueur : un sac valide, la partie démarre", true, player.ok && player.state !== null);
  run.same("joueur : aucun problème", [], player.problems);
  const tiny = start(definitionWith(), { bag: bagOf("tiny", [["aging_flick", 3]]) });
  run("joueur : un sac invalide, la partie refuse de démarrer", false, tiny.ok);
  run("joueur : aucun état pour une partie refusée", null, tiny.state);
  run.same("joueur : la liste des problèmes", [{ code: "bagTooSmall", size: 3, min: 12 }], tiny.problems);
  run.same(
    "joueur : la collection consultée",
    [{ code: "lockedMarble", marble: "hit_pocket" }],
    start(definitionWith(), { bag: PRESETS.four, unlocked: ["aging_flick", "hit_polish", "final_pocket"] }).problems
  );
  run("joueur : les règles propres de la définition", false, start(definitionWith({ kind: "player", buildRules: { size: { min: 15, max: 15 } } }), { bag: PRESETS.four }).ok);
  run("joueur : hors règles (outils), un petit sac joué", true, start(definitionWith(), { bag: bagOf("tiny", [["aging_flick", 3]]), unchecked: true }).ok);
  run.same("joueur : hors règles, une bille inconnue reste refusée", [{ code: "unknownMarble", marble: "nope" }], start(definitionWith(), { bag: bagOf("odd", [["nope", 1]]), unchecked: true }).problems);
  run("joueur : sans sac, une erreur (de programmation)", true, throws(() => start(definitionWith(), {})));
  run("joueur : un sac mal formé, une erreur", true, throws(() => start(definitionWith(), { bag: bagOf("x", [["aging_flick", 0]]) })));
  run("créer : un sac invalide lève, ses problèmes dans le message", true, caughtMessage(() => rules.createGame(4, definitionWith(), { bag: bagOf("tiny", [["aging_flick", 3]]) })).includes("bagTooSmall"));
  // Sac imposé : ni collection ni règles de construction.
  const preset = start(definitionWith({ kind: "preset", bag: "mixed" }), { unlocked: [] });
  run("imposé : la partie démarre, sans consulter la collection", true, preset.ok);
  run("imposé : le sac préfait", "mixed", preset.state.bagOrigin.id);
  run("imposé : un sac fourni en plus, une erreur", true, throws(() => start(definitionWith({ kind: "preset", bag: "mixed" }), { bag: PRESETS.four })));
  run("imposé : un sac préfait inconnu refusé", true, throws(() => start(definitionWith({ kind: "preset", bag: "nope" }), {})));
  // Sac généré.
  const random = start(definitionWith({ kind: "random", size: 9, maxCopies: 1 }), {});
  run("généré : la partie démarre", true, random.ok);
  run.same("généré : aucun sac reçu, sa taille", { id: null, size: 9 }, random.state.bagOrigin);
  run("généré : un sac fourni en plus, une erreur", true, throws(() => start(definitionWith({ kind: "random", size: 9, maxCopies: 1 }), { bag: PRESETS.four })));
}

// Joue une partie au hasard jusqu'à sa fin, par des actions légales (`pick`, le
// tirage du test) ; ce qui s'y est passé : billes empochées, perdues, défaussées.
function playToEnd(state, seed) {
  const pick = createPicker(seed);
  let current = state;
  const seen = { pocketed: 0, lost: 0, discarded: 0 };
  for (let count = 0; current.stage !== "over" && count < 2000; count++) {
    const legal = rules.legalActions(current);
    const result = rules.reduce(current, legal[pick(legal.length)]);
    current = result.state;
    seen.pocketed = Math.max(seen.pocketed, current.tally.pocketedMarbles.game);
    seen.lost = Math.max(seen.lost, current.tally.lostMarbles.game);
    seen.discarded = Math.max(seen.discarded, current.tally.discardedMarbles.game);
  }
  return { state: current, seen };
}

// La copie de partie : une instance par exemplaire, rien ne remonte au sac reçu.
function checkCopy(run) {
  const composition = (state) => {
    const all = [...state.bag, ...state.hand.map((held) => held.marble), ...state.discard, ...state.pot, ...state.lost, ...Object.values(state.triangle).filter((placed) => placed !== null).map((placed) => placed.marble)];
    return all.sort().join();
  };
  const fresh = rules.createGame(9, definitionWith(), { bag: PRESETS.mixed });
  run("copie : la composition exacte du sac", bagMarbles(PRESETS.mixed).sort().join(), composition(fresh));
  run.same("copie : l'origine, id et taille du sac", { id: "mixed", size: 12 }, fresh.bagOrigin);
  run("copie : mélangée par la graine de la partie", true, [1, 2, 3].some((seed) => rules.createGame(seed, definitionWith(), { bag: PRESETS.mixed }).bag.join() !== bagMarbles(PRESETS.mixed).join()));
  run("copie : sérialisable (JSON aller-retour)", JSON.stringify(fresh), JSON.stringify(JSON.parse(JSON.stringify(fresh))));

  // Des parties complètes, petit pot (des billes perdues) : le sac fourni, GELÉ (toute
  // écriture lèverait), reste strictement le même ; la composition se conserve.
  const given = deepFreeze(structuredClone(PRESETS.four));
  const before = JSON.stringify(given);
  const seen = { pocketed: 0, lost: 0, discarded: 0 };
  let conserved = true;
  let ended = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const start = rules.createGame(seed, definitionWith({ kind: "player" }, { start: { ...FIXTURE_DEFINITION.start, potCapacity: 1 } }), { bag: given });
    const played = playToEnd(start, seed);
    if (played.state.stage === "over") ended += 1;
    if (marbleCount(played.state) !== bagSize(given) || composition(played.state) !== bagMarbles(given).sort().join()) conserved = false;
    for (const key of Object.keys(seen)) seen[key] += played.seen[key];
  }
  run("parties complètes : toutes finies", 12, ended);
  run("parties complètes : des billes empochées, perdues et défaussées", true, seen.pocketed > 0 && seen.lost > 0 && seen.discarded > 0);
  run("parties complètes : le sac fourni strictement inchangé", before, JSON.stringify(given));
  run("parties complètes : chaque exemplaire conservé, toutes zones réunies", true, conserved);
}

// Le résultat rendu à l'hôte : complet, sérialisable, abandon compris.
function checkOutcome(run) {
  const finished = (definition, seed = 3) => playToEnd(rules.createGame(seed, definition, definition.bag.kind === "player" ? { bag: PRESETS.four } : {}), seed).state;
  const free = finished(definitionWith());
  const outcome = marblesOutcome(free);
  run.same(
    "complet : chaque champ, dans l'ordre",
    ["definition", "bag", "goal", "end", "outcome", "tier", "score", "turnsPlayed", "bagSize", "values"],
    Object.keys(outcome)
  );
  run.same("sérialisable : JSON aller-retour identique", outcome, JSON.parse(JSON.stringify(outcome)));
  run.same("identités : définition, sac, objectif", ["fixture", "four", "free"], [outcome.definition, outcome.bag, outcome.goal]);
  run("partie libre : l'issue est un palier", "tier", outcome.outcome);
  run("partie libre : le palier de la partie", free.result.tier, outcome.tier);
  run("score final", free.score, outcome.score);
  run("taille du sac", 12, outcome.bagSize);
  run("tours joués : tous, à la fin par le dernier tour", free.result.end === "lastTurn" ? FIXTURE_DEFINITION.turns : outcome.turnsPlayed, outcome.turnsPlayed);
  run.same("valeurs de partie : leurs noms", ["thrown", "drawn", "pocketed", "lost", "ejected", "discarded"], Object.keys(outcome.values));
  run("valeurs de partie : lues dans le registre", free.tally.thrownMarbles.game, outcome.values.thrown);

  const target = marblesOutcome(finished(definitionWith({ kind: "player" }, { goal: { kind: "target", score: 10_000 } })));
  run.same("cible : échec, sans palier", { outcome: "defeat", tier: undefined }, { outcome: target.outcome, tier: target.tier });
  const won = marblesOutcome(finished(definitionWith({ kind: "player" }, { goal: { kind: "target", score: 1 } }), 5));
  run.same("cible : victoire, finie par la cible", { outcome: "victory", end: "targetReached" }, { outcome: won.outcome, end: won.end });
  const endurance = marblesOutcome(finished(definitionWith({ kind: "player" }, { goal: { kind: "endurance", minimum: 10_000 }, turns: null })));
  run.same("endurance : les tours tenus", { outcome: "ended", held: 0 }, { outcome: endurance.outcome, held: endurance.held });

  // Abandon : en cours de partie, au premier tour joué.
  const started = rules.reduce(rules.createGame(2, definitionWith(), { bag: PRESETS.four }), { type: "draw" }).state;
  const quit = marblesOutcome(started);
  run.same("abandon : issue et fin", { end: "abandon", outcome: "abandoned" }, { end: quit.end, outcome: quit.outcome });
  run("abandon : ni palier, ni tours tenus", true, !("tier" in quit) && !("held" in quit));
  run("abandon : aucun tour résolu", 0, quit.turnsPlayed);
  run.same("abandon : complet et sérialisable", quit, JSON.parse(JSON.stringify(quit)));
  run("abandon : à la pioche d'un tour suivant, les tours d'avant", 3, turnsPlayed({ ...started, turn: 4, stage: "draw" }));
  run("fin faute de billes : le tour de la pioche n'est pas joué", 4, turnsPlayed({ ...started, turn: 5, stage: "over", result: { end: "noMarbles" } }));
}

// Les emplacements du joueur et les magasins.
function checkSlots(run) {
  run("emplacements : leur nombre, un réglage", 5, BAG_SLOTS);
  run.same("emplacements : tous vides au départ", [null, null, null, null, null], emptyBagSlots());
  const filled = withBagSlot(emptyBagSlots(), 1, PRESETS.four);
  run("emplacement : rangé", "four", filled[1].id);
  run("emplacement : une copie, pas le sac reçu", false, filled[1] === PRESETS.four);
  run("emplacement : hors des emplacements refusé", true, throws(() => withBagSlot(emptyBagSlots(), 5, PRESETS.four)));
  run("emplacement : un sac mal formé refusé", true, throws(() => withBagSlot(emptyBagSlots(), 0, { id: "" })));
  run.same("id d'emplacement : slot-1 à slot-5", ["slot-1", "slot-5"], [slotBagId(0), slotBagId(4)]);
  run.same("id d'emplacement : relu, ou null pour un sac préfait", [0, 4, null, null], [slotIndexOf("slot-1"), slotIndexOf("slot-5"), slotIndexOf("starter"), slotIndexOf(null)]);

  const store = createMemoryBagStore();
  run("magasin : des sacs du joueur", true, store.available());
  run("magasin : BAG_SLOTS emplacements vides", "5:true", `${store.slots().length}:${store.slots().every((slot) => slot === null)}`);
  const mine = { id: "slot-3", marbles: [{ marble: "aging_flick", count: 3 }] };
  store.saveSlots(withBagSlot(store.slots(), 2, mine));
  run.same("magasin : lu tel qu'enregistré", mine, store.slots()[2]);
  store.slots()[2].marbles.push({ marble: "x", count: 1 });
  run("magasin : une lecture est une copie", 1, store.slots()[2].marbles.length);
  run("magasin : aucun dernier sac au départ", null, store.lastUsed());
  store.setLastUsed("slot-3");
  run("magasin : le dernier sac utilisé", "slot-3", store.lastUsed());
  run("magasin : des emplacements mal formés refusés", true, throws(() => store.saveSlots([{ id: "x", marbles: [{ marble: "a", count: 0 }] }])));
  run("magasin : de départ, d'après une liste", "four", createMemoryBagStore({ count: 2, initial: [null, PRESETS.four] }).slots()[1].id);
  // Un magasin sur une lecture et une écriture reçues (le jeu : la sauvegarde).
  let record = null;
  const external = createBagStore({ read: () => record, write: (next) => (record = next) });
  run("magasin reçu : sans données, aucun sac du joueur", false, external.available());
  run("magasin reçu : lire sans données lève", true, throws(() => external.slots()));
  record = { slots: emptyBagSlots(), lastUsed: null };
  external.saveSlots(withBagSlot(external.slots(), 0, { id: "slot-1", marbles: [] }));
  run("magasin reçu : l'écriture passe par `write`", "slot-1", record.slots[0].id);
}

// Le fournisseur de collection et le point d'entrée.
function checkHost(run) {
  run.same("collection provisoire : tout le catalogue", Object.keys(FIXTURE_TYPES), catalogCollection(FIXTURE_TYPES).unlockedMarbles());
  run.same("collection d'une liste", ["a"], listCollection(["a"]).unlockedMarbles());

  // Un lanceur sur un faux écran : il garde ce qu'on lui ouvre.
  const opened = [];
  const launch = createMarblesLauncher({ rules, openGame: (state, onClose) => opened.push({ state, onClose }) });
  const results = [];
  const accepted = launch({ definition: definitionWith(), bag: PRESETS.four, collection: catalogCollection(FIXTURE_TYPES), seed: 6, onEnd: (result) => results.push(result) });
  run("entrée : un sac valide, l'écran ouvert", "true:1", `${accepted.ok}:${opened.length}`);
  run("entrée : la partie de ce sac", "four", opened[0].state.bagOrigin.id);
  opened[0].onClose(opened[0].state);
  opened[0].onClose(opened[0].state);
  run("sortie : le résultat rendu une seule fois", 1, results.length);
  run("sortie : un abandon (partie quittée avant la fin)", "abandoned", results[0].outcome);
  const refused = launch({ definition: definitionWith(), bag: bagOf("tiny", [["aging_flick", 3]]), collection: catalogCollection(FIXTURE_TYPES), seed: 6 });
  run.same("entrée : un sac invalide refusé, avec ses problèmes", { ok: false, problems: [{ code: "bagTooSmall", size: 3, min: 12 }] }, refused);
  run("entrée : rien d'ouvert pour un sac refusé", 1, opened.length);
  run("entrée : la collection du fournisseur", "lockedMarble", launch({ definition: definitionWith(), bag: PRESETS.four, collection: listCollection([]), seed: 6 }).problems[0].code);
  run("entrée : un sac imposé, sans sac fourni", true, launch({ definition: definitionWith({ kind: "preset", bag: "mixed" }), collection: listCollection([]), seed: 6 }).ok);
}

// Ce que la vue dit des sacs (lus par leurs clés : keyText), et le menu du choix du
// sac au lancement.
function checkView(run) {
  run("problème : son gabarit et ses paramètres", "bagProblem.bagTooSmall{size: 10, min: 12}", describeBagProblem({ code: "bagTooSmall", size: 10, min: 12 }, keyText));
  run("problème : une bille connue par sa référence", "bagProblem.tooManyCopies{marble: <aging_flick>, count: 4, max: 3}", describeBagProblem({ code: "tooManyCopies", marble: "aging_flick", count: 4, max: 3 }, keyText));
  run("problème : une bille inconnue par son id", "bagProblem.unknownMarble{marble: nope}", describeBagProblem({ code: "unknownMarble", marble: "nope" }, keyText));
  run("refus : la phrase et ses problèmes", true, describeBagRefusal([{ code: "unknownMarble", marble: "nope" }], keyText).startsWith("bagProblem.refused{problems: bagProblem.unknownMarble"));
  run("nom : un sac du joueur, d'après son emplacement", "bagSlot.name{slot: 2}", bagName({ id: "slot-2", marbles: [] }, keyText));
  run("nom : un nom donné l'emporte", "Mon sac", bagName({ id: "slot-2", name: "Mon sac", marbles: [] }, keyText));
  run("emplacement vide : sa ligne", "myBags.slot_empty", slotLineKey(null, false).replace("marbles.", ""));
  run("emplacement : valide ou invalide", "marbles.myBags.slot_valid,marbles.myBags.slot_invalid", [slotLineKey(PRESETS.four, true), slotLineKey(PRESETS.four, false)].join());
  run("lancement : premier problème et total", "bagMenu.refused{problem: bagProblem.bagTooSmall{size: 3, min: 12}, total: 2}", describeLaunchRefusal([{ code: "bagTooSmall", size: 3, min: 12 }, { code: "unknownMarble", marble: "x" }], keyText));

  // Le menu du choix du sac : les sacs du joueur (occupés), puis les préfaits, puis
  // Retour ; le curseur sur le dernier sac utilisé s'il est valide.
  const store = createMemoryBagStore({ initial: [{ id: "slot-1", marbles: [["aging_flick", 3]].map(([marble, count]) => ({ marble, count })) }, null, { ...PRESETS.mixed, id: "slot-3" }, null, null] });
  const chosen = [];
  const menuOf = () => createBagMenu({ store, rules, definition: definitionWith(), unlocked: null, onChoose: (bag) => chosen.push(bag.id), t: keyText });
  let menu = menuOf();
  run.same(
    "menu : les sacs du joueur, puis les préfaits, puis Retour",
    ["marbles.bagMenu.line_invalid", "marbles.bagMenu.line", "marbles.bagMenu.line", "marbles.bagMenu.line", "marbles.bagMenu.back"],
    menu.entries.map((entry) => entry.label)
  );
  run("menu : fermable (Échap)", true, menu.closable);
  run("menu : sans dernier sac, le curseur sur le premier sac valide", 1, menu.cursor);
  store.setLastUsed("mixed");
  run("menu : le curseur sur le dernier sac utilisé", 3, menuOf().cursor);
  store.setLastUsed("slot-1");
  run("menu : un dernier sac devenu invalide, le premier valide", 1, menuOf().cursor);
  menu = menuOf();
  run("menu : un sac valide referme le menu avant de lancer", true, menu.entries[1].closesMenu === true && menu.entries[0].closesMenu === undefined);
  menu.entries[1].onActivate();
  run.same("menu : le sac choisi", ["slot-3"], chosen);
  const noSave = createBagMenu({ store: createBagStore({ read: () => null, write: () => {} }), rules, definition: definitionWith(), unlocked: null, onChoose: () => {}, t: keyText });
  run("menu sans sauvegarde : les sacs préfaits seuls", 3, noSave.entries.length);
  run("menu : Retour en dernier", "marbles.bagMenu.back", menu.entries.at(-1).label);
}

// LA GESTION DES SACS DU JOUEUR (marbles/core/bag-editing.js) : chaque opération et
// chaque refus.
function checkEditing(run) {
  const context = { types: FIXTURE_TYPES, rules: BAG_BUILD_RULES, unlocked: null };
  const slots = emptyBagSlots();
  // Créer, copier, dupliquer, supprimer.
  const created = createEmptyBag(slots, 0);
  run.same("créer : un sac vide, l'id de son emplacement, sans nom", { id: "slot-1", marbles: [] }, created.slots[0]);
  run.same("créer : les emplacements reçus intacts", emptyBagSlots(), slots);
  run.same("créer : dans un emplacement occupé, refusé", { ok: false, error: "slotOccupied", slot: 0 }, createEmptyBag(created.slots, 0));
  run("créer : hors des emplacements, une erreur", true, throws(() => createEmptyBag(slots, 9)));
  const copied = copyBagToSlot(created.slots, 2, PRESETS.four);
  run.same("copier un préfait : sa composition, l'id de l'emplacement", { id: "slot-3", marbles: PRESETS.four.marbles }, copied.slots[2]);
  run("copier : le préfait intact", "four", PRESETS.four.id);
  run.same("copier : dans un emplacement occupé, refusé", { ok: false, error: "slotOccupied", slot: 2 }, copyBagToSlot(copied.slots, 2, PRESETS.mixed));
  const named = withBagSlot(copied.slots, 2, { ...copied.slots[2], name: "Mon sac" });
  const duplicated = duplicateBag(named, 2, 4);
  run.same("dupliquer : la composition, l'id et le nom générique de la destination", { id: "slot-5", marbles: PRESETS.four.marbles }, duplicated.slots[4]);
  run.same("dupliquer : un emplacement vide refusé", { ok: false, error: "slotEmpty", slot: 1 }, duplicateBag(named, 1, 3));
  run.same("dupliquer : vers un emplacement occupé, refusé", { ok: false, error: "slotOccupied", slot: 0 }, duplicateBag(named, 2, 0));
  run.same("emplacements vides : leurs indices", [1, 3], emptySlotIndexes(duplicated.slots));
  run("supprimer : vidé", null, deleteBag(duplicated.slots, 4).slots[4]);
  run.same("supprimer : un emplacement vide refusé", { ok: false, error: "slotEmpty", slot: 1 }, deleteBag(duplicated.slots, 1));
  run("enregistrer : dans son emplacement", 9, storeBag(duplicated.slots, 2, { id: "slot-3", marbles: [{ marble: "aging_flick", count: 9 }] }).slots[2].marbles[0].count);
  run("enregistrer : un sac d'un autre emplacement, une erreur", true, throws(() => storeBag(duplicated.slots, 2, { id: "slot-1", marbles: [] })));

  // Ajouter : par la validation existante, avec ses refus.
  const empty = { id: "slot-1", marbles: [] };
  const one = addMarble(empty, "aging_flick", context);
  run.same("ajouter : un exemplaire", { ok: true, bag: { id: "slot-1", marbles: [{ marble: "aging_flick", count: 1 }] }, count: 1 }, one);
  run("ajouter : le sac reçu intact", 0, empty.marbles.length);
  const three = bagOf("slot-1", [["aging_flick", 3]]);
  run.same("ajouter : le maximum de sa rareté atteint, refusé", { ok: false, error: "maxCopies", marble: "aging_flick", max: 3 }, addMarble(three, "aging_flick", context));
  const full = bagOf("slot-1", ["aging_flick", "hit_polish", "final_pocket", "hit_pocket", "split_base", "fragile", "flick_strike"].map((marble, index) => [marble, index === 6 ? 2 : 3]));
  run("taille maximale : 20 billes", 20, bagSize(full));
  run.same("ajouter : la taille maximale atteinte, refusé", { ok: false, error: "bagFull", size: 20, max: 20 }, addMarble(full, "one_shot", context));
  run.same("ajouter : la taille avant les exemplaires", "bagFull", addMarble(full, "aging_flick", context).error);
  run.same("ajouter : une bille inconnue, refusé", { ok: false, error: "unknownMarble", marble: "nope" }, addMarble(empty, "nope", context));
  run.same("ajouter : une bille non débloquée, refusé", { ok: false, error: "lockedMarble", marble: "one_shot" }, addMarble(empty, "one_shot", { ...context, unlocked: ["aging_flick"] }));
  run("ajouter : un sac déjà trop grand (relu) refuse tout ajout", "bagFull", addMarble(bagOf("slot-1", [["aging_flick", 30]]), "hit_polish", { ...context, rules: { size: BAG_BUILD_RULES.size } }).error);
  run("ajouter : sans règle, permis", true, addMarble(three, "aging_flick", { ...context, rules: {} }).ok);
  // Retirer.
  run.same("retirer : un exemplaire", { ok: true, bag: bagOf("slot-1", [["aging_flick", 2]]), count: 2 }, removeMarble(three, "aging_flick"));
  run.same("retirer : le dernier, l'entrée disparaît", { ok: true, bag: { id: "slot-1", marbles: [] }, count: 0 }, removeMarble(one.bag, "aging_flick"));
  run.same("retirer : une bille absente, refusé", { ok: false, error: "notInBag", marble: "hit_polish" }, removeMarble(three, "hit_polish"));
  run("retirer : une bille inconnue, permis", true, removeMarble(bagOf("slot-1", [["nope", 2]]), "nope").ok);
  // Brouillons et état.
  run.same("état : un brouillon trop petit, invalide, ses problèmes", { size: 3, valid: false, codes: ["bagTooSmall"] }, (({ size, valid, problems }) => ({ size, valid, codes: problems.map((p) => p.code) }))(bagStatus(three, context)));
  run("état : un sac valide", true, bagStatus(PRESETS.four, context).valid);
  run("même composition : l'ordre n'y fait rien", true, sameComposition(bagOf("a", [["x", 1], ["y", 2]]), bagOf("b", [["y", 2], ["x", 1]])));
  run("même composition : un exemplaire de plus, différente", false, sameComposition(bagOf("a", [["x", 1]]), bagOf("a", [["x", 2]])));
  run("chaque refus a sa place dans BAG_EDIT_REFUSALS", true, ["slotOccupied", "slotEmpty", "unknownMarble", "lockedMarble", "bagFull", "maxCopies", "notInBag"].every((code) => BAG_EDIT_REFUSALS.includes(code)));
}

// UN SAC RELU d'une sauvegarde (marbles/core/bags.js/repairBagRecord) : remis en forme,
// jamais perdu, jamais d'erreur.
function checkRepair(run) {
  run.same("bien formé : tel quel, rien à dire", { bag: PRESETS.four, problems: [] }, repairBagRecord(structuredClone(PRESETS.four), "four"));
  run.same("illisible : vidé, dit", 1, repairBagRecord("x", "slot-1").problems.length);
  run("illisible : aucun sac", null, repairBagRecord(42, "slot-1").bag);
  const repaired = repairBagRecord(
    { id: "wrong", name: "", extra: 1, marbles: [{ marble: "aging_flick", count: 0 }, null, { marble: "aging_flick", count: 2 }, { marble: "nope", count: 1 }] },
    "slot-2"
  );
  run.same("remis en forme : id, nom vide retiré, nombre ramené à 1, doublons fusionnés, inconnue gardée", { id: "slot-2", marbles: [{ marble: "aging_flick", count: 3 }, { marble: "nope", count: 1 }] }, repaired.bag);
  run("remis en forme : chaque changement dit", 6, repaired.problems.length);
  run("remis en forme : le résultat est bien formé", false, throws(() => validateBagFormat(repaired.bag)));
  run.same("composition illisible : sac vide gardé", { id: "slot-1", marbles: [] }, repairBagRecord({ id: "slot-1", marbles: "x" }, "slot-1").bag);
  run.same("renommage : la bille renommée", [{ marble: "new", count: 3 }], repairBagRecord(bagOf("slot-1", [["old", 1], ["new", 2]]), "slot-1", { old: "new" }).bag.marbles);
}
