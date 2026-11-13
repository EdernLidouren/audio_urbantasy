// Vérifications — domaine « marbles-screen ». L'ÉCRAN des billes
// (marbles/view/screen.js) joué au clavier, sous Node, par son banc d'essai
// (marbles/checks/fixtures/screen-bench.js) : ce qu'il dit (par les clés,
// marbles/checks/helpers.js/keyText), les sons qu'il demande (relevés, rien n'est joué)
// et la partie qu'il laisse, touche après touche, l'horloge avancée à la main.
// Prendre et poser, l'échange, la séquence de résolution (une étape par battement,
// Retour arrière, blocage, passage et sa garde), un menu qui fige tout, un choix au
// milieu d'une résolution, un choix pendant un lancer, les statuts (A et Maj+A), la
// fin de partie. Sur la table de billes des
// vérifications (marbles/checks/fixtures/marbles.js).
// Domaine `nodeOnly` (core/checks/index.js) : sauté dans la console du jeu, où il
// écrirait dans les vraies régions d'annonce. Lancées par
// `node tools/run-checks.js marbles-screen`.

import { MARBLES_SETTINGS } from "../config/values.js";
import { ruleInstance } from "../core/statuses.js";
import { t as realT } from "../../data/i18n/index.js";
import { speed } from "../content/effects.js";
import { pauseAfter } from "../view/sequence.js";
import { fixtureRules } from "./fixtures/marbles.js";
import { openScreenBench } from "./fixtures/screen-bench.js";
import { fabricatedRules, inHand, marblesPlayState, overState, placed, statusInstance } from "./helpers.js";

// Les règles de la table des vérifications.
const rules = fixtureRules();

// Assez d'horloge pour que n'importe quelle étape ait fini sa pause.
const LONG_MS = 100_000;

// Un état de partie fabriqué, en phase de jeu (helpers.js/marblesPlayState).
const playState = (over) => marblesPlayState(rules, over);

// Les repères d'un son relevé `playCue`, pour une bille : leurs familles de son.
const cuesOf = (bench, marble) =>
  bench.sounds.filter((sound) => sound.name === "playCue" && sound.args[0].marble === marble).map((sound) => sound.args[0].sound);

// L'OBJECTIF : O dit l'objectif, la progression et le nombre de règles ; Maj+O ouvre le
// menu de l'objectif et des règles (marbles/view/goal-screen.js), ses entrées dans
// l'ordre, E y dit la description ; une règle n'apparaît pas sous A. En FR et EN, les
// textes eux-mêmes : domaine marbles-view.
function checkGoal(run) {
  const state = overState(playState({ hand: inHand(["aging_flick"]), turn: 5, score: 120, rules: ["pot_game"] }), { goal: { kind: "target", score: 200 }, turns: 8 });
  const bench = openScreenBench(rules, { ...state, statuses: [ruleInstance("pot_game")] });
  try {
    bench.key("o");
    run("O : l'objectif, la progression, les règles", "goal.target{score: 200, turns: 8} goal.progress.target{score: 120, target: 200, turn: 5, turns: 8} goal.rule_count{count: 1}", bench.said.at(-1));
    bench.key("a");
    run("A : une règle n'y est pas", "statuses.none", bench.said.at(-1));
    bench.key("o", ["shift"]);
    run("Maj+O : le menu par-dessus l'écran", true, bench.top() !== bench.screen);
    run("Maj+O : l'objectif en premier", true, bench.menuSaid().at(-1).includes(realT("marbles.goal.target", { score: 200, turns: 8 })));
    bench.key("ArrowRight");
    run("Maj+O : puis chaque règle", true, !bench.menuSaid().at(-1).startsWith(realT("marbles.pile.back")));
    bench.key("ArrowRight");
    run("Maj+O : puis Retour", true, bench.menuSaid().at(-1).startsWith(realT("marbles.pile.back")));
    bench.key("Escape");
    run("Maj+O, Échap : de retour sur l'écran", true, bench.top() === bench.screen);
  } finally {
    bench.close();
  }
}

