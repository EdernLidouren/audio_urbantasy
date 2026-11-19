// Vérifications — domaine « marbles-sequence ». La vue d'ensemble du tour
// (touche R) et la séquence de résolution (Maj+R) du jeu des billes : l'ordre de
// ses étapes sur des parties jouées, ce qu'elles disent (gabarits et valeurs),
// l'égalité entre l'Impact prévu et l'Impact annoncé, la file d'étapes
// (marbles/view/sequence.js) : pauses, avance, passage, sans effet sur la partie ;
// la taille de la main à chaque étape (marbles/view/resolution.js) ; et l'historique qui en retient les messages (marbles/view/history.js, touche L).
// Sur la table de billes des vérifications (marbles/checks/fixtures/marbles.js), avec
// la traduction de test (helpers.js/keyText) : les CLÉS et leurs paramètres, jamais
// la rédaction des textes ; les phrases complètes ont leurs témoins (domaine
// marbles-view). Rien n'est annoncé ni joué ici. Lancées par
// core/checks/index.js/runChecks (`node tools/run-checks.js marbles-sequence`).

import { MARBLES_SETTINGS } from "../config/values.js";
import { SLOTS } from "../core/marbles.js";
import { buildSteps, describeOverview, placementLines, resolutionSteps } from "../view/narration.js";
import {
  advanceSequence,
  pauseAfter,
  restartPause,
  skipSequence,
  startSequence,
  validatePauseSettings,
} from "../view/sequence.js";
import { EMPTY_HISTORY, recordSteps } from "../view/history.js";
import { choicePromptStep, withHandSizes } from "../view/resolution.js";
import { historyMenu } from "../view/history-screen.js";
import { throws } from "../../lib/check.js";
import { CHOICELESS_TYPES, FIXTURE_BAG, fixtureRules } from "./fixtures/marbles.js";
import { answerChoices, fabricatedRules, inHand, keyText, marblesPlayState, overState } from "./helpers.js";

// Les règles de la table des vérifications (marbles/checks/fixtures/marbles.js).
const rules = fixtureRules();
// La même table sans cible au choix ni Éjecter, pour les cas qui portent sur
// Empocher depuis la main.
const fixedRules = fixtureRules(CHOICELESS_TYPES);

// La traduction de test (helpers.js/keyText) : ce que la vue dit, clé et valeurs.
const t = keyText;

// Traduction de test : la clé seule, sans son préfixe, pour lire la FORME d'une
// séquence sans dépendre des textes.
const keyOnly = (key) => key.replace(/^marbles\./, "");

// Une séquence dite jusqu'au bout, au rythme de ses pauses : les étapes dans
// l'ordre où elles se disent.
function playOut(steps) {
  const said = [];
  let { sequence, step } = startSequence(steps);
  said.push(step);
  while (sequence !== null) {
    ({ sequence, step } = advanceSequence(sequence, sequence.remainingMs));
    said.push(step);
  }
  return said;
}

// Une séquence passée dès sa première étape.
function skipAtOnce(steps) {
  const { sequence, step } = startSequence(steps);
  return sequence === null ? [step] : [step, skipSequence(sequence).step];
}

// Une partie jouée tour par tour comme l'écran : à chaque tour, des poses fixes,
// la vue d'ensemble relevée juste avant Maj+R, puis la résolution et la pioche
// qui la suit, présentées par `present` (dite jusqu'au bout ou passée).
// `onTurn({ before, overview, forecastImpact, events, steps, history })` reçoit
// chaque tour résolu, avec l'historique tenu comme l'écran le tient.
function playGame(seed, options, present, onTurn = () => {}) {
  let state = rules.createGame(seed, options);
  const journal = [];
  let history = EMPTY_HISTORY;
  // Un choix en attente se tranche aussitôt (la première cible) : la partie va au bout.
  const apply = (action) => {
    const result = answerChoices(rules, rules.reduce(state, action));
    if (!result.ok) return null;
    state = result.state;
    journal.push(...result.events);
    return result.events;
  };
  const record = (steps) => {
    history = recordSteps(history, steps);
    return steps;
  };
  record(buildSteps(apply({ type: "draw" }), t));
  while (state.stage === "play") {
    // Le triangle plein au premier tour. Ensuite, graine impaire : trois poses par
    // tour, la défausse se remplit et le sac se régénère ; graine paire : une pose
    // tous les trois tours, la main se remplit et des emplacements se vident.
    const generous = seed % 2 === 1;
    const slots = state.turn === 1 || generous ? SLOTS : state.turn % 3 === 0 ? [SLOTS[state.turn % 2]] : [];
    for (const slot of slots) if (rules.placeRefusal(state, 0, slot) === null) record(buildSteps(apply({ type: "place", handIndex: 0, slot }), t));

    const before = state;
    const overview = describeOverview(state, rules, t);
    const { impact: forecastImpact, choiceDependent } = rules.forecast(state);
    const resolved = apply({ type: "resolve" });
    const drawn = state.stage === "draw" ? apply({ type: "draw" }) : [];
    const events = [...resolved, ...drawn];
    const steps = record(resolutionSteps(before.turn, events, t, { hint: before.turn === 1 }));
    present(steps);
    onTurn({ before, overview, forecastImpact, choiceDependent, events, steps, history });
  }
  return { state, journal, history };
}

// La forme attendue d'une résolution : ouverture, trois phases (chacune suivie de
// ses pioches, Polissages et Fêlures éventuels, et des retraits qu'une Fêlure
// provoque avec leur Final), les billes usées (chacune suivie de son
// Final et de ses pioches éventuelles), l'Impact, puis la
// rotation et la pioche du tour suivant, ou la fin de
// partie (dernier tour : sans rotation ni pioche ; sac et défausse vides : la
// fin suit l'arrêt de la pioche).
// Une régénération du sac, suivie des Trouvailles des billes actives et de ce
// qu'elles déclenchent (actions sur une bille, retraits, Finals).
const REGENERATION =
  "(event\\.bag_regenerated (event\\.effect_windfall |event\\.polished |event\\.cracked |event\\.target_empty |event\\.removed\\.wear |event\\.effect_final )*)";

// Une pioche, suivie de l'Éveil de sa bille et de ce qu'il déclenche (une Pioche qui
// pioche à son tour, un Polissage ou une Fêlure, une régénération).
// Une mise en poche (avec son entrée au pot) ou une perte, et une cible vide
// d'Empocher.
// Une réaction d'une bille du pot (En poche, à chaque (occurrence)), à tout moment ;
// les étapes d'un choix (une cible choisie, la fin d'une sélection, aucune cible).
const CHOOSING = "choice\\.chosen |choice\\.ended\\.(done|exhausted) |event\\.target_empty_choice |";
// Une éjection par l'action Éjecter (son Éjection éventuelle), ou rien à éjecter.
const EJECTING = "event\\.eject (event\\.effect_knockout )?|event\\.target_empty_all |event\\.target_empty_self_eject |";
// Une réaction d'une bille du pot (En poche, à chaque (occurrence)), à tout moment.
const POCKETING = "event\\.pocketed (event\\.effect_pocket_entry )?|event\\.lost |event\\.target_empty_(hand|self) |outcome\.pot |";
const DRAWING =
  "(" + REGENERATION + "|event\\.draw |event\\.draw_skipped\\.(handFull|noMarbles) |event\\.effect_awaken |" + POCKETING + CHOOSING + EJECTING +
  "event\\.polished |event\\.cracked |event\\.target_empty |event\\.removed\\.wear |event\\.effect_final )";

const SEQUENCE_SHAPE = new RegExp(
  "^resolution\\.opening (outcome\\.(slot|empty) " + DRAWING + "*){3}" +
    // L'étape du pot : une par bille qui a un effet de résolution.
    "(outcome\\.pot " + DRAWING + "*)*" +
    "(event\\.removed\\.wear (event\\.effect_final )?" + DRAWING + "*)*" +
    "event\\.impact (event\\.tier_reached )?" +
    // Le tour suivant commence ; ou la partie s'arrête, après l'Impact (sans rotation
    // dite), ou à la pioche, faute de billes.
    "(event\\.rotation " + DRAWING + "+(event\\.turn_started|event\\.game_over)" +
    "|event\\.game_over)$"
);

const GAMES = [
  ...Array.from({ length: 30 }, (_, index) => ({ seed: index + 1, options: {} })),
  // Un petit sac et beaucoup de tours : régénérations, puis sac épuisé.
  ...Array.from({ length: 30 }, (_, index) => ({ seed: index + 100, options: { bag: FIXTURE_BAG.slice(0, 6), turns: 30 } })),
];

