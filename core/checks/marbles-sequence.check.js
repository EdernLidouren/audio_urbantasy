// Vérifications — domaine « marbles-sequence ». La vue d'ensemble du tour
// (touche R) et la séquence de résolution (Maj+R) du jeu des billes : l'ordre de
// ses étapes sur de vraies parties, ses textes exacts, l'égalité entre l'Impact
// prévu et l'Impact annoncé, la file d'étapes (view/marbles/sequence.js) :
// pauses, avance, passage, sans effet sur la partie ; et l'historique qui en
// retient les messages (view/marbles/history.js, touche L). Rien n'est annoncé
// ni joué ici. Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js marbles-sequence`).

import { t, setLocale, getLocale } from "../../data/i18n/index.js";
import { MARBLES_SETTINGS, STARTING_BAG } from "../../config/marbles-values.js";
import { createMarblesGame, marblesReduce, placeRefusal, SLOTS } from "../marbles.js";
import { forecast } from "../marbles-forecast.js";
import { buildSteps, describeOverview, placementLines, resolutionSteps } from "../../view/marbles/narration.js";
import {
  advanceSequence,
  pauseAfter,
  restartPause,
  skipSequence,
  startSequence,
  validatePauseSettings,
} from "../../view/marbles/sequence.js";
import { EMPTY_HISTORY, recordSteps } from "../../view/marbles/history.js";
import { historyMenu } from "../../view/marbles/history-screen.js";
import { throws } from "../../lib/check.js";
import MARBLE_TYPES from "../../marbles/types/index.js";
import { emptyBagMarblesGame, inHand } from "./helpers.js";
import { createMarblesRules } from "../marbles-rules.js";

// Les règles du jeu, liées à la vraie table (core/marbles-rules.js).
const rules = createMarblesRules(MARBLE_TYPES);

// Traduction de test : la clé seule, sans son préfixe, pour lire la FORME d'une
// séquence sans dépendre des textes.
const keyOnly = (key) => key.replace(/^marbles\./, "");