export default function checkMarblesScreen(run) {
  run.section("ouverture", checkOpening);
  run.section("prendre et poser", checkPlace);
  run.section("touches V et F", checkMarbleInfo);
  run.section("échange", checkSwap);
  run.section("séquence de résolution", checkSequence);
  run.section("menu par-dessus", checkMenuFreezes);
  run.section("choix pendant une résolution", checkChoiceDuringResolution);
  run.section("choix pendant un lancer", checkChoiceDuringThrow);
  run.section("choix dans la défausse", checkDiscardChoice);
  run.section("choix facultatif et obligatoire", checkChoiceModes);
  run.section("statuts", checkStatuses);
  run.section("objectif et règles", checkGoal);
  run.section("choix pendant la pioche du tour", checkChoiceDuringTurnDraw);
  run.section("fin de partie", checkGameEnd);
}

// Un Éveil à choix pendant la pioche du premier tour : la question d'abord, sans le
// début du tour ni le son de la main rendue ; la réponse faite, la pioche finit, puis
// « Début du tour 1 », avec son son.
function checkChoiceDuringTurnDraw(run) {
  const made = fabricatedRules({
    plain: { apex: [speed(1)] },
    chooser: { awaken: [{ action: "polish", amount: 1, target: { type: "choice", zones: ["triangle"], pick: "marble", count: 1, mode: "required" } }] },
  });
  const state = { ...made.createGame(4, { bag: ["chooser", "plain"], firstTurnDraw: 2 }), triangle: { leftBase: null, rightBase: null, apex: placed("plain", 1) } };
  const bench = openScreenBench(made, state);
  try {
    bench.advance(LONG_MS);
    run("ouverture : le choix attend, la pioche suspendue", "draw", bench.game().pendingChoice?.resume.action.type);
    run("ouverture : pas encore de début de tour", false, bench.said[0].includes("event.turn_started"));
    run("ouverture : pas encore le son de la main rendue", false, bench.sounds.some((sound) => sound.name === "playCue" && sound.args[0].sound === "playerTurn"));
    bench.key("Enter");
    bench.advance(LONG_MS);
    run("réponse : la pioche finie, le joueur a sa main", "play", bench.game().stage);
    run("réponse : le début du tour à la fin", true, bench.said.at(-1).endsWith("event.turn_started{turn: 1}"));
    run("réponse : le son de la main rendue", true, bench.sounds.some((sound) => sound.name === "playCue" && sound.args[0].sound === "playerTurn"));
  } finally {
    bench.close();
  }
}

// Les STATUTS : A dit leur résumé, dans l'ordre d'acquisition, ou qu'il n'y en a
// aucun ; Maj+A ouvre leur menu par-dessus l'écran (marbles/view/status-screen.js, ses
// textes vérifiés par le domaine marbles-view), Échap le referme. Pendant la séquence
// de résolution, ni l'un ni l'autre.
function checkStatuses(run) {
  const statuses = [
    statusInstance("loss_cushion", { intensity: 2, remaining: 3, origin: { trigger: "flick", slot: "apex", marble: "aging_flick" } }),
    statusInstance("throws_next", { pending: true }),
  ];
  const bench = openScreenBench(rules, { ...playState({ hand: inHand(["aging_flick"]) }), statuses });
  try {
    bench.key("a");
    run(
      "A : le résumé, dans l'ordre d'acquisition, l'intensité et l'attente dites",
      "statuses.summary{count: 2, first: statuses.label_intensity{status: status.loss_cushion.name, duration: statuses.duration.turns{count: 3}, intensity: 2}} statuses.item{status: statuses.label{status: status.throws_next.name, duration: statuses.remaining.pending}}",
      bench.said.at(-1)
    );
    bench.key("a", ["shift"]);
    run("Maj+A : le menu des statuts par-dessus l'écran", true, bench.top() !== bench.screen);
    bench.key("Escape");
    run("Maj+A, Échap : de retour sur l'écran", true, bench.top() === bench.screen);
    run("A et Maj+A ne touchent pas à la partie", JSON.stringify(statuses), JSON.stringify(bench.game().statuses));
  } finally {
    bench.close();
  }
  const empty = openScreenBench(rules, playState({ hand: inHand(["aging_flick"]) }));
  try {
    empty.key("a");
    run("A : aucun statut", "statuses.none", empty.said.at(-1));
    // Le menu d'une liste vide le dit, avant « Retour » (marbles/view/card-menu.js).
    empty.key("a", ["shift"]);
    run("Maj+A sans statut : le menu dit qu'il n'y en a aucun", true, empty.menuSaid().at(-1).includes(realT("marbles.statuses.none")));
    empty.key("ArrowRight");
    run("Maj+A sans statut : puis Retour", true, empty.menuSaid().at(-1).startsWith(realT("marbles.pile.back")));
    empty.key("Escape");
  } finally {
    empty.close();
  }
}