function checkRealGames(run) {
  const badShapes = [];
  const lostEvents = [];
  const emptySteps = [];
  const impactMismatches = [];
  let awakenedBeforeImpact = 0;
  let choiceDependentTurns = 0;
  const badHistories = [];
  const seen = new Set();

  {
    for (const { seed, options } of GAMES) {
      playGame(seed, options, playOut, ({ before, overview, forecastImpact, choiceDependent, events, steps, history }) => {
        // L'historique après la résolution : le tour qui vient de se jouer, de son
        // début au début du suivant (ou à la fin de partie), sans indication de touche.
        const { previous } = history;
        const said = previous?.messages ?? [];
        const closing = said[said.length - 1] ?? "";
        const turnStarted = (turn) => t("marbles.event.turn_started", { turn });
        const historyOk =
          previous !== null &&
          previous.turn === before.turn &&
          said[0] === turnStarted(before.turn) &&
          said.filter((text) => text.startsWith("event.turn_started")).length === (closing.startsWith("event.turn_started") ? 2 : 1) &&
          (closing === turnStarted(before.turn + 1) || closing.startsWith("event.game_over")) &&
          said.includes(t("marbles.resolution.opening", { turn: before.turn })) &&
          !said.some((text) => text.includes("resolution.hint"));
        if (!historyOk) badHistories.push(`${seed}/${before.turn} : ${said.join(" | ")}`);

        const shape = resolutionSteps(before.turn, events, keyOnly)
          .map((step) => step.text)
          .join(" ");
        if (!SEQUENCE_SHAPE.test(shape)) badShapes.push(`${seed}/${before.turn} : ${shape}`);
        for (const marker of ["event.bag_regenerated event.draw", "event.game_over", "draw_skipped.noMarbles", "removed.wear", "outcome.empty"]) {
          if (shape.includes(marker)) seen.add(marker);
        }
        if (JSON.stringify(steps.flatMap((step) => step.events)) !== JSON.stringify(events)) lostEvents.push(`${seed}/${before.turn}`);
        if (steps.some((step) => step.text === "")) emptySteps.push(`${seed}/${before.turn}`);

        // R au début de la phase de jeu, sans action ensuite : l'Impact prévu est
        // celui que la résolution annonce, sauf si un Éveil a joué avant l'Impact (il
        // ne se prévoit pas) : R a dit alors « Éveils possibles. ».
        const { impact } = events.find((event) => event.type === "impact");
        const impactIndex = events.findIndex((event) => event.type === "impact");
        if (events.slice(0, impactIndex).some((event) => event.type === "effect" && event.trigger === "awaken")) {
          awakenedBeforeImpact += 1;
          if (!overview.endsWith(t("marbles.forecast.awakenings"))) impactMismatches.push(`${seed}/${before.turn} : Éveil sans « Éveils possibles. »`);
          return;
        }
        // Un choix pendant la résolution (la base de all_rounder) ne se prévoit pas : R
        // l'a dit, « selon votre choix », et l'Impact ne se compare pas.
        if (choiceDependent) {
          choiceDependentTurns += 1;
          if (!overview.includes("forecast_choice.after")) impactMismatches.push(`${seed}/${before.turn} : choix sans « selon votre choix »`);
          return;
        }
        const impactStep = steps.find((step) => step.events.some((event) => event.type === "impact"));
        const agrees =
          forecastImpact === impact && overview.includes(`overview.summary{`) && overview.includes(`impact: ${impact}}`) && impactStep.text.startsWith(`event.impact{impact: ${impact},`);
        if (!agrees) impactMismatches.push(`${seed}/${before.turn} : prévu ${forecastImpact}, annoncé ${impact}`);
      });
    }
  }

  run.same("séquence : ordre des étapes sur de vraies parties", [], badShapes.slice(0, 3));
  run.same(
    "séquence : chaque cas rencontré au moins une fois",
    ["draw_skipped.noMarbles", "event.bag_regenerated event.draw", "event.game_over", "outcome.empty", "removed.wear"],
    [...seen].sort()
  );
  run.same("séquence : chaque évènement dans une étape et une seule, dans l'ordre", [], lostEvents.slice(0, 3));
  run.same("séquence : aucune étape muette", [], emptySteps.slice(0, 3));
  run.same("R : l'Impact prévu est l'Impact annoncé à la résolution", [], impactMismatches.slice(0, 3));
  run("R : des Éveils avant l'Impact rencontrés, R les disait possibles", true, awakenedBeforeImpact > 0);
  run("R : des choix pendant la résolution rencontrés, R les disait", true, choiceDependentTurns > 0);
  run.same("historique : le tour précédent, de son début au début du suivant, sur de vraies parties", [], badHistories.slice(0, 3));

  // Passer la séquence ne change rien : même graine et mêmes actions, même journal
  // et même état final, qu'on l'ait écoutée jusqu'au bout ou passée.
  for (const { seed, options } of [GAMES[0], GAMES[30]]) {
    const listened = playGame(seed, options, playOut);
    const skipped = playGame(seed, options, skipAtOnce);
    run.same(`passer (graine ${seed}) : même journal`, listened.journal, skipped.journal);
    run.same(`passer (graine ${seed}) : même état final`, listened.state, skipped.state);
  }
}

// Un état de partie fabriqué, en phase de jeu.
function playState(changes) {
  return marblesPlayState(rules, { score: 0, hand: inHand(["aging_flick", "hit_polish", "awaken_draw"]), ...changes });
}

const EMPTY_TRIANGLE = { leftBase: null, rightBase: null, apex: null };