// Les textes français portent des espaces insécables : on compare sur l'espace
// ordinaire.
function plain(text) {
  return text.replace(/[  ]/g, " ");
}

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
// `onTurn({ before, overviewFr, forecastImpact, events, steps, history })` reçoit
// chaque tour résolu, avec l'historique tenu comme l'écran le tient.
function playGame(seed, options, present, onTurn = () => {}) {
  let state = rules.createGame(seed, options);
  const journal = [];
  let history = EMPTY_HISTORY;
  const apply = (action) => {
    const result = rules.reduce(state, action);
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
    for (const slot of slots) if (placeRefusal(state, 0, slot) === null) record(buildSteps(apply({ type: "place", handIndex: 0, slot }), t));

    const before = state;
    const overviewFr = describeOverview(state, rules, t);
    const forecastImpact = rules.forecast(state).impact;
    const resolved = apply({ type: "resolve" });
    const drawn = state.stage === "draw" ? apply({ type: "draw" }) : [];
    const events = [...resolved, ...drawn];
    const steps = record(resolutionSteps(before.turn, events, t, { hint: before.turn === 1 }));
    present(steps);
    onTurn({ before, overviewFr, forecastImpact, events, steps, history });
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
const SEQUENCE_SHAPE = new RegExp(
  "^resolution\\.opening (outcome\\.(slot|empty) (event\\.bag_regenerated |event\\.draw |event\\.draw_skipped\\.(handFull|noMarbles) |" +
    "event\\.polished |event\\.cracked |event\\.target_empty |event\\.discarded\\.wear |event\\.effect_final )*){3}" +
    "(event\\.discarded\\.wear (event\\.effect_final )?(event\\.bag_regenerated |event\\.draw |event\\.draw_skipped\\.(handFull|noMarbles) )*)*" +
    "event\\.impact " +
    "(event\\.rotation (event\\.bag_regenerated )?((event\\.draw|event\\.draw_skipped\\.(handFull|noMarbles)) )+event\\.turn_started" +
    "|event\\.rotation event\\.draw_skipped\\.noMarbles event\\.game_over\\.outOfMarbles" +
    "|event\\.game_over\\.turnsCompleted)$"
);

const GAMES = [
  ...Array.from({ length: 30 }, (_, index) => ({ seed: index + 1, options: {} })),
  // Un petit sac et beaucoup de tours : régénérations, puis sac épuisé.
  ...Array.from({ length: 30 }, (_, index) => ({ seed: index + 100, options: { bag: STARTING_BAG.slice(0, 6), turnCount: 30 } })),
];

function checkRealGames(run) {
  const badShapes = [];
  const lostEvents = [];
  const emptySteps = [];
  const impactMismatches = [];
  const badHistories = [];
  const seen = new Set();

  const previousLocale = getLocale();
  try {
    setLocale("fr");
    for (const { seed, options } of GAMES) {
      playGame(seed, options, playOut, ({ before, overviewFr, forecastImpact, events, steps, history }) => {
        // L'historique après la résolution : le tour qui vient de se jouer, de son
        // début au début du suivant (ou à la fin de partie), sans indication de touche.
        const { previous } = history;
        const said = previous?.messages.map(plain) ?? [];
        const closing = said[said.length - 1] ?? "";
        const historyOk =
          previous !== null &&
          previous.turn === before.turn &&
          said[0] === `Début du tour ${before.turn}, jouez vos billes.` &&
          said.filter((text) => text.startsWith("Début du tour")).length === (closing.startsWith("Début du tour") ? 2 : 1) &&
          (closing === `Début du tour ${before.turn + 1}, jouez vos billes.` || closing.includes("Score final")) &&
          said.includes(`Résolution du tour ${before.turn}.`) &&
          !said.some((text) => text.includes("Entrée"));
        if (!historyOk) badHistories.push(`${seed}/${before.turn} : ${said.join(" | ")}`);

        const shape = resolutionSteps(before.turn, events, keyOnly)
          .map((step) => step.text)
          .join(" ");
        if (!SEQUENCE_SHAPE.test(shape)) badShapes.push(`${seed}/${before.turn} : ${shape}`);
        for (const marker of ["event.bag_regenerated event.draw", "game_over.outOfMarbles", "game_over.turnsCompleted", "draw_skipped", "discarded.wear", "outcome.empty"]) {
          if (shape.includes(marker)) seen.add(marker);
        }
        if (JSON.stringify(steps.flatMap((step) => step.events)) !== JSON.stringify(events)) lostEvents.push(`${seed}/${before.turn}`);
        if (steps.some((step) => step.text === "")) emptySteps.push(`${seed}/${before.turn}`);

        // R au début de la phase de jeu, sans action ensuite : l'Impact prévu est
        // celui que la résolution annonce.
        const { impact } = events.find((event) => event.type === "impact");
        const impactStep = steps.find((step) => step.events.some((event) => event.type === "impact"));
        const agrees = forecastImpact === impact && plain(overviewFr).includes(`Impact ${impact}.`) && plain(impactStep.text).startsWith(`Impact ${impact}.`);
        if (!agrees) impactMismatches.push(`${seed}/${before.turn} : prévu ${forecastImpact}, annoncé ${impact}`);
      });
    }
  } finally {
    setLocale(previousLocale);
  }

  run.same("séquence : ordre des étapes sur de vraies parties", [], badShapes.slice(0, 3));
  run.same(
    "séquence : chaque cas rencontré au moins une fois",
    ["discarded.wear", "draw_skipped", "event.bag_regenerated event.draw", "game_over.outOfMarbles", "game_over.turnsCompleted", "outcome.empty"],
    [...seen].sort()
  );
  run.same("séquence : chaque évènement dans une étape et une seule, dans l'ordre", [], lostEvents.slice(0, 3));
  run.same("séquence : aucune étape muette", [], emptySteps.slice(0, 3));
  run.same("R : l'Impact prévu est l'Impact annoncé à la résolution", [], impactMismatches.slice(0, 3));
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
  return { ...emptyBagMarblesGame(rules, 1), stage: "play", turn: 2, score: 0, hand: inHand(["clay", "glass", "mica"]), ...changes };
}

const EMPTY_TRIANGLE = { leftBase: null, rightBase: null, apex: null };

function checkTexts(run) {
  const previousLocale = getLocale();
  try {
    setLocale("fr");
    const said = (text) => plain(text);
    const lensed = playState({
      bag: ["agate"],
      triangle: { leftBase: { marble: "magnifier", wear: 0 }, rightBase: null, apex: { marble: "gorilla", wear: 1 } },
    });

    // R : la prévision d'abord, puis chaque emplacement dans l'ordre des phases.
    run(
      "R : vide, aucun effet, bonus chez qui le reçoit",
      "Prévision : Vitesse 10, Masse 1, Impact 10. base gauche, loupe : aucun effet. base droite, vide. pointe, gorille : Vitesse +10.",
      said(describeOverview(lensed, rules, t))
    );
    run(
      "R : les gains du tour déjà comptés",
      "Prévision : Vitesse 13, Masse 2, Impact 26. base gauche, loupe : aucun effet. base droite, vide. pointe, gorille : Vitesse +10.",
      said(describeOverview({ ...lensed, speed: 3, mass: 2 }, rules, t))
    );
    run(
      "R : valeurs négatives, planchers de l'Impact",
      "Prévision : Vitesse −3, Masse 2, Impact 0. base gauche, vide. base droite, œil-de-chat : Masse +1. pointe, plombée : Vitesse −3.",
      said(describeOverview(playState({ triangle: { ...EMPTY_TRIANGLE, rightBase: { marble: "cats_eye", wear: 0 }, apex: { marble: "leaded", wear: 0 } } }), rules, t))
    );
    run(
      "R : Vitesse et Masse de deux billes",
      "Prévision : Vitesse 3, Masse 2, Impact 6. base gauche, œil-de-chat : Vitesse +3. base droite, vide. pointe, agate : Masse +1.",
      said(describeOverview(playState({ triangle: { ...EMPTY_TRIANGLE, leftBase: { marble: "cats_eye", wear: 0 }, apex: { marble: "agate", wear: 0 } } }), rules, t))
    );
    run("R : rien à prévoir, partie finie", null, describeOverview({ ...lensed, stage: "over" }, rules, t));

    // La séquence, texte exact.
    const texts = (state) => {
      const resolved = rules.reduce(state, { type: "resolve" });
      const drawn = resolved.state.stage === "draw" ? rules.reduce(resolved.state, { type: "draw" }).events : [];
      return resolutionSteps(state.turn, [...resolved.events, ...drawn], t).map((step) => said(step.text));
    };
    run.same(
      "séquence : un tour complet, sans pause entre l'ouverture et la base gauche",
      [
        "Résolution du tour 2. base gauche, loupe : aucun effet.",
        "base droite, vide.",
        "pointe, gorille : Vitesse +10.",
        "Impact 10. Score 10.",
        "Le triangle tourne d'un cran dans le sens horaire.",
        "Vous piochez agate.",
        "Début du tour 3, jouez vos billes.",
      ],
      texts(lensed)
    );
    const worn = playState({
      bag: ["agate"],
      triangle: { leftBase: { marble: "giant", wear: 0 }, rightBase: { marble: "clay", wear: 0 }, apex: { marble: "gorilla", wear: 2 } },
    });
    run.same(
      "séquence : une étape par bille usée, accordée au genre de son nom",
      ["géante est usée et part à la défausse.", "gorille est usé et part à la défausse."],
      texts(worn).filter((text) => text.includes("part à la défausse"))
    );
    run.same(
      "séquence : dernier tour, ni rotation ni pioche",
      [
        "géante est usée et part à la défausse.",
        "Final de géante : Pioche 1.",
        "Vous piochez agate.",
        "gorille est usé et part à la défausse.",
        "Impact 13. Score 13.",
        "Partie terminée. Score final : 13.",
      ],
      texts({ ...worn, turn: 9 }).slice(3)
    );
    run.same(
      "séquence : main pleine",
      ["Main pleine, pas de pioche.", "Début du tour 3, jouez vos billes."],
      texts({ ...lensed, hand: inHand(["clay", "glass", "mica", "agate", "tiger"]) }).slice(-2)
    );
    run.same(
      "séquence : sac régénéré",
      ["Le sac est vide : la défausse est mélangée et forme un nouveau sac.", "Vous piochez tigrée.", "Début du tour 3, jouez vos billes."],
      texts({ ...lensed, bag: [], discard: ["tiger", "tiger", "tiger"] }).slice(-3)
    );
    run.same(
      "séquence : sac et défausse vides, la fin remplace la suite",
      ["Plus aucune bille à piocher.", "Partie terminée faute de billes. Score final : 10."],
      texts({ ...lensed, bag: [], discard: [] }).slice(-2)
    );
    run(
      "séquence : crans et sens, paramètres du texte",
      "Le triangle tourne de 2 crans dans le sens antihoraire.",
      said(t("marbles.event.rotation", { steps: 2, direction: "counterclockwise" }))
    );
    run.same(
      "pioche : une liste, puis le début du tour",
      ["Vous piochez argile et verre.", "Début du tour 1, jouez vos billes."],
      buildSteps(
        [
          { type: "turnStarted", turn: 1, turnCount: 9 },
          { type: "draw", marble: "clay" },
          { type: "draw", marble: "glass" },
        ],
        t
      ).map((step) => said(step.text))
    );
    run("séquence : un déclencheur sans gabarit lève", true, throws(() => buildSteps([{ type: "effect", trigger: "nope", slot: "apex", marble: "clay" }], t)));

    // L'ouverture partage l'étape de la base gauche (pas de pause entre elles), mais
    // reste un message à part pour l'historique ; l'indication du tour 1 se dit
    // sans y entrer.
    const opening = (hint) => {
      const resolved = rules.reduce(lensed, { type: "resolve" });
      return resolutionSteps(1, resolved.events, t, { hint })[0];
    };
    run("ouverture : avec la base gauche, d'un seul tenant", "Résolution du tour 1. base gauche, loupe : aucun effet.", said(opening(false).text));
    run("ouverture : l'indication après l'ouverture", "Résolution du tour 1. Entrée pour passer la résolution. base gauche, loupe : aucun effet.", said(opening(true).text));
    run.same("ouverture : deux messages, sans l'indication", ["Résolution du tour 1.", "base gauche, loupe : aucun effet."], opening(true).messages.map(said));

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
      ["Début du tour 1, jouez vos billes.", ...placements.flatMap((placed) => placed.map((s) => s.text)), ...steps.flatMap((s) => s.messages)].map(said),
      history.previous.messages.map(said)
    );
    run("historique : son tour", 1, history.previous.turn);
    run("historique : finit au début du tour 2", "Début du tour 2, jouez vos billes.", said(history.previous.messages[history.previous.messages.length - 1]));
    run("historique : une partie finie garde son dernier tour", true, game.history.previous.messages.map(said).some((text) => text.includes("Score final")));
    run("historique : la partie finie, plus de tour en cours", null, game.history.current);

    // Le menu : les messages, puis Fermer ; seul Fermer agit.
    const menu = historyMenu({ turn: 4, messages: ["un.", "deux"] });
    run.same(
      "historique, menu : les messages dans l'ordre, puis Fermer",
      ["un.", "deux", "Fermer"],
      menu.entries.map((entry) => t(entry.label, entry.labelParams))
    );
    run.same("historique, menu : les messages sans action", [false, false, true], menu.entries.map((entry) => typeof entry.onActivate === "function"));
    run("historique, menu : son titre", "Historique du tour 4", t(menu.title, menu.titleParams));
    run("historique, menu : Échap ferme", true, menu.closable);
    run.same(
      "historique, menu : premier tour",
      ["Aucun historique pour l'instant.", "Fermer"],
      historyMenu(null).entries.map((entry) => t(entry.label, entry.labelParams))
    );

    // La Pioche : une valeur comme une autre, dans R, la confirmation et la séquence.
    const drawing = playState({
      hand: inHand(["cats_eye"]),
      bag: ["agate"],
      triangle: { leftBase: { marble: "mica", wear: 0 }, rightBase: null, apex: { marble: "stoneware", wear: 0 } },
    });
    run(
      "pioche, R : une valeur finale",
      "Prévision : Vitesse 0, Masse 1, Impact 0. base gauche, mica : Pioche 1. base droite, vide. pointe, grès : aucun effet.",
      said(describeOverview(drawing, rules, t))
    );
    run(
      "pioche, R : la régénération annoncée, sans rien révéler",
      "Prévision : Vitesse 0, Masse 1, Impact 0. base gauche, mica : Pioche 1. base droite, vide. pointe, grès : aucun effet. Le sac sera régénéré.",
      said(describeOverview({ ...drawing, bag: [], discard: ["tiger"] }, rules, t))
    );
    run.same(
      "pioche, confirmation : Éjection et Tic qui piochent, puis la régénération",
      ["Poser œil-de-chat en pointe ?", "Vitesse +3", "Chiquenaude d'œil-de-chat : aucun effet", "Éjection de grès : Pioche 1", "Tic d'œil-de-chat : Pioche 1", "Le sac sera régénéré."],
      placementLines(drawing, 0, "apex", rules, t).map(({ key, params }) => said(t(key, params)))
    );
    run.same(
      "pioche, séquence : la Pioche de la phase, puis la bille",
      ["Résolution du tour 2. base gauche, mica : Pioche 1.", "Vous piochez agate."],
      texts(drawing).slice(0, 2)
    );
    const placedEvents = rules.reduce(drawing, { type: "place", handIndex: 0, slot: "apex" }).events;
    run.same(
      "pioche, pose : les billes piochées en cours de tour se disent, régénération comprise",
      [
        "Éjection de grès : Pioche 1. Vitesse 0, Masse 1.",
        "Vous piochez agate.",
        "Défausse : grès.",
        "Pose : œil-de-chat en pointe.",
        "Tic d'œil-de-chat : Pioche 1. Vitesse 0, Masse 1.",
        "Le sac est vide : la défausse est mélangée et forme un nouveau sac.",
        "Vous piochez grès.",
      ],
      buildSteps(placedEvents, t).map((step) => said(step.text))
    );

    // Le Final : après la phase de sa bille dans R et la confirmation, à son retrait
    // dans la séquence, avant l'Impact.
    const finalState = playState({ hand: inHand(["giant"]), bag: ["agate"], triangle: { leftBase: null, rightBase: null, apex: { marble: "porcelain", wear: 1 } } });
    run(
      "final, R : après la phase, compté dans la prévision",
      "Prévision : Vitesse 9, Masse 1, Impact 9. base gauche, vide. base droite, vide. pointe, porcelaine : Vitesse +5. Final : Vitesse +4.",
      said(describeOverview(finalState, rules, t))
    );
    run(
      "final, R : absent si la bille ne s'use pas ce tour",
      "Prévision : Vitesse 5, Masse 1, Impact 5. base gauche, vide. base droite, vide. pointe, porcelaine : Vitesse +5.",
      said(describeOverview({ ...finalState, triangle: { ...finalState.triangle, apex: { marble: "porcelain", wear: 0 } } }, rules, t))
    );
    run.same(
      "final, confirmation : avec les valeurs prévues de la bille posée",
      ["Poser géante en base gauche ?", "Vitesse +6. Final : Pioche 1.", "Chiquenaude de géante : aucun effet"],
      placementLines(finalState, 0, "leftBase", rules, t).map(({ key, params }) => said(t(key, params)))
    );
    run.same(
      "final, séquence : le retrait, son Final, puis l'Impact",
      ["porcelaine est usée et part à la défausse.", "Final de porcelaine : Vitesse +4.", "Impact 9. Score 9."],
      texts(finalState).slice(3, 6)
    );

    // Polissage et Fêlure : chez la bille qui les produit ; les conséquences prévues.
    const cracking = playState({ hand: inHand(["sulphide"]), bag: ["clay"], triangle: { leftBase: { marble: "sulphide", wear: 0 }, rightBase: null, apex: { marble: "porcelain", wear: 1 } } });
    run(
      "Fêlure, R : chez le sulfure ; la porcelaine retirée avant sa phase, son Final",
      "Prévision : Vitesse 4, Masse 1, Impact 4. base gauche, sulfure : Fêlure 1 à la pointe. base droite, vide. pointe, porcelaine : retirée avant sa phase. Final : Vitesse +4.",
      said(describeOverview(cracking, rules, t))
    );
    run.same(
      "Fêlure, séquence : l'effet, la fêlure, le retrait, le Final, la phase sautée",
      [
        "Résolution du tour 2. base gauche, sulfure : Fêlure 1 à la pointe.",
        "porcelaine se fêle : usure 2 sur 2.",
        "porcelaine est usée et part à la défausse.",
        "Final de porcelaine : Vitesse +4.",
        "base droite, vide.",
        "pointe, vide.",
        "Impact 4. Score 4.",
      ],
      texts(cracking).slice(0, 7)
    );
    run.same(
      "Fêlure, confirmation : dans les valeurs prévues de la bille posée",
      ["Poser sulfure en base droite ?", "Fêlure 1 à la pointe", "Chiquenaude de sulfure : aucun effet"],
      placementLines({ ...cracking, triangle: { ...cracking.triangle, leftBase: null } }, 0, "rightBase", rules, t).map(({ key, params }) => said(t(key, params)))
    );
    const saving = playState({ bag: ["clay"], triangle: { leftBase: { marble: "agate", wear: 2 }, rightBase: null, apex: { marble: "porcelain", wear: 1 } } });
    run(
      "Polissage, R : le Final de l'agate polit la pointe, la porcelaine n'est pas retirée",
      "Prévision : Vitesse 5, Masse 2, Impact 10. base gauche, agate : Masse +1. Final : Polissage 1 à la pointe. base droite, vide. pointe, porcelaine : Vitesse +5.",
      said(describeOverview(saving, rules, t))
    );
    run.same(
      "Polissage, séquence : le retrait de l'agate, son Final, la porcelaine polie",
      ["agate est usée et part à la défausse.", "Final d'agate : Polissage 1 à la pointe.", "porcelaine est polie : usure 1 sur 2.", "Impact 10. Score 10."],
      texts(saving).slice(3, 7)
    );

    // La Chiquenaude : sa ligne de confirmation, toujours là, avec la valeur calculée ;
    // celle qui vide l'emplacement laisse l'Éjection et le Tic sans effet.
    const flicking = playState({ hand: inHand(["clay"], 2), triangle: { ...EMPTY_TRIANGLE, apex: { marble: "tiger", wear: 0 } } });
    run.same(
      "chiquenaude, confirmation : la valeur calculée, dans l'ordre réel",
      ["Chiquenaude d'argile : Vitesse +2", "Éjection de tigrée : aucun effet", "Tic d'argile : Vitesse +2"],
      placementLines(flicking, 0, "apex", rules, t).map(({ key, params }) => said(t(key, params))).slice(2)
    );
    const clearing = playState({ hand: inHand(["leaded"]), triangle: { ...EMPTY_TRIANGLE, apex: { marble: "clay", wear: 0 } } });
    run.same(
      "chiquenaude, confirmation : l'emplacement vidé, Éjection et Tic sans effet",
      ["Poser plombée en pointe ?", "Vitesse −3", "Chiquenaude de plombée : Fêlure 3 à la pointe", "Éjection d'argile : aucun effet", "Tic de plombée : aucun effet"],
      placementLines(clearing, 0, "apex", rules, t).map(({ key, params }) => said(t(key, params)))
    );
    run.same(
      "chiquenaude, journal dit : la Fêlure, le retrait par usure, la pose",
      [
        "Chiquenaude de plombée : Fêlure 3 à la pointe. Vitesse 0, Masse 1.",
        "argile se fêle : usure 3 sur 3.",
        "argile est usée et part à la défausse.",
        "Pose : plombée en pointe.",
      ],
      buildSteps(rules.reduce(clearing, { type: "place", handIndex: 0, slot: "apex" }).events, t).map((step) => said(step.text))
    );

    // Conditions de calibre : R, la confirmation et la séquence ne disent que les
    // valeurs finales, jamais la condition.
    const sized = playState({
      hand: inHand(["gorilla"]),
      triangle: { leftBase: { marble: "stoneware", wear: 0 }, rightBase: { marble: "porcelain", wear: 0 }, apex: { marble: "agate", wear: 0 } },
    });
    run(
      "calibre, R : le grès compte une minibille, l'agate sans calot en base gauche",
      "Prévision : Vitesse 3, Masse 2, Impact 6. base gauche, grès : Vitesse +1. base droite, porcelaine : Vitesse +2. pointe, agate : Masse +1.",
      said(describeOverview(sized, rules, t))
    );
    run.same(
      "calibre, confirmation : le Tic du gorille, sa valeur finale",
      ["Chiquenaude de gorille : aucun effet", "Éjection de porcelaine : aucun effet", "Tic de gorille : Vitesse +4"],
      placementLines(sized, 0, "rightBase", rules, t).map(({ key, params }) => said(t(key, params))).slice(2)
    );
    const boulderLeft = { ...sized, triangle: { ...sized.triangle, leftBase: { marble: "giant", wear: 0 } } };
    run(
      "calibre, séquence : l'agate avec un calot en base gauche",
      "pointe, agate : Masse +3.",
      texts(boulderLeft)[2]
    );

    setLocale("en");
    run(
      "anglais, calibre : R",
      "Forecast: Speed 3, Mass 2, Impact 6. left base, stoneware: Speed +1. right base, porcelain: Speed +2. apex, agate: Mass +1.",
      describeOverview(sized, rules, t)
    );
    run(
      "anglais, Fêlure : R",
      "Forecast: Speed 4, Mass 1, Impact 4. left base, sulphide: Crack 1 to the apex. right base, empty. apex, porcelain: removed before its phase. Final: Speed +4.",
      describeOverview(cracking, rules, t)
    );
    run.same("anglais, Polissage : séquence", ["porcelain is polished: wear 1 of 2."], texts(saving).filter((text) => text.includes("polished")));
    run(
      "anglais, final : R",
      "Forecast: Speed 9, Mass 1, Impact 9. left base, empty. right base, empty. apex, porcelain: Speed +5. Final: Speed +4.",
      describeOverview(finalState, rules, t)
    );
    run.same("anglais, final : séquence", ["porcelain is worn out and goes to the discard.", "Final of porcelain: Speed +4.", "Impact 9. Score 9."], texts(finalState).slice(3, 6));
    run(
      "anglais, pioche : R",
      "Forecast: Speed 0, Mass 1, Impact 0. left base, mica: Draw 1. right base, empty. apex, stoneware: no effect.",
      describeOverview(drawing, rules, t)
    );
    run(
      "anglais, pioche : la régénération annoncée",
      true,
      describeOverview({ ...drawing, bag: [], discard: ["tiger"] }, rules, t).endsWith("The bag will be regenerated.")
    );
    run.same("anglais, pioche : séquence", ["Resolving turn 2. left base, mica: Draw 1.", "You draw agate."], texts(drawing).slice(0, 2));
    run(
      "anglais : R",
      "Forecast: Speed 10, Mass 1, Impact 10. left base, magnifier: no effect. right base, empty. apex, gorilla: Speed +10.",
      describeOverview(lensed, rules, t)
    );
    run.same(
      "anglais : séquence",
      [
        "giant is worn out and goes to the discard.",
        "Final of giant: Draw 1.",
        "You draw agate.",
        "gorilla is worn out and goes to the discard.",
        "Impact 13. Score 13.",
        "Game over. Final score: 13.",
      ],
      texts({ ...worn, turn: 9 }).slice(3)
    );
    run("anglais : ouverture et base gauche", "Resolving turn 9. left base, giant: Speed +6.", texts({ ...worn, turn: 9 })[0]);
    run.same("anglais : historique, premier tour", ["No history yet.", "Close"], historyMenu(null).entries.map((entry) => t(entry.label, entry.labelParams)));
    run("anglais : rotation", "The triangle turns one notch clockwise.", t("marbles.event.rotation", { steps: 1, direction: "clockwise" }));
  } finally {
    setLocale(previousLocale);
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

export default function checkMarblesSequence(run) {
  checkQueue(run);
  checkTexts(run);
  checkRealGames(run);
}