// Une partie neuve : la musique, le sac brassé, la pioche du tour 1, d'une annonce.
function checkOpening(run) {
  const bench = openScreenBench(rules, rules.createGame(3));
  try {
    run("ouverture : une seule annonce, l'accueil, l'objectif, puis la pioche", true, bench.said.length === 1 && bench.said[0].startsWith("intro goal.free{turns: 10} event.draw{"));
    run("ouverture : la partie piochée", "play", bench.game().stage);
    run.same(
      "ouverture : préchargement, réverbération, musique, puis les sons du geste",
      ["preloadMarblesAudio", "openTableReverb", "startMarblesMusic", "playCue"],
      bench.soundNames()
    );
    run("ouverture : le brassage d'abord", "shuffle", bench.sounds.find((sound) => sound.name === "playCue").args[0].sound);
    run("ouverture : la minuterie du temps réel", 1, bench.timerCount());
    bench.advance(LONG_MS);
    run("ouverture : le premier tour, la main revient au joueur (player_turn)", 1, turnCues(bench));
  } finally {
    bench.close();
  }
}

// Combien de fois le son du début de tour du joueur a été joué.
const turnCues = (bench) => bench.sounds.filter((sound) => sound.name === "playCue" && sound.args[0].sound === "playerTurn").length;

// Entrée sur une bille de la main ouvre la sélection d'emplacement ; Entrée sur un
// emplacement ouvre la confirmation ; Confirmer pose, et le curseur revient dans la
// main. Échap, pendant la sélection, ramène sur la bille.
// V (la description) et F (familles, calibre, rareté) : la bille sous le curseur, dans
// la main comme sur le triangle ; un emplacement vide n'a aucune bille. Les billes de
// test n'ont pas de description.
function checkMarbleInfo(run) {
  const bench = openScreenBench(rules, playState({ hand: inHand(["aging_flick"]), triangle: { rightBase: placed("one_shot"), leftBase: null, apex: null } }));
  try {
    bench.key("f");
    run("F en main : familles, calibre et rareté", "identity.line{families: [family.classics.name], size: size.medium.name, rarity: rarity.common.name}", bench.said.at(-1));
    bench.key("v");
    run("V en main : sans description", "description.none", bench.said.at(-1));
    // La main monte à la dernière base, la base gauche, vide.
    bench.key("ArrowUp");
    bench.key("f");
    run("F sur un emplacement vide : aucune bille", "no_marble", bench.said.at(-1));
    bench.key("v");
    run("V sur un emplacement vide : aucune bille", "no_marble", bench.said.at(-1));
    bench.key("ArrowRight");
    bench.key("f");
    run("F sur une bille active : ses familles aussi", "identity.line{families: [family.classics.name], size: size.large.name, rarity: rarity.common.name}", bench.said.at(-1));
    run("l'annonce d'une bille active : inchangée, sans familles ni rareté", true, bench.said.at(-2).startsWith("slot_line.occupied{") && !bench.said.at(-2).includes("family"));
  } finally {
    bench.close();
  }
  // Dans un menu de pile (ici le pot, Maj+P) : la bille sous le curseur, dans les
  // vrais textes (le menu les dit lui-même).
  const pile = openScreenBench(rules, playState({ hand: inHand(["aging_flick"]), pot: ["one_shot"] }));
  try {
    pile.key("p", ["shift"]);
    pile.key("Home");
    run("menu du pot : la ligne de la bille, avec familles et rareté", true, pile.menuSaid().at(-1).includes(realT("marbles.family.classics.name")));
    pile.key("f");
    run("menu du pot, F : familles, calibre et rareté", realT("marbles.identity.line", { families: [realT("marbles.family.classics.name")], size: realT("marbles.size.large.name"), rarity: realT("marbles.rarity.common.name") }), pile.menuSaid().at(-1));
    pile.key("v");
    run("menu du pot, V : sans description", realT("marbles.description.none"), pile.menuSaid().at(-1));
    pile.key("End");
    pile.key("f");
    run("menu du pot, F sur Retour : aucune bille", realT("marbles.no_marble"), pile.menuSaid().at(-1));
  } finally {
    pile.close();
  }
}

