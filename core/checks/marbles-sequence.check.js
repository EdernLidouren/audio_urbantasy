// Vérifications — domaine « marbles-sequence ». La vue d'ensemble du tour
// (touche R) et la séquence de résolution (Maj+R) du jeu des billes : l'ordre de
// ses étapes sur de vraies parties, ses textes exacts, l'égalité entre l'Impact
// prévu et l'Impact annoncé, et la file d'étapes (view/marbles/sequence.js) :
// pauses, avance, passage, sans effet sur la partie. Rien n'est annoncé ni joué
// ici. Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js marbles-sequence`).

import { t, setLocale, getLocale } from "../../data/i18n/index.js";
import { MARBLES_SETTINGS, STARTING_BAG } from "../../config/marbles-values.js";
import { createMarblesGame, marblesReduce, placeRefusal, SLOTS } from "../marbles.js";
import { forecast } from "../marbles-forecast.js";
import { buildSteps, describeOverview, resolutionSteps } from "../../view/marbles/narration.js";
import {
  advanceSequence,
  pauseAfter,
  restartPause,
  skipSequence,
  startSequence,
  validatePauseSettings,
} from "../../view/marbles/sequence.js";
import { throws } from "../../lib/check.js";

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
// `onTurn({ before, overviewFr, forecastImpact, events, steps })` reçoit chaque
// tour résolu.
function playGame(seed, options, present, onTurn = () => {}) {
  let state = createMarblesGame(seed, options);
  const journal = [];
  const apply = (action) => {
    const result = marblesReduce(state, action);
    if (!result.ok) return null;
    state = result.state;
    journal.push(...result.events);
    return result.events;
  };
  apply({ type: "draw" });
  while (state.stage === "play") {
    // Le triangle plein au premier tour. Ensuite, graine impaire : trois poses par
    // tour, la défausse se remplit et le sac se régénère ; graine paire : une pose
    // tous les trois tours, la main se remplit et des emplacements se vident.
    const generous = seed % 2 === 1;
    const slots = state.turn === 1 || generous ? SLOTS : state.turn % 3 === 0 ? [SLOTS[state.turn % 2]] : [];
    for (const slot of slots) if (placeRefusal(state, 0, slot) === null) apply({ type: "place", handIndex: 0, slot });

    const before = state;
    const overviewFr = describeOverview(state, t);
    const forecastImpact = forecast(state).impact;
    const resolved = apply({ type: "resolve" });
    const drawn = state.stage === "draw" ? apply({ type: "draw" }) : [];
    const events = [...resolved, ...drawn];
    const steps = resolutionSteps(before.turn, events, t);
    present(steps);
    onTurn({ before, overviewFr, forecastImpact, events, steps });
  }
  return { state, journal };
}