function checkTexts(run) {
  {
    const lensed = playState({
      bag: ["final_pocket"],
      triangle: { leftBase: { marble: "tally_flick", wear: 0 }, rightBase: null, apex: { marble: "hit_pocket", wear: 1 } },
    });

    // R : la prévision d'abord, puis chaque emplacement dans l'ordre des phases.
    run(
      "R : vide, le don dit chez qui le fait, le bonus compté chez qui le reçoit",
      "overview.summary{speed: 10, mass: 1, impact: 10} outcome.empty{slot: slot.rightBase} outcome.slot{slot: slot.leftBase, marble: <tally_flick>, effect: effect.combined{parts: [effect.given{effect: effect.combined{parts: [effect.speed_up{amount: 4}]}, slot: slot.apex}]}} outcome.slot{slot: slot.apex, marble: <hit_pocket>, effect: effect.combined{parts: [effect.speed_up{amount: 10}]}}",
      describeOverview(lensed, rules, t)
    );
    run(
      "R : les gains du tour déjà comptés",
      "overview.summary{speed: 13, mass: 2, impact: 26} outcome.empty{slot: slot.rightBase} outcome.slot{slot: slot.leftBase, marble: <tally_flick>, effect: effect.combined{parts: [effect.given{effect: effect.combined{parts: [effect.speed_up{amount: 4}]}, slot: slot.apex}]}} outcome.slot{slot: slot.apex, marble: <hit_pocket>, effect: effect.combined{parts: [effect.speed_up{amount: 10}]}}",
      describeOverview({ ...lensed, speed: 3, mass: 2 }, rules, t)
    );
    run(
      "R : valeurs négatives, planchers de l'Impact",
      "overview.summary{speed: −3, mass: 2, impact: 0} outcome.slot{slot: slot.rightBase, marble: <split_base>, effect: effect.combined{parts: [effect.mass_up{amount: 1}]}} outcome.empty{slot: slot.leftBase} outcome.slot{slot: slot.apex, marble: <flick_strike>, effect: effect.combined{parts: [effect.speed_down{amount: 3}]}}",
      describeOverview(playState({ triangle: { ...EMPTY_TRIANGLE, rightBase: { marble: "split_base", wear: 0 }, apex: { marble: "flick_strike", wear: 0 } } }), rules, t)
    );
    run(
      "R : Vitesse et Masse de deux billes",
      "overview.summary{speed: 3, mass: 2, impact: 6} outcome.empty{slot: slot.rightBase} outcome.slot{slot: slot.leftBase, marble: <split_base>, effect: effect.combined{parts: [effect.speed_up{amount: 3}]}} outcome.slot{slot: slot.apex, marble: <final_pocket>, effect: effect.combined{parts: [effect.mass_up{amount: 1}]}}",
      describeOverview(playState({ triangle: { ...EMPTY_TRIANGLE, leftBase: { marble: "split_base", wear: 0 }, apex: { marble: "final_pocket", wear: 0 } } }), rules, t)
    );
    run("R : rien à prévoir, partie finie", null, describeOverview({ ...lensed, stage: "over" }, rules, t));

    // La séquence, texte exact.
    const texts = (state) => {
      const resolved = answerChoices(rules, rules.reduce(state, { type: "resolve" }));
      const drawn = resolved.state.stage === "draw" ? answerChoices(rules, rules.reduce(resolved.state, { type: "draw" })).events : [];
      return resolutionSteps(state.turn, [...resolved.events, ...drawn], t).map((step) => step.text);
    };
    run.same(
      "séquence : un tour complet, sans pause entre l'ouverture et la première phase (base droite)",
      [
        "resolution.opening{turn: 2} outcome.empty{slot: slot.rightBase}",
        "outcome.slot{slot: slot.leftBase, marble: <tally_flick>, effect: effect.combined{parts: [effect.given{effect: effect.combined{parts: [effect.speed_up{amount: 4}]}, slot: slot.apex}]}}",
        "outcome.slot{slot: slot.apex, marble: <hit_pocket>, effect: effect.combined{parts: [effect.speed_up{amount: 10}]}}",
        "event.impact{impact: 10, score: 10}",
        "event.rotation{steps: 1, direction: clockwise}",
        "event.draw{marbles: [<final_pocket>]}",
        "event.turn_started{turn: 3}",
      ],
      texts(lensed)
    );
    const worn = playState({
      bag: ["final_pocket"],
      triangle: { leftBase: { marble: "one_shot", wear: 0 }, rightBase: { marble: "aging_flick", wear: 0 }, apex: { marble: "hit_pocket", wear: 2 } },
    });
    run.same(
      "séquence : une étape par bille usée",
      ["event.removed.wear{marble: <one_shot>}", "event.removed.wear{marble: <hit_pocket>}"],
      texts(worn).filter((text) => text.startsWith("event.removed.wear"))
    );
    run.same(
      "séquence : dernier tour, ni rotation ni pioche",
      [
        "event.removed.wear{marble: <one_shot>}",
        "event.effect_final{marble: <one_shot>, effect: effect.combined{parts: [effect.draw{amount: 1} | effect.eject_all{target: target.all_size{size: <size.small.name>}}]}, speed: 13, mass: 1}",
        "event.draw{marbles: [<final_pocket>]}",
        "event.target_empty_all",
        "event.removed.wear{marble: <hit_pocket>}",
        "event.impact{impact: 13, score: 13}",
        "event.game_over{score: 13, result: result.no_tier}",
      ],
      texts({ ...worn, turn: 10 }).slice(3)
    );
    run.same(
      "séquence : main pleine",
      [
        "event.draw_skipped.handFull",
        "event.turn_started{turn: 3}",
      ],
      texts({ ...lensed, hand: inHand(["aging_flick", "hit_polish", "awaken_draw", "final_pocket", "all_rounder"]) }).slice(-2)
    );
    run.same(
      "séquence : sac régénéré",
      [
        "event.bag_regenerated{size: 3}",
        "event.draw{marbles: [<aging_flick>]}",
        "event.turn_started{turn: 3}",
      ],
      texts({ ...lensed, bag: [], discard: ["aging_flick", "aging_flick", "aging_flick"] }).slice(-3)
    );
    // L'Éveil : juste après la bille piochée, aux compteurs du nouveau tour.
    run.same(
      "séquence : éveil après la pioche",
      [
        "event.draw{marbles: [<all_rounder>]}",
        "event.effect_awaken{marble: <all_rounder>, effect: effect.combined{parts: [effect.speed_up{amount: 2}]}, speed: 2, mass: 1}",
        "event.turn_started{turn: 3}",
      ],
      texts({ ...lensed, bag: ["all_rounder", "aging_flick"] }).slice(-3)
    );
    // L'enchaînement de awaken_draw : chaque Éveil coupe la liste des pioches.
    run.same(
      "séquence : enchaînement d'éveils",
      [
        "event.draw{marbles: [<awaken_draw>]}",
        "event.effect_awaken{marble: <awaken_draw>, effect: effect.combined{parts: [effect.draw{amount: 1}]}, speed: 0, mass: 1}",
        "event.draw{marbles: [<aging_flick> | <hit_polish>]}",
        "event.turn_started{turn: 3}",
      ],
      texts(overState(lensed, { hand: inHand([]), bag: ["awaken_draw", "aging_flick", "hit_polish"], drawPerTurn: 2 })).slice(-4)
    );
    run.same(
      "séquence : sac et défausse vides, le tour suivant commence quand même",
      [
        "event.draw_skipped.noMarbles",
        "event.turn_started{turn: 3}",
      ],
      texts({ ...lensed, bag: [], discard: [] }).slice(-2)
    );
    run(
      "séquence : crans et sens, paramètres du texte",
      "event.rotation{steps: 2, direction: counterclockwise}",
      t("marbles.event.rotation", { steps: 2, direction: "counterclockwise" })
    );
    run.same(
      "pioche : une liste, puis le début du tour",
      [
        "event.draw{marbles: [<aging_flick> | <hit_polish>]}",
        "event.turn_started{turn: 1}",
      ],
      buildSteps(
        [
          { type: "turnStarted", turn: 1, turnCount: 9 },
          { type: "draw", marble: "aging_flick" },
          { type: "draw", marble: "hit_polish" },
        ],
        t
      ).map((step) => step.text)
    );
    run("séquence : un déclencheur sans gabarit lève", true, throws(() => buildSteps([{ type: "effect", trigger: "nope", slot: "apex", marble: "aging_flick" }], t)));

    // L'ouverture partage l'étape de la base gauche (pas de pause entre elles), mais
    // reste un message à part pour l'historique ; l'indication du tour 1 se dit
    // sans y entrer.
    const opening = (hint) => {
      const resolved = rules.reduce(lensed, { type: "resolve" });
      return resolutionSteps(1, resolved.events, t, { hint })[0];
    };
    run("ouverture : avec la première phase (base droite), d'un seul tenant", "resolution.opening{turn: 1} outcome.empty{slot: slot.rightBase}", (opening(false).text));
    run("ouverture : l'indication après l'ouverture", "resolution.opening{turn: 1} resolution.hint outcome.empty{slot: slot.rightBase}", (opening(true).text));
    run.same("ouverture : deux messages, sans l'indication", [
      "resolution.opening{turn: 1}",
      "outcome.empty{slot: slot.rightBase}",
    ], opening(true).messages);

    // L'historique, texte exact : le début de partie n'en a pas ; après la première
    // résolution, le tour 1 entier, poses comprises, sans la pioche qui précède son
    // début.
    const game = playGame(7, {}, playOut);
    let history = EMPTY_HISTORY;
    let state = rules.createGame(7);
    const step = (action) => {
      const result = rules.reduce(state, action);
      state = result.state;
      return result.events;
    };
    history = recordSteps(history, buildSteps(step({ type: "draw" }), t));
    run("historique : rien au premier tour", null, history.previous);
    const placements = SLOTS.map((slot) => buildSteps(step({ type: "place", handIndex: 0, slot }), t));
    for (const steps of placements) history = recordSteps(history, steps);
    run("historique : rien tant que le tour 1 dure", null, history.previous);
    const resolved = step({ type: "resolve" });
    const drawn = step({ type: "draw" });
    const steps = resolutionSteps(1, [...resolved, ...drawn], t, { hint: true });
    history = recordSteps(history, steps);
    run.same(
      "historique : le tour 1 entier, dans l'ordre",
      [t("marbles.event.turn_started", { turn: 1 }), ...placements.flatMap((placed) => placed.map((s) => s.text)), ...steps.flatMap((s) => s.messages)],
      history.previous.messages
    );
    run("historique : son tour", 1, history.previous.turn);
    run("historique : finit au début du tour 2", "event.turn_started{turn: 2}", (history.previous.messages[history.previous.messages.length - 1]));
    run("historique : une partie finie garde son dernier tour", true, game.history.previous.messages.some((text) => text.startsWith("event.game_over")));
    run("historique : la partie finie, plus de tour en cours", null, game.history.current);

    // Le menu : les messages, puis Fermer ; seul Fermer agit.
    const menu = historyMenu({ turn: 4, messages: ["un.", "deux"] });
    run.same(
      "historique, menu : les messages dans l'ordre, puis Fermer",
      [
        "history.entry{text: un.}",
        "history.entry{text: deux}",
        "history.close",
      ],
      menu.entries.map((entry) => t(entry.label, entry.labelParams))
    );
    run.same("historique, menu : les messages sans action", [false, false, true], menu.entries.map((entry) => typeof entry.onActivate === "function"));
    run("historique, menu : son titre", "history.title{turn: 4}", t(menu.title, menu.titleParams));
    run("historique, menu : Échap ferme", true, menu.closable);
    run.same(
      "historique, menu : premier tour",
      [
        "history.empty",
        "history.close",
      ],
      historyMenu(null).entries.map((entry) => t(entry.label, entry.labelParams))
    );

    // La Pioche : une valeur comme une autre, dans R, la confirmation et la séquence.
    const drawing = playState({
      hand: inHand(["split_base"]),
      bag: ["final_pocket"],
      triangle: { leftBase: { marble: "awaken_draw", wear: 0 }, rightBase: null, apex: { marble: "size_count", wear: 0 } },
    });
    run(
      "pioche, R : une valeur finale",
      "overview.summary{speed: 0, mass: 1, impact: 0} outcome.empty{slot: slot.rightBase} outcome.slot{slot: slot.leftBase, marble: <awaken_draw>, effect: effect.combined{parts: [effect.draw{amount: 1}]}} outcome.slot{slot: slot.apex, marble: <size_count>, effect: effect.none}",
      describeOverview(drawing, rules, t)
    );
    run(
      "pioche, R : la régénération annoncée, sans rien révéler",
      "overview.summary{speed: 0, mass: 1, impact: 0} outcome.empty{slot: slot.rightBase} outcome.slot{slot: slot.leftBase, marble: <awaken_draw>, effect: effect.combined{parts: [effect.draw{amount: 1}]}} outcome.slot{slot: slot.apex, marble: <size_count>, effect: effect.none} forecast.regenerates",
      describeOverview({ ...drawing, bag: [], discard: ["aging_flick"] }, rules, t)
    );
    // Une bille qui pourrait être piochée a un Éveil : la fin de R le dit.
    run(
      "pioche, R : éveils possibles en fin d'annonce",
      true,
      describeOverview({ ...drawing, bag: [], discard: ["all_rounder"] }, rules, t).endsWith("forecast.regenerates forecast.awakenings")
    );
    run(
      "pioche, R : pas d'éveil possible sans pioche",
      false,
      describeOverview({ ...drawing, triangle: { ...drawing.triangle, leftBase: null }, bag: ["all_rounder"] }, rules, t).includes("Éveils")
    );
    run(
      "pioche, confirmation : éveils possibles, juste avant la ligne du pot",
      "forecast.awakenings",
      t(...(({ key, params }) => [key, params])(placementLines({ ...drawing, bag: ["all_rounder"] }, 0, "apex", rules, t).at(-2)))
    );
    // Le Tic pioche le sac (final_pocket) ; puis l'Éjection de size_count, sac vide,
    // régénère la défausse d'avant la pose (fragile), la délogée étant en partance ;
    // la base d'awaken_draw, à la résolution, régénère encore (size_count, arrivée).
    const drawingRegen = { ...drawing, discard: ["fragile"] };
    run.same(
      "pioche, confirmation : Tic et Éjection qui piochent, puis la régénération",
      [
        "place.question{marble: <split_base>, slot: slot.apex}",
        "place.values{effect: effect.combined{parts: [effect.speed_up{amount: 3}]}}",
        "place.flick{marble: <split_base>, effect: effect.none}",
        "place.hit{marble: <split_base>, effect: effect.combined{parts: [effect.draw{amount: 1}]}}",
        "place.knockout{marble: <size_count>, effect: effect.combined{parts: [effect.draw{amount: 1}]}}",
        "forecast.regenerates",
        "forecast.regenerates_again",
        "place.pot{reactions: effect.none}",
      ],
      placementLines(drawingRegen, 0, "apex", rules, t).map(({ key, params }) => t(key, params))
    );
    run.same(
      "pioche, séquence : la Pioche de la phase, puis la bille",
      [
        "resolution.opening{turn: 2} outcome.empty{slot: slot.rightBase}",
        "outcome.slot{slot: slot.leftBase, marble: <awaken_draw>, effect: effect.combined{parts: [effect.draw{amount: 1}]}}",
        "event.draw{marbles: [<final_pocket>]}",
      ],
      texts(drawing).slice(0, 3)
    );
    const placedEvents = rules.reduce(drawingRegen, { type: "place", handIndex: 0, slot: "apex" }).events;
    run.same(
      "pioche, pose : les billes piochées en cours de tour se disent, régénération comprise",
      [
        "event.placed{marble: <split_base>, slot: slot.apex}",
        "event.effect_hit{marble: <split_base>, effect: effect.combined{parts: [effect.draw{amount: 1}]}, speed: 0, mass: 1}",
        "event.draw{marbles: [<final_pocket>]}",
        "event.effect_knockout{marble: <size_count>, effect: effect.combined{parts: [effect.draw{amount: 1}]}, speed: 0, mass: 1}",
        "event.bag_regenerated{size: 1}",
        "event.draw{marbles: [<fragile>]}",
        "event.discarded.replacement{marble: <size_count>}",
      ],
      buildSteps(placedEvents, t).map((step) => step.text)
    );

    // Le Final : après la phase de sa bille dans R et la confirmation, à son retrait
    // dans la séquence, avant l'Impact.
    const finalState = playState({ hand: inHand(["one_shot"]), bag: ["final_pocket"], triangle: { leftBase: null, rightBase: null, apex: { marble: "fragile", wear: 1 } } });
    run(
      "final, R : après la phase, compté dans la prévision ; son Polissage au choix sans cible, prévu",
      "overview.summary{speed: 9, mass: 1, impact: 9} outcome.empty{slot: slot.rightBase} outcome.empty{slot: slot.leftBase} outcome.slot{slot: slot.apex, marble: <fragile>, effect: effect.combined{parts: [effect.speed_up{amount: 5}]}} outcome.final{effect: forecast_empty.after{effect: effect.combined{parts: [effect.speed_up{amount: 4} | effect.given_choice{effect: effect.polish{amount: 1}, target: choice.up_to{target: choice.noun.triangle_marble{count: 2}}, upTo: yes}]}, empty: effect.combined{parts: [forecast_empty.choice]}}}",
      describeOverview(finalState, rules, t)
    );
    run(
      "final, R : absent si la bille ne s'use pas ce tour",
      "overview.summary{speed: 5, mass: 1, impact: 5} outcome.empty{slot: slot.rightBase} outcome.empty{slot: slot.leftBase} outcome.slot{slot: slot.apex, marble: <fragile>, effect: effect.combined{parts: [effect.speed_up{amount: 5}]}}",
      describeOverview({ ...finalState, triangle: { ...finalState.triangle, apex: { marble: "fragile", wear: 0 } } }, rules, t)
    );
    run.same(
      "final, confirmation : avec les valeurs prévues de la bille posée",
      [
        "place.question{marble: <one_shot>, slot: slot.leftBase}",
        "place.values{effect: effect.combined{parts: [effect.speed_up{amount: 6}]}. outcome.final{effect: pocket.then{effect: effect.combined{parts: [effect.draw{amount: 1} | effect.eject_all{target: target.all_size{size: <size.small.name>}}]}, pockets: effect.combined{parts: [eject.ejected{marble: <fragile>}]}}}}",
        "place.flick{marble: <one_shot>, effect: effect.none}",
        "place.pot{reactions: effect.none}",
      ],
      placementLines(finalState, 0, "leftBase", rules, t).map(({ key, params }) => t(key, params))
    );
    run.same(
      "final, séquence : le retrait, son Final, rien à choisir (aucune interface), puis l'Impact",
      [
        "event.removed.wear{marble: <fragile>}",
        "event.effect_final{marble: <fragile>, effect: effect.combined{parts: [effect.speed_up{amount: 4} | effect.given_choice{effect: effect.polish{amount: 1}, target: choice.up_to{target: choice.noun.triangle_marble{count: 2}}, upTo: yes}]}, speed: 9, mass: 1}",
        "event.target_empty_choice",
        "event.impact{impact: 9, score: 9}",
      ],
      texts(finalState).slice(3, 7)
    );

    // Empocher : chez la bille qui le produit, avec ce qu'il déplace et son entrée au
    // pot ; la phase de la bille empochée, sautée.
    const pocketing = playState({ hand: inHand(["base_pocket"]), bag: ["aging_flick"], triangle: { leftBase: { marble: "base_pocket", wear: 0 }, rightBase: null, apex: { marble: "fragile", wear: 1 } } });
    run(
      "Empocher, R : chez base_pocket, fragile et son entrée ; la pointe retirée avant sa phase",
      "overview.summary{speed: 10, mass: 1, impact: 10} outcome.empty{slot: slot.rightBase} outcome.slot{slot: slot.leftBase, marble: <base_pocket>, effect: pocket.then{effect: effect.combined{parts: [effect.pocket_slot{slot: slot.apex}]}, pockets: effect.combined{parts: [pocket.entered_effect{marble: <fragile>, effect: effect.combined{parts: [effect.speed_up{amount: 10}]}}]}}} outcome.removed{slot: slot.apex, marble: <fragile>}",
      describeOverview(pocketing, rules, t)
    );
    run.same(
      "Empocher, séquence : l'effet, la mise en poche, l'entrée, la phase sautée",
      [
        "resolution.opening{turn: 2} outcome.empty{slot: slot.rightBase}",
        "outcome.slot{slot: slot.leftBase, marble: <base_pocket>, effect: effect.combined{parts: [effect.pocket_slot{slot: slot.apex}]}}",
        "event.pocketed{marble: <fragile>}",
        "event.effect_pocket_entry{marble: <fragile>, effect: effect.combined{parts: [effect.speed_up{amount: 10}]}, speed: 10, mass: 1}",
        "outcome.empty{slot: slot.apex}",
        "event.impact{impact: 10, score: 10}",
      ],
      texts(pocketing).slice(0, 6)
    );
    run.same(
      "Empocher, confirmation : dans les valeurs prévues de la bille posée",
      [
        "place.question{marble: <base_pocket>, slot: slot.rightBase}",
        "place.values{effect: pocket.then{effect: effect.combined{parts: [effect.pocket_slot{slot: slot.apex}]}, pockets: effect.combined{parts: [pocket.entered_effect{marble: <fragile>, effect: effect.combined{parts: [effect.speed_up{amount: 10}]}}]}}}",
        "place.flick{marble: <base_pocket>, effect: effect.none}",
        "place.pot{reactions: effect.none}",
      ],
      placementLines({ ...pocketing, triangle: { ...pocketing.triangle, leftBase: null } }, 0, "rightBase", rules, t).map(({ key, params }) => t(key, params))
    );
    // Un choix pendant la résolution : la séquence s'arrête au Final de la
    // fragile (ses étapes jusque-là, l'Impact pas encore dit), le choix se fait,
    // puis la suite reprend : les billes choisies, leur Polissage, l'Impact.
    const choosing = playState({ bag: ["aging_flick"], hand: inHand([]), triangle: { leftBase: { marble: "aging_flick", wear: 0 }, rightBase: { marble: "final_pocket", wear: 1 }, apex: { marble: "fragile", wear: 1 } } });
    const suspended = rules.reduce(choosing, { type: "resolve" });
    const before = resolutionSteps(2, suspended.events, t).map((step) => step.text);
    run("choix en résolution : la séquence s'arrête au Final qui fait choisir", "event.effect_final{marble: <fragile>, effect: effect.combined{parts: [effect.speed_up{amount: 4} | effect.given_choice{effect: effect.polish{amount: 1}, target: choice.up_to{target: choice.noun.triangle_marble{count: 2}}, upTo: yes}]}, speed: 10, mass: 2}", before.at(-1));
    run("choix en résolution : l'Impact pas encore dit", false, before.some((text) => text.startsWith("Impact")));
    run(
      "choix en résolution : R refusé pendant le choix (prévision refusée)",
      "choicePending",
      rules.forecast(suspended.state).error
    );
    const picked = rules.reduce(suspended.state, { type: "choose", target: { zone: "triangle", slot: "rightBase" } });
    const finished = rules.reduce(picked.state, { type: "choose", done: true });
    run.same(
      "choix en résolution : la suite reprend après les réponses",
      [
        "choice.chosen{marble: <final_pocket>}",
        "choice.ended.done",
        "event.polished{marble: <final_pocket>, wear: 1, maxWear: 3}",
        "event.impact{impact: 20, score: 20}",
      ],
      [...buildSteps(picked.events, t), ...buildSteps(finished.events, t)].map((step) => step.text).slice(0, 4)
    );

    // Éjecter : chez la bille qui éjecte, avec ce qu'elle chasse et l'Éjection
    // provoquée ; dans la séquence, l'éjection puis l'Éjection, à leur place.
    const ejecting = playState({ hand: inHand(["flick_strike"]), triangle: { ...EMPTY_TRIANGLE, apex: { marble: "tally_flick", wear: 0 } } });
    run(
      "Éjecter, confirmation : la Chiquenaude de flick_strike, tally_flick chassée et son Éjection",
      "place.flick{marble: <flick_strike>, effect: pocket.then{effect: effect.combined{parts: [effect.eject_slot{slot: slot.apex}]}, pockets: effect.combined{parts: [eject.ejected_effect{marble: <tally_flick>, effect: effect.combined{parts: [effect.speed_up{amount: 3}]}}]}}}",
      t(...(({ key, params }) => [key, params])(placementLines(ejecting, 0, "apex", rules, t)[2]))
    );
    run(
      "Éjecter, confirmation : ni Tic, ni Éjection par la pose",
      "place.hit{marble: <flick_strike>, effect: effect.none} ; place.knockout{marble: <tally_flick>, effect: effect.none}",
      placementLines(ejecting, 0, "apex", rules, t).slice(3, 5).map(({ key, params }) => t(key, params)).join(" ; ")
    );
    run.same(
      "Éjecter, pose dite : l'éjection, l'Éjection de tally_flick, la pose",
      [
        "event.effect_flick{marble: <flick_strike>, effect: effect.combined{parts: [effect.eject_slot{slot: slot.apex}]}, speed: 0, mass: 1}",
        "event.eject{source: <flick_strike>, marble: <tally_flick>}",
        "event.effect_knockout{marble: <tally_flick>, effect: effect.combined{parts: [effect.speed_up{amount: 3}]}, speed: 3, mass: 1}",
        "event.placed{marble: <flick_strike>, slot: slot.apex}",
      ],
      buildSteps(rules.reduce(ejecting, { type: "place", handIndex: 0, slot: "apex" }).events, t).map((step) => step.text)
    );
    // Le Final de one_shot pendant la résolution : R le dit chez elle, la séquence à sa place.
    const giantFinal = playState({ bag: ["aging_flick"], triangle: { leftBase: { marble: "tally_flick", wear: 0 }, rightBase: { marble: "aging_flick", wear: 0 }, apex: { marble: "one_shot", wear: 0 } } });
    run(
      "Éjecter, R : le Final de one_shot, tally_flick chassée et son Éjection",
      true,
      describeOverview(giantFinal, rules, t).endsWith(
        "outcome.final{effect: pocket.then{effect: effect.combined{parts: [effect.draw{amount: 1} | effect.eject_all{target: target.all_size{size: <size.small.name>}}]}, pockets: effect.combined{parts: [eject.ejected_effect{marble: <tally_flick>, effect: effect.combined{parts: [effect.speed_up{amount: 3}]}}]}}}"
      )
    );
    run.same(
      "Éjecter, séquence : après le Final, l'éjection et l'Éjection, avant l'Impact",
      [
        "event.effect_final{marble: <one_shot>, effect: effect.combined{parts: [effect.draw{amount: 1} | effect.eject_all{target: target.all_size{size: <size.small.name>}}]}, speed: 11, mass: 1}",
        "event.draw{marbles: [<aging_flick>]}",
        "event.eject{source: <one_shot>, marble: <tally_flick>}",
        "event.effect_knockout{marble: <tally_flick>, effect: effect.combined{parts: [effect.speed_up{amount: 3}]}, speed: 14, mass: 1}",
      ],
      texts(giantFinal).slice(4, 8)
    );
    // La base de all_rounder : un choix pendant la résolution, « selon votre choix ».
    const tigerBase = playState({ triangle: { leftBase: { marble: "all_rounder", wear: 0 }, rightBase: null, apex: { marble: "aging_flick", wear: 0 } } });
    run("Éjecter au choix, R : selon votre choix", true, describeOverview(tigerBase, rules, t).includes(
        "outcome.slot{slot: slot.leftBase, marble: <all_rounder>, effect: forecast_choice.after{effect: effect.combined{parts: [effect.eject_choice{target: choice.noun.triangle_marble{count: 1}}]}}}"
      ));

    // Les réactions du pot (En poche, à chaque (occurrence)). Pendant la pose : à leur
    // place chronologique, après l'effet de la bille concernée ; la confirmation les
    // dit dans sa ligne du pot, par bille dans l'ordre d'arrivée.
    const reacting = playState({ hand: inHand(["aging_flick"]), pot: ["size_count", "all_rounder"], triangle: { ...EMPTY_TRIANGLE, apex: { marble: "hit_polish", wear: 0 } } });
    const reactingPlace = rules.reduce(reacting, { type: "place", handIndex: 0, slot: "apex" });
    run.same(
      "réaction, pose dite : la Chiquenaude puis all_rounder, la pose et son Tic, l'éjection puis size_count",
      [
        "event.effect_flick{marble: <aging_flick>, effect: effect.none, speed: 0, mass: 1}",
        "outcome.pot{marble: <all_rounder>, effect: effect.combined{parts: [effect.speed_up{amount: 2}]}, speed: 2, mass: 1}",
        "event.placed{marble: <aging_flick>, slot: slot.apex}",
        "event.effect_hit{marble: <aging_flick>, effect: effect.combined{parts: [effect.speed_up{amount: 2}]}, speed: 4, mass: 1}",
        "outcome.pot{marble: <size_count>, effect: effect.combined{parts: [effect.mass_up{amount: 1}]}, speed: 4, mass: 2}",
        "event.discarded.replacement{marble: <hit_polish>}",
      ],
      buildSteps(reactingPlace.events, t).map((step) => step.text).slice(0, 6)
    );
    run(
      "réaction, confirmation : la ligne du pot, par bille, avant Annuler",
      "place.pot{reactions: place.more{first: place.pot_marble{marble: <size_count>, effect: effect.combined{parts: [effect.mass_up{amount: 1}]}}, rest: place.pot_marble{marble: <all_rounder>, effect: effect.combined{parts: [effect.speed_up{amount: 2}]}}}}",
      t(...(({ key, params }) => [key, params])(placementLines(reacting, 0, "apex", rules, t).at(-1)))
    );
    run(
      "réaction, confirmation : sur un emplacement vide, all_rounder seule",
      "place.pot{reactions: place.pot_marble{marble: <all_rounder>, effect: effect.combined{parts: [effect.speed_up{amount: 2}]}}}",
      t(...(({ key, params }) => [key, params])(placementLines(reacting, 0, "leftBase", rules, t).at(-1)))
    );
    // Pendant la résolution : awaken_draw du pot polit la pointe au mélange que provoque
    // la Pioche de la base gauche ; R le compte dans sa ligne du pot.
    const shuffling = playState({
      bag: [],
      discard: ["aging_flick", "hit_polish"],
      hand: inHand([]),
      pot: ["awaken_draw"],
      triangle: { leftBase: { marble: "awaken_draw", wear: 0 }, rightBase: null, apex: { marble: "fragile", wear: 1 } },
    });
    run(
      "réaction, R : dans la ligne de la bille du pot",
      "overview.summary{speed: 5, mass: 1, impact: 5} outcome.empty{slot: slot.rightBase} outcome.slot{slot: slot.leftBase, marble: <awaken_draw>, effect: effect.combined{parts: [effect.draw{amount: 1}]}} outcome.slot{slot: slot.apex, marble: <fragile>, effect: effect.combined{parts: [effect.speed_up{amount: 5}]}} outcome.pot{marble: <awaken_draw>, effect: effect.combined{parts: [effect.given{effect: effect.polish{amount: 1}, slot: slot.apex}]}} forecast.regenerates",
      describeOverview(shuffling, rules, t)
    );
    run.same(
      "réaction, séquence : au mélange pendant les phases, retenue jusqu'à l'étape du pot",
      [
        "resolution.opening{turn: 2} outcome.empty{slot: slot.rightBase}",
        "outcome.slot{slot: slot.leftBase, marble: <awaken_draw>, effect: effect.combined{parts: [effect.draw{amount: 1}]}}",
        "event.bag_regenerated{size: 2}",
        "event.draw{marbles: [<aging_flick>]}",
        "outcome.slot{slot: slot.apex, marble: <fragile>, effect: effect.combined{parts: [effect.speed_up{amount: 5}]}}",
        "outcome.pot{marble: <awaken_draw>, effect: effect.combined{parts: [effect.given{effect: effect.polish{amount: 1}, slot: slot.apex}]}, speed: 5, mass: 1}",
        "event.polished{marble: <fragile>, wear: 1, maxWear: 2}",
      ],
      texts(shuffling).slice(0, 7)
    );
    // Une bille du pot qui joue plusieurs fois dans la résolution : une seule ligne
    // dans R, ses valeurs regroupées ; une bille qui ne joue rien, aucune.
    const potPlayers = playState({ pot: ["final_pocket", "hit_polish"], triangle: { leftBase: { marble: "aging_flick", wear: 0 }, rightBase: null, apex: { marble: "aging_flick", wear: 0 } } });
    run(
      "R : une ligne par bille du pot qui joue, rien pour hit_polish",
      true,
      describeOverview(potPlayers, rules, t).endsWith("outcome.slot{slot: slot.apex, marble: <aging_flick>, effect: effect.combined{parts: [effect.speed_up{amount: 4}]}} outcome.pot{marble: <final_pocket>, effect: effect.combined{parts: [effect.mass_up{amount: 1}]}}")
    );
    // L'historique garde les réactions de la pose.
    const placeSteps = buildSteps(reactingPlace.events, t);
    run(
      "réaction, historique : la réaction de la pose y figure",
      true,
      recordSteps({ ...EMPTY_HISTORY, current: [], currentTurn: 2 }, placeSteps).current.includes("outcome.pot{marble: <all_rounder>, effect: effect.combined{parts: [effect.speed_up{amount: 2}]}, speed: 2, mass: 1}")
    );

    // Le pot plein : la perte se dit, sans entrée.
    const lostState = { ...pocketing, pot: ["aging_flick", "hit_polish", "awaken_draw"] };
    run.same(
      "Empocher, pot plein : la perte",
      [
        "resolution.opening{turn: 2} outcome.empty{slot: slot.rightBase}",
        "outcome.slot{slot: slot.leftBase, marble: <base_pocket>, effect: effect.combined{parts: [effect.pocket_slot{slot: slot.apex}]}}",
        "event.lost{marble: <fragile>}",
      ],
      texts(lostState).slice(0, 3)
    );
    run(
      "Empocher, pot plein, R : la perte chez base_pocket",
      true,
      describeOverview(lostState, rules, t).includes(
        "outcome.slot{slot: slot.leftBase, marble: <base_pocket>, effect: pocket.then{effect: effect.combined{parts: [effect.pocket_slot{slot: slot.apex}]}, pockets: effect.combined{parts: [pocket.lost{marble: <fragile>}]}}}"
      )
    );
    // Une cible vide se prévoit, chez l'effet qui la vise, avant ce qu'il empoche :
    // le Final de final_pocket seule en pointe polit sa propre place, déjà vide.
    const lonelyFinalPocket = playState({ bag: ["aging_flick"], triangle: { leftBase: null, rightBase: null, apex: { marble: "final_pocket", wear: 2 } } });
    run(
      "cible vide, R : chez le Final de final_pocket, avant sa mise en poche",
      true,
      describeOverview(lonelyFinalPocket, rules, t).endsWith(
        "outcome.final{effect: pocket.then{effect: forecast_empty.after{effect: effect.combined{parts: [effect.given{effect: effect.polish{amount: 1}, slot: slot.apex} | effect.pocket_self]}, empty: effect.combined{parts: [forecast_empty.slot{slot: slot.apex}]}}, pockets: effect.combined{parts: [pocket.entered{marble: <final_pocket>}]}}}"
      )
    );
    run.same(
      "cible vide, séquence : dite à part, comme avant",
      ["event.target_empty{slot: slot.apex}"],
      texts(lonelyFinalPocket).filter((text) => text.startsWith("event.target_empty"))
    );
    // Les billes du pot à chaque résolution : après les trois emplacements, une ligne
    // ou une étape par bille qui a cet effet (pas hit_polish), avant les retraits.
    const potState = playState({ triangle: { leftBase: { marble: "tally_flick", wear: 0 }, rightBase: null, apex: { marble: "fragile", wear: 0 } }, pot: ["final_pocket", "hit_polish", "base_pocket"] });
    run(
      "pot, R : une ligne par bille du pot qui a un effet de résolution, comptée dans le total",
      "overview.summary{speed: 13, mass: 2, impact: 26} outcome.empty{slot: slot.rightBase} outcome.slot{slot: slot.leftBase, marble: <tally_flick>, effect: effect.combined{parts: [effect.given{effect: effect.combined{parts: [effect.speed_up{amount: 4}]}, slot: slot.apex}]}} outcome.slot{slot: slot.apex, marble: <fragile>, effect: effect.combined{parts: [effect.speed_up{amount: 9}]}} outcome.pot{marble: <final_pocket>, effect: effect.combined{parts: [effect.mass_up{amount: 1}]}} outcome.pot{marble: <base_pocket>, effect: effect.combined{parts: [effect.speed_up{amount: 4}]}}",
      describeOverview(potState, rules, t)
    );
    run.same(
      "pot, séquence : après la pointe, une étape par bille qui a un effet, puis l'Impact",
      [
        "outcome.slot{slot: slot.apex, marble: <fragile>, effect: effect.combined{parts: [effect.speed_up{amount: 9}]}}",
        "outcome.pot{marble: <final_pocket>, effect: effect.combined{parts: [effect.mass_up{amount: 1}]}, speed: 9, mass: 2}",
        "outcome.pot{marble: <base_pocket>, effect: effect.combined{parts: [effect.speed_up{amount: 4}]}, speed: 13, mass: 2}",
        "event.impact{impact: 26, score: 26}",
      ],
      texts(potState).slice(2, 6)
    );
    const quietPot = { ...potState, pot: ["hit_polish"] };
    run("pot : une bille sans effet de résolution ne se dit jamais", false, texts(quietPot).some((text) => text.startsWith("Pot")) || describeOverview(quietPot, rules, t).includes("Pot"));
    const saving = playState({ bag: ["aging_flick"], triangle: { leftBase: { marble: "final_pocket", wear: 2 }, rightBase: null, apex: { marble: "fragile", wear: 1 } } });
    run(
      "Polissage, R : le Final de final_pocket polit la pointe et l'empoche, fragile n'est pas retirée",
      "overview.summary{speed: 5, mass: 2, impact: 10} outcome.empty{slot: slot.rightBase} outcome.slot{slot: slot.leftBase, marble: <final_pocket>, effect: effect.combined{parts: [effect.mass_up{amount: 1}]}} outcome.final{effect: pocket.then{effect: effect.combined{parts: [effect.given{effect: effect.polish{amount: 1}, slot: slot.apex} | effect.pocket_self]}, pockets: effect.combined{parts: [pocket.entered{marble: <final_pocket>}]}}} outcome.slot{slot: slot.apex, marble: <fragile>, effect: effect.combined{parts: [effect.speed_up{amount: 5}]}}",
      describeOverview(saving, rules, t)
    );
    run.same(
      "Polissage, séquence : le retrait de final_pocket, son Final, fragile polie, final_pocket en poche",
      [
        "event.removed.wear{marble: <final_pocket>}",
        "event.effect_final{marble: <final_pocket>, effect: effect.combined{parts: [effect.given{effect: effect.polish{amount: 1}, slot: slot.apex} | effect.pocket_self]}, speed: 5, mass: 2}",
        "event.polished{marble: <fragile>, wear: 1, maxWear: 2}",
        "event.pocketed{marble: <final_pocket>}",
        "event.impact{impact: 10, score: 10}",
      ],
      texts(saving).slice(3, 8)
    );

    // La Chiquenaude : sa ligne de confirmation, toujours là, avec la valeur calculée ;
    // celle qui vide l'emplacement laisse l'Éjection et le Tic sans effet.
    const flicking = playState({ hand: inHand(["aging_flick"], 2), triangle: { ...EMPTY_TRIANGLE, apex: { marble: "all_rounder", wear: 0 } } });
    run.same(
      "chiquenaude, confirmation : la valeur calculée, dans l'ordre réel",
      [
        "place.flick{marble: <aging_flick>, effect: effect.combined{parts: [effect.speed_up{amount: 2}]}}",
        "place.hit{marble: <aging_flick>, effect: effect.combined{parts: [effect.speed_up{amount: 2}]}}",
        "place.knockout{marble: <all_rounder>, effect: effect.none}",
        "place.pot{reactions: effect.none}",
      ],
      placementLines(flicking, 0, "apex", rules, t).map(({ key, params }) => t(key, params)).slice(2)
    );
    const clearing = playState({ hand: inHand(["flick_strike"]), triangle: { ...EMPTY_TRIANGLE, apex: { marble: "aging_flick", wear: 0 } } });
    run.same(
      "chiquenaude, confirmation : l'emplacement vidé par Éjecter, ni Tic ni Éjection par la pose",
      [
        "place.question{marble: <flick_strike>, slot: slot.apex}",
        "place.values{effect: effect.combined{parts: [effect.speed_down{amount: 3}]}}",
        "place.flick{marble: <flick_strike>, effect: pocket.then{effect: effect.combined{parts: [effect.eject_slot{slot: slot.apex}]}, pockets: effect.combined{parts: [eject.ejected{marble: <aging_flick>}]}}}",
        "place.hit{marble: <flick_strike>, effect: effect.none}",
        "place.knockout{marble: <aging_flick>, effect: effect.none}",
        "place.pot{reactions: effect.none}",
      ],
      placementLines(clearing, 0, "apex", rules, t).map(({ key, params }) => t(key, params))
    );
    run.same(
      "chiquenaude, journal dit : l'éjection, puis la pose",
      [
        "event.effect_flick{marble: <flick_strike>, effect: effect.combined{parts: [effect.eject_slot{slot: slot.apex}]}, speed: 0, mass: 1}",
        "event.eject{source: <flick_strike>, marble: <aging_flick>}",
        "event.placed{marble: <flick_strike>, slot: slot.apex}",
      ],
      buildSteps(rules.reduce(clearing, { type: "place", handIndex: 0, slot: "apex" }).events, t).map((step) => step.text)
    );

    // La Trouvaille : juste après la régénération, chez la bille qui la produit, dans
    // R, la confirmation et la séquence.
    const windfalls = playState({
      hand: inHand(["split_base"]),
      bag: [],
      discard: ["aging_flick"],
      triangle: { leftBase: { marble: "all_rounder", wear: 0 }, rightBase: { marble: "final_pocket", wear: 1 }, apex: { marble: "hit_polish", wear: 0 } },
    });
    run.same(
      "trouvaille, confirmation : après la régénération, une ligne par bille",
      [
        "forecast.regenerates",
        "forecast.windfall{marble: <final_pocket>, effect: effect.combined{parts: [effect.polish{amount: 1}]}}",
        "forecast.windfall{marble: <all_rounder>, effect: effect.combined{parts: [effect.speed_up{amount: 3}]}}",
      ],
      placementLines(windfalls, 0, "apex", rules, t).map(({ key, params }) => t(key, params)).slice(-4, -1)
    );
    run.same(
      "trouvaille, pose dite : la régénération, puis les trouvailles, puis la pioche, puis l'arrivée de la délogée",
      [
        "event.bag_regenerated{size: 1}",
        "event.effect_windfall{marble: <final_pocket>, effect: effect.combined{parts: [effect.polish{amount: 1}]}, speed: 0, mass: 1}",
        "event.polished{marble: <final_pocket>, wear: 0, maxWear: 3}",
        "event.effect_windfall{marble: <all_rounder>, effect: effect.combined{parts: [effect.speed_up{amount: 3}]}, speed: 3, mass: 1}",
        "event.draw{marbles: [<aging_flick>]}",
        "event.discarded.replacement{marble: <hit_polish>}",
      ],
      buildSteps(rules.reduce(windfalls, { type: "place", handIndex: 0, slot: "apex" }).events, t).map((step) => step.text).slice(-6)
    );
    const resolvingWindfall = playState({
      hand: inHand([]),
      bag: [],
      discard: ["aging_flick"],
      triangle: { leftBase: { marble: "awaken_draw", wear: 0 }, rightBase: null, apex: { marble: "all_rounder", wear: 0 } },
    });
    run(
      "trouvaille, R : après la régénération, chez la bille qui la produit",
      "overview.summary{speed: 2, mass: 1, impact: 2} outcome.empty{slot: slot.rightBase} outcome.slot{slot: slot.leftBase, marble: <awaken_draw>, effect: effect.combined{parts: [effect.draw{amount: 1}]}} outcome.slot{slot: slot.apex, marble: <all_rounder>, effect: effect.combined{parts: [effect.speed_down{amount: 1}]}} forecast.regenerates forecast.windfall{marble: <all_rounder>, effect: effect.combined{parts: [effect.speed_up{amount: 3}]}}",
      describeOverview(resolvingWindfall, rules, t)
    );
    // La Chute : dans R, sur la ligne de l'emplacement quitté, après le Final ; dans la
    // séquence, après le Final, « Chute de … ».
    const dropping = fabricatedRules({ faller: { maxWear: 1, final: [{ action: "mass", amount: 1 }], drop: [{ action: "speed", amount: 3 }] }, plain: {} });
    const falling = marblesPlayState(dropping, { score: 0, hand: inHand([]), bag: ["plain"], triangle: { rightBase: null, leftBase: null, apex: { marble: "faller", wear: 0 } } });
    run(
      "chute, R : après le Final, sur l'emplacement quitté",
      true,
      describeOverview(falling, dropping, t).includes(
        "outcome.final{effect: effect.combined{parts: [effect.mass_up{amount: 1}]}} outcome.drop{effect: effect.combined{parts: [effect.speed_up{amount: 3}]}}"
      )
    );
    const fallingSteps = resolutionSteps(2, dropping.reduce(falling, { type: "resolve" }).events, t).map((step) => step.text);
    run.same(
      "chute, séquence : le départ, le Final, puis la Chute",
      [
        "event.removed.wear{marble: <faller>}",
        "event.effect_final{marble: <faller>, effect: effect.combined{parts: [effect.mass_up{amount: 1}]}, speed: 0, mass: 2}",
        "event.effect_drop{marble: <faller>, effect: effect.combined{parts: [effect.speed_up{amount: 3}]}, speed: 3, mass: 2}",
      ],
      fallingSteps.filter((text) => /faller/.test(text) && !text.startsWith("outcome"))
    );

    // Deux régénérations : chacune se dit avec ses propres Trouvailles, la seconde
    // « de nouveau » (la Pioche de drawer en phase, puis celle de son Final, après
    // l'arrivée de worn à la défausse).
    const regenTwice = fabricatedRules({
      finder: { windfall: [{ action: "speed", amount: 3 }] },
      worn: { maxWear: 1 },
      drawer: { base: [{ action: "draw", amount: 1 }], final: [{ action: "draw", amount: 1 }], maxWear: 1 },
      spare: {},
    });
    const twice = playState({
      hand: inHand([]),
      bag: [],
      discard: ["spare"],
      triangle: { rightBase: { marble: "worn", wear: 0 }, leftBase: { marble: "drawer", wear: 0 }, apex: { marble: "finder", wear: 0 } },
    });
    run(
      "trouvaille, R : chaque régénération avec ses trouvailles",
      true,
      describeOverview(twice, regenTwice, t).endsWith(
        "forecast.regenerates forecast.windfall{marble: <finder>, effect: effect.combined{parts: [effect.speed_up{amount: 3}]}} forecast.regenerates_again forecast.windfall{marble: <finder>, effect: effect.combined{parts: [effect.speed_up{amount: 3}]}}"
      )
    );
    run.same(
      "trouvaille, séquence : juste après la régénération",
      [
        "event.bag_regenerated{size: 1}",
        "event.effect_windfall{marble: <all_rounder>, effect: effect.combined{parts: [effect.speed_up{amount: 3}]}, speed: 3, mass: 1}",
        "event.draw{marbles: [<aging_flick>]}",
      ],
      texts(resolvingWindfall).slice(2, 5)
    );

    // Conditions de calibre : R, la confirmation et la séquence ne disent que les
    // valeurs finales, jamais la condition.
    const sized = playState({
      hand: inHand(["hit_pocket"]),
      triangle: { leftBase: { marble: "size_count", wear: 0 }, rightBase: { marble: "fragile", wear: 0 }, apex: { marble: "final_pocket", wear: 0 } },
    });
    run(
      "calibre, R : size_count compte une minibille, final_pocket sans calot en base gauche",
      "overview.summary{speed: 3, mass: 2, impact: 6} outcome.slot{slot: slot.rightBase, marble: <fragile>, effect: effect.combined{parts: [effect.speed_up{amount: 2}]}} outcome.slot{slot: slot.leftBase, marble: <size_count>, effect: effect.combined{parts: [effect.speed_up{amount: 1}]}} outcome.slot{slot: slot.apex, marble: <final_pocket>, effect: effect.combined{parts: [effect.mass_up{amount: 1}]}}",
      describeOverview(sized, rules, t)
    );
    run.same(
      "calibre, confirmation : le Tic de hit_pocket, sa valeur finale",
      [
        "place.flick{marble: <hit_pocket>, effect: effect.none}",
        "place.hit{marble: <hit_pocket>, effect: forecast_empty.after{effect: effect.combined{parts: [effect.speed_up{amount: 4} | effect.pocket_choice{target: choice.noun.hand_marble{count: 1}}]}, empty: effect.combined{parts: [forecast_empty.choice]}}}",
        "place.knockout{marble: <fragile>, effect: effect.none}",
        "place.pot{reactions: effect.none}",
      ],
      placementLines(sized, 0, "rightBase", rules, t).map(({ key, params }) => t(key, params)).slice(2)
    );
    run(
      "Empocher, confirmation : l'entrée au pot prévue, chez le Tic qui empoche",
      "place.hit{marble: <hit_pocket>, effect: pocket.then{effect: effect.combined{parts: [effect.speed_up{amount: 4} | effect.pocket_hand]}, pockets: effect.combined{parts: [pocket.entered_effect{marble: <fragile>, effect: effect.combined{parts: [effect.speed_up{amount: 10}]}}]}}}",
      t(...(({ key, params }) => [key, params])(placementLines({ ...sized, hand: inHand(["hit_pocket", "fragile"]) }, 0, "rightBase", fixedRules, t).at(-3)))
    );
    const boulderLeft = { ...sized, triangle: { ...sized.triangle, leftBase: { marble: "one_shot", wear: 0 } } };
    run(
      "calibre, séquence : final_pocket avec un calot en base gauche",
      "outcome.slot{slot: slot.apex, marble: <final_pocket>, effect: effect.combined{parts: [effect.mass_up{amount: 3}]}}",
      texts(boulderLeft)[2]
    );

  }
}