function checkPlace(run) {
  const state = playState({ hand: inHand(["aging_flick", "hit_polish"]) });
  const released = openScreenBench(rules, state);
  try {
    released.key("Enter");
    released.key("Escape");
    run(
      "Échap pendant la sélection : relâchée, de retour sur la bille dans la main",
      "take.released zone.hand list.line{name: <aging_flick>, size: size.medium.name, families: [family.classics.name], rarity: rarity.common.name, maxWear: 3}. menu.position{index: 1, total: 2}",
      released.said.at(-1)
    );
    run("Échap pendant la sélection : la partie n'a pas bougé", state, released.game());
  } finally {
    released.close();
  }

  const bench = openScreenBench(rules, state);
  try {
    bench.key("Enter");
    run("prendre : la bille prise, le curseur sur le premier emplacement vide (ordre horaire)", "take.hand{name: <aging_flick>} slot_line.placing_empty{slot: slot.rightBase}", bench.said.at(-1));
    bench.key("Enter");
    run("emplacement : la confirmation s'ouvre par-dessus l'écran", true, bench.top() !== bench.screen);
    run("emplacement : rien n'est encore posé", null, bench.game().triangle.rightBase);
    // Confirmer : la dernière entrée du menu.
    bench.key("End");
    bench.key("Enter");
    run("confirmer : de retour sur l'écran", true, bench.top() === bench.screen);
    run.same("confirmer : la bille posée", placed("aging_flick"), bench.game().triangle.rightBase);
    run.same("confirmer : la main sans elle", inHand(["hit_polish"]), bench.game().hand);
    run(
      "confirmer : la pose dite",
      "event.effect_flick{marble: <aging_flick>, effect: effect.none, speed: 0, mass: 1} event.placed{marble: <aging_flick>, slot: slot.rightBase}",
      bench.said.at(-1)
    );
    bench.advance(LONG_MS);
    run.same("confirmer : ses sons une seule fois, sa Chiquenaude, le roulement puis la chute", ["flick", "roll", "drop"], cuesOf(bench, "aging_flick"));
    bench.key("Backspace");
    run("après la pose : le curseur dans la main, sur la bille restante", true, bench.said.at(-1).startsWith("list.line{name: <hit_polish>"));
  } finally {
    bench.close();
  }
}

// Entrée sur un emplacement le prend ; Entrée sur un autre échange les deux. Un
// second échange dans le tour est refusé, d'un son et d'une phrase.
function checkSwap(run) {
  const bench = openScreenBench(rules, playState({ hand: inHand(["one_shot"]), triangle: { leftBase: placed("aging_flick"), rightBase: placed("hit_polish"), apex: null } }));
  try {
    bench.key("ArrowUp");
    run("triangle : le nom de la zone, puis l'emplacement", true, bench.said.at(-1).startsWith("zone.triangle slot_line.occupied{slot: slot.leftBase"));
    bench.key("Enter");
    run("échange : l'emplacement pris", "take.slot{slot: slot.leftBase}", bench.said.at(-1));
    bench.key("ArrowRight");
    bench.key("Enter");
    run("échange : dit", "event.swapped{a: slot.leftBase, b: slot.rightBase}", bench.said.at(-1));
    run.same("échange : les deux billes échangées", ["hit_polish", "aging_flick"], [bench.game().triangle.leftBase.marble, bench.game().triangle.rightBase.marble]);
    const before = bench.sounds.length;
    bench.key("Enter");
    run("second échange : refusé, et dit", "error.swapAlreadyUsed", bench.said.at(-1));
    run.same("second échange : le son du refus", [{ name: "playMenuSound", args: ["refusal"] }], bench.sounds.slice(before));
  } finally {
    bench.close();
  }
}