// La forme attendue d'une résolution : ouverture, trois phases, Impact, les
// billes usées, puis la rotation et la pioche du tour suivant, ou la fin de
// partie (dernier tour : sans rotation ni pioche ; sac régénéré trop petit : la
// fin remplace la pioche).
const SEQUENCE_SHAPE = new RegExp(
  "^resolution\\.opening (outcome\\.(slot|empty) ){3}event\\.impact (event\\.discarded\\.wear )*" +
    "(event\\.rotation (event\\.bag_regenerated )?((event\\.draw|event\\.draw_skipped) )+event\\.turn_started" +
    "|event\\.rotation event\\.bag_regenerated event\\.game_over\\.bagExhausted" +
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
  const seen = new Set();

  const previousLocale = getLocale();
  try {
    setLocale("fr");
    for (const { seed, options } of GAMES) {
      playGame(seed, options, playOut, ({ before, overviewFr, forecastImpact, events, steps }) => {
        const shape = resolutionSteps(before.turn, events, keyOnly)
          .map((step) => step.text)
          .join(" ");
        if (!SEQUENCE_SHAPE.test(shape)) badShapes.push(`${seed}/${before.turn} : ${shape}`);
        for (const marker of ["event.bag_regenerated event.draw", "game_over.bagExhausted", "game_over.turnsCompleted", "draw_skipped", "discarded.wear", "outcome.empty"]) {
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
    ["discarded.wear", "draw_skipped", "event.bag_regenerated event.draw", "game_over.bagExhausted", "game_over.turnsCompleted", "outcome.empty"],
    [...seen].sort()
  );
  run.same("séquence : chaque évènement dans une étape et une seule, dans l'ordre", [], lostEvents.slice(0, 3));
  run.same("séquence : aucune étape muette", [], emptySteps.slice(0, 3));
  run.same("R : l'Impact prévu est l'Impact annoncé à la résolution", [], impactMismatches.slice(0, 3));

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
  return { ...createMarblesGame(1, { bag: [] }), stage: "play", turn: 2, score: 0, hand: ["clay", "glass", "mica"], ...changes };
}

const EMPTY_TRIANGLE = { leftBase: null, rightBase: null, apex: null };

function checkTexts(run) {
  const previousLocale = getLocale();
  try {
    setLocale("fr");
    const said = (text) => plain(text);
    const lensed = playState({
      bag: ["agate"],
      triangle: { leftBase: { marble: "magnifier", wear: 0 }, rightBase: null, apex: { marble: "shooter", wear: 1 } },
    });

    // R : la prévision d'abord, puis chaque emplacement dans l'ordre des phases.
    run(
      "R : vide, aucun effet, bonus chez qui le reçoit",
      "Prévision : Vitesse 12, Masse 1, Impact 12. base gauche, loupe : aucun effet. base droite, vide. pointe, calot : Vitesse +12.",
      said(describeOverview(lensed, t))
    );
    run(
      "R : les gains du tour déjà comptés",
      "Prévision : Vitesse 15, Masse 2, Impact 30. base gauche, loupe : aucun effet. base droite, vide. pointe, calot : Vitesse +12.",
      said(describeOverview({ ...lensed, speed: 3, mass: 2 }, t))
    );
    run(
      "R : valeurs négatives, planchers de l'Impact",
      "Prévision : Vitesse −3, Masse 2, Impact 0. base gauche, vide. base droite, œil-de-chat : Masse +1. pointe, plombée : Vitesse −3.",
      said(describeOverview(playState({ triangle: { ...EMPTY_TRIANGLE, rightBase: { marble: "cats_eye", wear: 0 }, apex: { marble: "leaded", wear: 0 } } }), t))
    );
    run(
      "R : Vitesse et Masse de deux billes",
      "Prévision : Vitesse 3, Masse 3, Impact 9. base gauche, œil-de-chat : Vitesse +3. base droite, vide. pointe, agate : Masse +2.",
      said(describeOverview(playState({ triangle: { ...EMPTY_TRIANGLE, leftBase: { marble: "cats_eye", wear: 0 }, apex: { marble: "agate", wear: 0 } } }), t))
    );
    run("R : rien à prévoir, partie finie", null, describeOverview({ ...lensed, stage: "over" }, t));

    // La séquence, texte exact.
    const texts = (state) => {
      const resolved = marblesReduce(state, { type: "resolve" });
      const drawn = resolved.state.stage === "draw" ? marblesReduce(resolved.state, { type: "draw" }).events : [];
      return resolutionSteps(state.turn, [...resolved.events, ...drawn], t).map((step) => said(step.text));
    };
    run.same(
      "séquence : un tour complet",
      [
        "Résolution du tour 2.",
        "base gauche, loupe : aucun effet.",
        "base droite, vide.",
        "pointe, calot : Vitesse +12.",
        "Impact 12. Score 12.",
        "Le triangle tourne d'un cran dans le sens horaire.",
        "Vous piochez agate.",
        "Début du tour 3, jouez vos billes.",
      ],
      texts(lensed)
    );
    const worn = playState({
      bag: ["agate"],
      triangle: { leftBase: { marble: "giant", wear: 0 }, rightBase: { marble: "clay", wear: 0 }, apex: { marble: "shooter", wear: 2 } },
    });
    run.same(
      "séquence : une étape par bille usée, accordée au genre de son nom",
      ["géante est usée et part à la défausse.", "calot est usé et part à la défausse."],
      texts(worn).filter((text) => text.includes("défausse"))
    );
    run.same(
      "séquence : dernier tour, ni rotation ni pioche",
      ["Impact 15. Score 15.", "géante est usée et part à la défausse.", "calot est usé et part à la défausse.", "Partie terminée. Score final : 15."],
      texts({ ...worn, turn: 9 }).slice(4)
    );
    run.same(
      "séquence : main pleine",
      ["Main pleine, pas de pioche.", "Début du tour 3, jouez vos billes."],
      texts({ ...lensed, hand: ["clay", "glass", "mica", "agate", "tiger"] }).slice(-2)
    );
    run.same(
      "séquence : sac régénéré",
      ["Le sac est vide : la défausse est mélangée et forme un nouveau sac.", "Vous piochez tigrée.", "Début du tour 3, jouez vos billes."],
      texts({ ...lensed, bag: [], discard: ["tiger", "tiger", "tiger"] }).slice(-3)
    );
    run.same(
      "séquence : sac régénéré trop petit, la fin remplace la suite",
      ["Le sac est vide : la défausse est mélangée et forme un nouveau sac.", "Moins de 3 billes dans le sac : partie terminée. Score final : 12."],
      texts({ ...lensed, bag: [], discard: ["tiger"] }).slice(-2)
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

    setLocale("en");
    run(
      "anglais : R",
      "Forecast: Speed 12, Mass 1, Impact 12. left base, magnifier: no effect. right base, empty. apex, shooter: Speed +12.",
      describeOverview(lensed, t)
    );
    run.same(
      "anglais : séquence",
      ["Resolving turn 9.", "Impact 15. Score 15.", "giant is worn out and goes to the discard.", "shooter is worn out and goes to the discard.", "Game over. Final score: 15."],
      texts({ ...worn, turn: 9 }).filter((_, index) => index === 0 || index >= 4)
    );
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