function checkQueue(run) {
  const settings = { resolutionPauseBaseMs: 100, resolutionPausePerCharMs: 10 };
  run("pause : base plus supplément par caractère", 130, pauseAfter("abc", settings));
  run("pause : en caractères, pas en unités UTF-16", pauseAfter("ab", settings), pauseAfter("œ😀", settings));
  run("pause : s'allonge avec le message", true, pauseAfter("Impact 12. Score 40.", settings) > pauseAfter("Base droite, vide.", settings));
  run("pause : réglages exposés", true, ["resolutionPauseBaseMs", "resolutionPausePerCharMs"].every((name) => typeof MARBLES_SETTINGS[name] === "number"));
  run("pause : réglage négatif refusé", true, throws(() => validatePauseSettings({ ...settings, resolutionPauseBaseMs: -1 })));
  run("pause : réglage absent refusé", true, throws(() => validatePauseSettings({ resolutionPauseBaseMs: 100 })));
  run("pause : réglage non numérique refusé", true, throws(() => validatePauseSettings({ ...settings, resolutionPausePerCharMs: NaN })));

  const steps = ["un", "deux", "trois"].map((text) => ({ text, events: [] }));
  const started = startSequence(steps, settings);
  run("file : la première étape se dit tout de suite", "un", started.step.text);
  run("file : la pause de l'étape en cours", 120, started.sequence.remainingMs);
  const early = advanceSequence(started.sequence, 119);
  run("file : rien avant la fin de la pause", null, early.step);
  const second = advanceSequence(early.sequence, 1);
  run("file : l'étape suivante à la fin de la pause", "deux", second.step.text);
  run("file : sa pause propre", 140, second.sequence.remainingMs);
  const last = advanceSequence(second.sequence, 10_000);
  run("file : une étape au plus par appel", "trois", last.step.text);
  run("file : finie quand la dernière étape est dite", null, last.sequence);
  run("file : passer, directement à la dernière étape", "trois", skipSequence(started.sequence).step.text);
  run("file : passer la finit", null, skipSequence(started.sequence).sequence);
  run("file : redire relance la pause", 120, restartPause(early.sequence).remainingMs);
  run("file : une seule étape, aussitôt finie", null, startSequence(steps.slice(0, 1), settings).sequence);
  run("file : vide", null, startSequence([], settings).step);
  run.same("file : dite jusqu'au bout, toutes les étapes dans l'ordre", ["un", "deux", "trois"], playOut(steps).map((step) => step.text));
}