// Maj+R : la première étape aussitôt, les suivantes une par battement, chacune
// après sa pause ; Retour arrière la redit et relance sa pause ; les autres touches
// ne font qu'un son de blocage ; Entrée passe à la dernière étape, coupe les sons à
// venir, et un second Entrée trop proche est ignoré.
function checkSequence(run) {
  const triangle = { leftBase: placed("aging_flick"), rightBase: placed("hit_polish"), apex: placed("final_pocket") };
  const bench = openScreenBench(rules, playState({ hand: inHand(["aging_flick"]), bag: ["fragile", "split_base"], triangle }));
  try {
    const start = bench.said.length;
    bench.key("r", ["shift"]);
    run("Maj+R : la première étape aussitôt, l'ouverture avec la base droite", true, bench.said.length === start + 1 && bench.said.at(-1).startsWith("resolution.opening{turn: 2} outcome.slot{slot: slot.rightBase"));
    run("Maj+R : la partie déjà résolue, l'écran ne fait plus que la dire", 3, bench.game().turn);
    const firstPause = pauseAfter(bench.said.at(-1));
    bench.advance(firstPause - 1);
    run("séquence : rien avant la fin de la pause", start + 1, bench.said.length);
    bench.advance(1);
    run("séquence : l'étape suivante à la fin de la pause", true, bench.said.at(-1).startsWith("outcome.slot{slot: slot.leftBase"));
    bench.advance(LONG_MS);
    run("séquence : une étape au plus par battement, même après une longue absence", start + 3, bench.said.length);

    // Retour arrière : la même étape, et sa pause repart de zéro.
    const current = bench.said.at(-1);
    bench.key("Backspace");
    run("Retour arrière : l'étape redite", current, bench.said.at(-1));
    bench.advance(pauseAfter(current) - 1);
    run("Retour arrière : la pause relancée", current, bench.said.at(-1));

    // Une autre touche : un son de blocage, sans parole.
    const said = bench.said.length;
    const sounds = bench.sounds.length;
    bench.key("ArrowUp");
    run("pendant la séquence : rien n'est dit", said, bench.said.length);
    run.same("pendant la séquence : le son de blocage", [{ name: "playMenuSound", args: ["block"] }], bench.sounds.slice(sounds));

    // Entrée : la dernière étape, les sons à venir coupés.
    const beforeSkip = bench.sounds.length;
    bench.key("Enter");
    run("Entrée : directement à la dernière étape, le début du tour suivant", "event.turn_started{turn: 3}", bench.said.at(-1));
    run("Entrée : les sons à venir coupés", true, bench.soundNames(beforeSkip).includes("stopRolls"));
    const afterSkip = bench.said.length;
    bench.key("Enter");
    run("second Entrée trop proche : ignoré, sans parole", afterSkip, bench.said.length);
    bench.advance(MARBLES_SETTINGS.skipGuardMs);
    run("Entrée : séquence passée, la main revient au joueur (player_turn), une fois", 1, turnCues(bench));
    bench.key("Enter");
    run("après la garde : Entrée reprend, une bille prise", true, bench.said.at(-1).startsWith("take.hand{name: <aging_flick>}"));
  } finally {
    bench.close();
  }
}

