// Vérifications — domaine « marbles-screen ». L'ÉCRAN des billes
// (marbles/view/screen.js) joué au clavier, sous Node, par son banc d'essai
// (marbles/checks/fixtures/screen-bench.js) : ce qu'il dit (par les clés,
// marbles/checks/helpers.js/keyText), les sons qu'il demande (relevés, rien n'est joué)
// et la partie qu'il laisse, touche après touche, l'horloge avancée à la main.
// Prendre et poser, l'échange, la séquence de résolution (une étape par battement,
// Retour arrière, blocage, passage et sa garde), un menu qui fige tout, un choix au
// milieu d'une résolution, la fin de partie. Sur la table de billes des
// vérifications (marbles/checks/fixtures/marbles.js).
// Domaine `nodeOnly` (core/checks/index.js) : sauté dans la console du jeu, où il
// écrirait dans les vraies régions d'annonce. Lancées par
// `node tools/run-checks.js marbles-screen`.

import { MARBLES_SETTINGS } from "../config/values.js";
import { pauseAfter } from "../view/sequence.js";
import { fixtureRules } from "./fixtures/marbles.js";
import { openScreenBench } from "./fixtures/screen-bench.js";
import { inHand, marblesPlayState, placed } from "./helpers.js";

// Les règles de la table des vérifications.
const rules = fixtureRules();

// Assez d'horloge pour que n'importe quelle étape ait fini sa pause.
const LONG_MS = 100_000;

// Un état de partie fabriqué, en phase de jeu (helpers.js/marblesPlayState).
const playState = (over) => marblesPlayState(rules, over);

// Les repères d'un son relevé `playCue`, pour une bille : leurs familles de son.
const cuesOf = (bench, marble) =>
  bench.sounds.filter((sound) => sound.name === "playCue" && sound.args[0].marble === marble).map((sound) => sound.args[0].sound);

export default function checkMarblesScreen(run) {
  run.section("ouverture", checkOpening);
  run.section("prendre et poser", checkPlace);
  run.section("échange", checkSwap);
  run.section("séquence de résolution", checkSequence);
  run.section("menu par-dessus", checkMenuFreezes);
  run.section("choix pendant une résolution", checkChoiceDuringResolution);
  run.section("fin de partie", checkGameEnd);
}

// Une partie neuve : la musique, le sac brassé, la pioche du tour 1, d'une annonce.
function checkOpening(run) {
  const bench = openScreenBench(rules, rules.createGame(3));
  try {
    run("ouverture : une seule annonce, l'accueil puis la pioche", true, bench.said.length === 1 && bench.said[0].startsWith("intro event.draw{"));
    run("ouverture : la partie piochée", "play", bench.game().stage);
    run.same(
      "ouverture : préchargement, réverbération, musique, puis les sons du geste",
      ["preloadMarblesAudio", "openTableReverb", "startMarblesMusic", "playCue"],
      bench.soundNames()
    );
    run("ouverture : le brassage d'abord", "shuffle", bench.sounds.find((sound) => sound.name === "playCue").args[0].sound);
    run("ouverture : la minuterie du temps réel", 1, bench.timerCount());
  } finally {
    bench.close();
  }
}

// Entrée sur une bille de la main ouvre la sélection d'emplacement ; Entrée sur un
// emplacement ouvre la confirmation ; Confirmer pose, et le curseur revient dans la
// main. Échap, pendant la sélection, ramène sur la bille.
function checkPlace(run) {
  const state = playState({ hand: inHand(["aging_flick", "hit_polish"]) });
  const released = openScreenBench(rules, state);
  try {
    released.key("Enter");
    released.key("Escape");
    run(
      "Échap pendant la sélection : relâchée, de retour sur la bille dans la main",
      "take.released zone.hand list.line{name: <aging_flick>, size: size.medium.name, maxWear: 3}. menu.position{index: 1, total: 2}",
      released.said.at(-1)
    );
    run("Échap pendant la sélection : la partie n'a pas bougé", state, released.game());
  } finally {
    released.close();
  }

  const bench = openScreenBench(rules, state);
  try {
    bench.key("Enter");
    run("prendre : la bille prise, le curseur sur le premier emplacement vide", "take.hand{name: <aging_flick>} slot_line.placing_empty{slot: slot.leftBase}", bench.said.at(-1));
    bench.key("Enter");
    run("emplacement : la confirmation s'ouvre par-dessus l'écran", true, bench.top() !== bench.screen);
    run("emplacement : rien n'est encore posé", null, bench.game().triangle.leftBase);
    // Confirmer : la dernière entrée du menu.
    bench.key("End");
    bench.key("Enter");
    run("confirmer : de retour sur l'écran", true, bench.top() === bench.screen);
    run.same("confirmer : la bille posée", placed("aging_flick"), bench.game().triangle.leftBase);
    run.same("confirmer : la main sans elle", inHand(["hit_polish"]), bench.game().hand);
    run(
      "confirmer : la pose dite",
      "event.effect_flick{marble: <aging_flick>, effect: effect.none, speed: 0, mass: 1} event.placed{marble: <aging_flick>, slot: slot.leftBase}",
      bench.said.at(-1)
    );
    bench.advance(LONG_MS);
    run.same("confirmer : ses sons une seule fois, le roulement puis la chute", ["roll", "drop"], cuesOf(bench, "aging_flick"));
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
    run("Maj+R : la première étape aussitôt, l'ouverture avec la base gauche", true, bench.said.length === start + 1 && bench.said.at(-1).startsWith("resolution.opening{turn: 2} outcome.slot{slot: slot.leftBase"));
    run("Maj+R : la partie déjà résolue, l'écran ne fait plus que la dire", 3, bench.game().turn);
    const firstPause = pauseAfter(bench.said.at(-1));
    bench.advance(firstPause - 1);
    run("séquence : rien avant la fin de la pause", start + 1, bench.said.length);
    bench.advance(1);
    run("séquence : l'étape suivante à la fin de la pause", true, bench.said.at(-1).startsWith("outcome.slot{slot: slot.rightBase"));
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
    run("aide refermée : la séquence reprend", true, bench.said.at(-1).startsWith("outcome.slot{slot: slot.rightBase"));
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
      bench.said.at(-1).startsWith("choice.by_trigger{moment: keyword.final.name, marble: <fragile>") && bench.said.at(-1).endsWith("choice.finish_hint")
    );
    run("choix : l'Impact pas encore dit", false, bench.said.some((text) => text.includes("event.impact")));
    run("choix : en attente dans la partie", "polish", bench.game().pendingChoice?.action);
    bench.key("Enter");
    run("réponse : la cible choisie se dit", "choice.chosen{marble: <aging_flick>}", bench.said.at(-1));
    playOut();
    run("réponse : la question suivante, en séquence", "choice.more_up_to{target: choice.noun.triangle_marble{count: 1}}", bench.said.at(-1));
    bench.key("t");
    playOut();
    run("Terminer : la résolution reprise jusqu'à l'Impact", true, bench.said.some((text) => text.includes("event.impact{")));
    run("Terminer : plus de choix en attente", null, bench.game().pendingChoice);
    run("Terminer : le tour suivant pioché", "3 play", `${bench.game().turn} ${bench.game().stage}`);
    run("Terminer : la séquence finit sur le début du tour suivant", "event.turn_started{turn: 3}", bench.said.at(-1));
  } finally {
    bench.close();
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
    run("fin de partie : le score final, puis comment sortir", "event.game_over{score: 3} over_hint", bench.said.at(-1));
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