// La présentation de la résolution (marbles/view/resolution.js), sa part pure : la
// main de chaque étape, remontée depuis la main finale, et la question d'un choix
// en étape. Son déroulé, lui, se joue par le banc d'essai de l'écran (domaine
// marbles-screen).
function checkPresentation(run) {
  const draw = { type: "draw", marble: "aging_flick", cause: "effect" };
  const steps = [
    { text: "a", events: [draw] },
    { text: "b", events: [{ type: "placed", slot: "apex", marble: "one_shot" }] },
    { text: "c", events: [] },
    { text: "d", events: [draw, draw] },
  ];
  run.same(
    "présentation : la main de chaque étape, remontée depuis la main finale (5)",
    [4, 3, 3, 5],
    withHandSizes(steps, 5).map((step) => step.handSize)
  );
  run.same("présentation : les étapes gardent leur texte", ["a", "b", "c", "d"], withHandSizes(steps, 5).map((step) => step.text));
  const pending = { action: "polish", amount: 1, zones: ["triangle"], pick: "marble", count: 1, mode: "required", by: { trigger: "hit", slot: "apex", marble: "hit_polish" }, eligible: [], chosen: [], remaining: 1 };
  const prompt = choicePromptStep(pending, keyText);
  run.same("présentation : la question d'un choix, une étape sans évènement, retenue comme message", { events: [], messages: [prompt.text] }, { events: prompt.events, messages: prompt.messages });
}

export default function checkMarblesSequence(run) {
  run.section("file d'étapes", checkQueue);
  run.section("présentation de la résolution", checkPresentation);
  run.section("textes", checkTexts);
  run.section("parties jouées", checkRealGames);
}