// Un menu ouvert par-dessus (l'aide, H) fige la séquence : seul le sommet de la pile
// reçoit le temps. Refermé, l'écran redit son étape, et la séquence reprend.
function checkMenuFreezes(run) {
  const triangle = { leftBase: placed("aging_flick"), rightBase: placed("hit_polish"), apex: placed("final_pocket") };
  const bench = openScreenBench(rules, playState({ hand: inHand([]), bag: ["fragile"], triangle }));
  try {
    bench.key("r", ["shift"]);
    const step = bench.said.at(-1);
    bench.key("h");
    run("H pendant la séquence : l'aide s'ouvre par-dessus", true, bench.top() !== bench.screen);
    const said = bench.said.length;
    bench.advance(LONG_MS);
    run("aide ouverte : la séquence figée", said, bench.said.length);
    bench.key("Escape");
    run("aide refermée : l'écran redit son étape", step, bench.said.at(-1));
    bench.advance(LONG_MS);
    run("aide refermée : la séquence reprend", true, bench.said.at(-1).startsWith("outcome.slot{slot: slot.leftBase"));
  } finally {
    bench.close();
  }
}

// Un Final qui fait choisir pendant la résolution : la séquence s'arrête sur la
// question ; la réponse se dit en séquence, la question suivante aussi ; Terminer
// fait reprendre la résolution jusqu'au tour suivant.
function checkChoiceDuringResolution(run) {
  const triangle = { leftBase: placed("aging_flick"), rightBase: placed("final_pocket", 1), apex: placed("fragile", 1) };
  const bench = openScreenBench(rules, playState({ bag: ["aging_flick"], hand: inHand([]), triangle }));
  const playOut = () => {
    for (let pulse = 0; pulse < 20; pulse++) bench.advance(LONG_MS);
  };
  try {
    bench.key("r", ["shift"]);
    playOut();
    run(
      "choix : la séquence s'arrête sur la question du Final",
      true,
      bench.said.at(-1).startsWith("choice.by_trigger{moment: keyword.final.name, marble: <fragile>") && bench.said.at(-1).endsWith("choice.decline_hint")
    );
    run("choix : l'Impact pas encore dit", false, bench.said.some((text) => text.includes("event.impact")));
    run("choix : en attente dans la partie", "polish", bench.game().pendingChoice?.action);
    bench.key("Enter");
    // Le curseur s'ouvre sur la première cible dans l'ordre horaire : la base droite.
    run("réponse : la cible choisie se dit", "choice.chosen{marble: <final_pocket>}", bench.said.at(-1));
    playOut();
    run("réponse : la question suivante, en séquence", true, bench.said.at(-1).startsWith("choice.more.optional{") && bench.said.at(-1).endsWith("choice.finish_hint"));
    bench.key("t");
    playOut();
    run("Terminer : la résolution reprise jusqu'à l'Impact", true, bench.said.some((text) => text.includes("event.impact{")));
    run("Terminer : plus de choix en attente", null, bench.game().pendingChoice);
    run("Terminer : le tour suivant pioché", "3 play", `${bench.game().turn} ${bench.game().stage}`);
    run("Terminer : la séquence finit sur le début du tour suivant", "event.turn_started{turn: 3}", bench.said.at(-1));
    run("séquence écoutée jusqu'au bout : la main revient au joueur (player_turn), une fois", 1, turnCues(bench));
  } finally {
    bench.close();
  }
}

// Un choix ouvert pendant un lancer (une bille du pot qui réagit à la Chiquenaude) :
// la bille en cours de lancer est en transit. L'emplacement qu'elle vise l'annonce
// après son contenu, et Entrée n'y choisit rien ; la réponse la fait arriver. Billes
// fabriquées : aucune de la table des vérifications n'ouvre de choix à ce moment.
function checkChoiceDuringThrow(run) {
  const choose = { type: "choice", zones: ["triangle"], pick: "marble", count: 1, mode: "required" };
  const made = fabricatedRules({
    plain: { apex: [speed(1)] },
    flicker: { flick: [speed(1)] },
    potCrack: { pocketed: { flick: [{ action: "crack", amount: 1, target: choose }] } },
  });
  const state = marblesPlayState(made, { hand: inHand(["flicker"]), pot: ["potCrack"], triangle: { leftBase: placed("plain"), rightBase: null, apex: placed("plain") } });
  const bench = openScreenBench(made, state);
  try {
    // Prise, le curseur sur le premier emplacement vide (base droite), confirmée.
    bench.key("Enter");
    bench.key("Enter");
    bench.key("End");
    bench.key("Enter");
    for (let pulse = 0; pulse < 5; pulse++) bench.advance(LONG_MS);
    run.same("lancer : le choix attend, la bille en transit", [{ kind: "thrown", marble: "flicker", slot: "rightBase" }], bench.game().pendingChoice?.inTransit);
    bench.key("ArrowRight");
    run(
      "lancer : l'emplacement visé dit la bille en approche, puis Non éligible",
      "slot_line.empty{slot: slot.rightBase} choice.in_transit.thrown{name: <flicker>} choice.not_eligible",
      bench.said.at(-1)
    );
    bench.key("Enter");
    run("lancer : Entrée n'y choisit rien", true, bench.game().pendingChoice !== null);
    bench.key("ArrowLeft");
    bench.key("Enter");
    for (let pulse = 0; pulse < 5; pulse++) bench.advance(LONG_MS);
    run("réponse : plus de choix en attente", null, bench.game().pendingChoice);
    run.same("réponse : la bille lancée arrivée", placed("flicker"), bench.game().triangle.rightBase);
  } finally {
    bench.close();
  }
}

// Un choix dans la DÉFAUSSE (Ramasser) : un menu horizontal dans l'ordre d'arrivée,
// les flèches gauche et droite le parcourent, E dit les mots-clés de la bille sous
// le curseur, Entrée la ramasse en main.
function checkDiscardChoice(run) {
  const made = fabricatedRules({
    plain: {},
    flicker: { flick: [speed(1)] },
    picker: { hit: [{ action: "retrieve", target: { type: "choice", zones: ["discard"], pick: "marble", count: 1, mode: "required" } }] },
  });
  const state = marblesPlayState(made, { hand: inHand(["picker"]), discard: ["plain", "flicker"], triangle: { rightBase: null, leftBase: null, apex: placed("plain") } });
  const bench = openScreenBench(made, state);
  try {
    // Prise, le curseur sur la base droite, monté à la pointe, la pose confirmée.
    bench.key("Enter");
    bench.key("ArrowUp");
    bench.key("Enter");
    bench.key("End");
    bench.key("Enter");
    for (let pulse = 0; pulse < 5; pulse++) bench.advance(LONG_MS);
    run("défausse : le choix attend, dans la défausse", true, bench.game().pendingChoice?.zones.includes("discard"));
    bench.key("ArrowRight");
    run("défausse : la flèche droite, la bille suivante dans l'ordre d'arrivée", true, bench.said.at(-1).startsWith("list.line{name: <flicker>"));
    bench.key("e");
    run("défausse : E dit les mots-clés de la bille", true, bench.said.at(-1).includes("keyword.flick"));
    // Une bille de test n'a pas de description.
    bench.key("v");
    run("défausse : V dit la description de la bille", "description.none", bench.said.at(-1));
    bench.key("f");
    run("défausse : F dit ses familles, son calibre et sa rareté", "identity.line{families: [family.classics.name], size: size.medium.name, rarity: rarity.common.name}", bench.said.at(-1));
    bench.key("Enter");
    for (let pulse = 0; pulse < 5; pulse++) bench.advance(LONG_MS);
    run("défausse : la bille choisie, ramassée en main", true, bench.game().hand.some((held) => held.marble === "flicker"));
    run("défausse : plus de choix en attente", null, bench.game().pendingChoice);
  } finally {
    bench.close();
  }
}

// Les deux MODES d'un choix. Facultatif : « Ne rien choisir » en fin de menu, Échap
// valide la sélection en cours, rien de choisi, l'action est ignorée et cela se dit.
// Obligatoire : ni « Ne rien choisir » ni « Terminer », Échap redit la question, T
// est refusé.
function checkChoiceModes(run) {
  const choose = (zones, mode) => ({ type: "choice", zones, pick: "marble", count: 1, mode });
  const made = fabricatedRules({
    plain: {},
    optPicker: { hit: [{ action: "retrieve", target: choose(["discard"], "optional") }] },
    reqPolish: { hit: [{ action: "polish", amount: 1, target: choose(["triangle"], "required") }] },
  });
  const placeOnApex = (bench) => {
    // Prise, le curseur sur la base droite (le premier vide), montée à la pointe.
    bench.key("Enter");
    bench.key("ArrowUp");
    bench.key("Enter");
    bench.key("End");
    bench.key("Enter");
    for (let pulse = 0; pulse < 5; pulse++) bench.advance(LONG_MS);
  };

  const optional = openScreenBench(made, marblesPlayState(made, { hand: inHand(["optPicker"]), discard: ["plain"], triangle: { rightBase: null, leftBase: null, apex: placed("plain") } }));
  try {
    placeOnApex(optional);
    run("facultatif : la question dit ce qu'on peut faire, puis T pour ne rien choisir", true, optional.said.at(-1).includes("choice.question.optional{") && optional.said.at(-1).endsWith("choice.decline_hint"));
    optional.key("End");
    run("facultatif : « Ne rien choisir » en fin de menu", "choice.decline. menu.position{index: 3, total: 3}", optional.said.at(-1));
    optional.key("Escape");
    for (let pulse = 0; pulse < 5; pulse++) optional.advance(LONG_MS);
    run("facultatif : Échap, plus de choix en attente", null, optional.game().pendingChoice);
    run("facultatif : rien de choisi, l'action ignorée, dite", true, optional.said.some((text) => text.includes("choice.ended.declined")));
    run("facultatif : rien n'a quitté la défausse", 0, optional.game().hand.length);
  } finally {
    optional.close();
  }

  const required = openScreenBench(made, marblesPlayState(made, { hand: inHand(["reqPolish"]), triangle: { rightBase: placed("plain", 1), leftBase: null, apex: placed("plain") } }));
  try {
    placeOnApex(required);
    const question = required.said.at(-1);
    run("obligatoire : la question dit ce qu'on doit choisir, sans indication de T", true, question.includes("choice.question.required{") && !question.includes("hint"));
    required.key("Escape");
    // La pose s'est dite avec la question à sa suite ; Échap ne redit que la question.
    run("obligatoire : Échap redit la question", true, required.said.at(-1).startsWith("choice.by_hit{") && question.endsWith(required.said.at(-1)));
    required.key("t");
    run("obligatoire : T refusé, le choix attend toujours", true, required.game().pendingChoice !== null);
  } finally {
    required.close();
  }
}

// Le dernier tour : la fin de partie se dit avec comment sortir ; Entrée quitte
// l'écran, qui coupe ses sons et rend la partie.
function checkGameEnd(run) {
  const triangle = { leftBase: placed("aging_flick"), rightBase: placed("hit_polish"), apex: placed("final_pocket") };
  const bench = openScreenBench(rules, playState({ turn: 10, hand: inHand([]), triangle }));
  try {
    bench.key("r", ["shift"]);
    bench.key("Enter");
    run("fin de partie : le score final, puis comment sortir", "event.game_over{score: 3, result: result.no_tier} over_hint", bench.said.at(-1));
    bench.advance(MARBLES_SETTINGS.skipGuardMs);
    const sounds = bench.sounds.length;
    bench.key("Enter");
    run("Entrée : l'écran quitté", undefined, bench.top());
    run("Entrée : la partie rendue", null, bench.game());
    run("Entrée : la minuterie arrêtée", 0, bench.timerCount());
    run.same("Entrée : les sons de l'écran coupés", ["stopRolls", "stopFocusBeacon", "closeTableReverb", "stopMarblesMusic"], bench.soundNames(sounds));
  } finally {
    bench.close();
  }
}
