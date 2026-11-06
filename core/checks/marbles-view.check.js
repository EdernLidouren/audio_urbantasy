// Vérifications — domaine « marbles-view ». Ce que le jeu des billes DIT et
// sonne, sur les vraies tables de textes : chaque bille et chaque refus a son
// texte, chaque évènement du journal se dit et a son point d'accroche sonore,
// aucun gabarit ne reste brut, dans chaque langue. Plus le déplacement du
// curseur. Rien n'est annoncé ni joué ici : runChecks() se lance aussi dans le
// jeu. Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js marbles-view`).

import { LOCALE_TABLES, t, setLocale, getLocale } from "../../data/i18n/index.js";
import { MARBLE_TYPES } from "../../config/marbles-values.js";
import { createMarblesGame, marblesReduce, MARBLE_ERRORS, SLOTS } from "../marbles.js";
import { buildSteps, stepsText, describeEffect, describeHandFocus, describeSlotFocus, describeStatus } from "../../view/marbles/narration.js";
import { INITIAL_CURSOR, stepCursor } from "../../view/marbles/navigation.js";
import { MARBLE_EVENT_SOUNDS } from "../../view/marbles/sounds.js";
import { throws } from "../../lib/check.js";

// Un gabarit resté brut : accolade, clé non traduite.
function isClean(text) {
  return typeof text === "string" && text.length > 0 && !/[{}]|marbles?\.\w/.test(text);
}

// Une partie complète, puis une fin par sac épuisé : tous les types d'évènements.
function sampleEvents() {
  const events = [];
  let state = createMarblesGame(11);
  const step = (action) => {
    const result = marblesReduce(state, action);
    if (result.ok) {
      state = result.state;
      events.push(...result.events);
    }
    return result.ok;
  };
  while (state.stage !== "over") {
    step({ type: "draw" });
    if (state.stage === "over") break;
    if (state.turn === 2) step({ type: "swap", a: "leftBase", b: "apex" });
    // Toujours trois poses, sur un emplacement occupé ou non : la défausse se
    // remplit, le sac régénère.
    for (const slot of SLOTS) step({ type: "place", handIndex: 0, slot });
    step({ type: "resolve" });
  }
  let small = createMarblesGame(2, { bag: ["clay", "glass"] });
  const end = marblesReduce(small, { type: "draw" });
  small = end.state;
  events.push(...end.events);
  // Un tour avec des emplacements vides, pour les phases sautées.
  const skipped = marblesReduce({ ...createMarblesGame(3, { bag: [] }), turn: 2, stage: "play" }, { type: "resolve" });
  events.push(...skipped.events);
  return { events, state: { ...state, stage: "play" } };
}

export default function checkMarblesView(run) {
  const { events, state } = sampleEvents();
  const seenTypes = [...new Set(events.map((event) => event.type))].sort();

  run.same("sons : un point d'accroche par évènement du journal", Object.keys(MARBLE_EVENT_SOUNDS).sort(), seenTypes);
  run("narration : évènement inconnu refusé", true, throws(() => buildSteps([{ type: "nope" }], (key) => key)));

  // Le découpage en étapes : tous les évènements, chacun une fois, dans l'ordre.
  run.same("étapes : aucun évènement perdu", events, buildSteps(events, (key) => key).flatMap((step) => step.events));
  const turn = createMarblesGame(4);
  const drawn = marblesReduce(turn, { type: "draw" });
  run("étapes : le début de tour et sa pioche, une seule étape", 1, buildSteps(drawn.events, (key) => key).length);

  const previousLocale = getLocale();
  try {
    for (const locale of Object.keys(LOCALE_TABLES)) {
      setLocale(locale);
      const missingNames = Object.keys(MARBLE_TYPES).filter((id) => !Object.hasOwn(LOCALE_TABLES[locale], `marble.${id}.name`));
      run.same(`${locale} : chaque bille a son nom`, [], missingNames);
      const orphanNames = Object.keys(LOCALE_TABLES[locale])
        .filter((key) => key.startsWith("marble."))
        .filter((key) => !Object.hasOwn(MARBLE_TYPES, key.split(".")[1]));
      run.same(`${locale} : aucun nom sans bille`, [], orphanNames);
      const missingErrors = MARBLE_ERRORS.filter((code) => !Object.hasOwn(LOCALE_TABLES[locale], `marbles.error.${code}`));
      run.same(`${locale} : chaque refus a son texte`, [], missingErrors);

      const dirtySteps = buildSteps(events, t).map((step) => step.text).filter((text) => !isClean(text));
      run.same(`${locale} : chaque étape du journal se dit`, [], dirtySteps.slice(0, 3));

      const lines = [
        describeStatus(state, true, t),
        describeStatus(state, false, t),
        describeHandFocus({ ...state, hand: [] }, 0, t),
        ...Object.keys(MARBLE_TYPES).map((id) => describeHandFocus({ ...state, hand: [id] }, 0, t)),
        ...SLOTS.map((slot) => describeSlotFocus({ ...state, triangle: { leftBase: null, rightBase: null, apex: null } }, slot, t)),
        ...Object.keys(MARBLE_TYPES).flatMap((id) =>
          SLOTS.map((slot) => describeSlotFocus({ ...state, triangle: { leftBase: null, rightBase: null, apex: null, [slot]: { marble: id, wear: 1 } } }, slot, t))
        ),
      ];
      run.same(`${locale} : chaque ligne du curseur se dit`, [], lines.filter((text) => !isClean(text)).slice(0, 3));

      run(`${locale} : aucun effet`, t("marbles.effect.none"), describeEffect({}, t));
    }

    // Ce que le joueur entend, en français.
    setLocale("fr");
    run("texte : effet négatif", "vitesse moins 3", describeEffect({ speed: -3 }, t));
    run("texte : deux effets", "vitesse plus 1 et masse plus 2", describeEffect({ speed: 1, mass: 2 }, t));
    run(
      "texte : Impact",
      "Vitesse 3, Masse 2. Impact 6. Score 14.",
      stepsText(buildSteps([{ type: "impact", speed: 3, mass: 2, impact: 6, score: 14 }], t))
    );
    run.same(
      "texte : pioche en liste",
      ["Tour 1 sur 9. Pioche : argile et verre."],
      buildSteps(
        [
          { type: "turnStarted", turn: 1, turnCount: 9 },
          { type: "draw", marble: "clay" },
          { type: "draw", marble: "glass" },
        ],
        t
      ).map((step) => step.text)
    );
    const cats = describeHandFocus({ ...state, hand: ["cats_eye"] }, 0, t);
    run("texte : bille en main, deux bases différentes", true, cats.includes("Base gauche : vitesse plus 3. Base droite : masse plus 1."));
    const clay = describeHandFocus({ ...state, hand: ["clay"] }, 0, t);
    run("texte : bille en main, sans variante", true, clay.includes("Base : vitesse plus 1. Pointe : vitesse plus 4. Usure maximale 3."));
    run(
      "texte : emplacement, effet À cette position",
      "pointe : argile. vitesse plus 4. Usure 1 sur 3.",
      describeSlotFocus({ ...state, triangle: { leftBase: null, rightBase: null, apex: { marble: "clay", wear: 1 } } }, "apex", t)
    );
    run("texte : emplacement vide", "pointe : vide.", describeSlotFocus({ ...state, triangle: { leftBase: null, rightBase: null, apex: null } }, "apex", t));
  } finally {
    setLocale(previousLocale);
  }

  // Curseur : la géométrie du triangle, main en dessous.
  const path = (start, ...directions) => {
    let cursor = start;
    for (const direction of directions) {
      cursor = stepCursor(cursor, direction);
      if (cursor === null) return null;
    }
    return cursor.place;
  };
  run("curseur : de la main vers la base gauche", "leftBase", path(INITIAL_CURSOR, "up"));
  run("curseur : de la base vers la pointe", "apex", path(INITIAL_CURSOR, "up", "up"));
  run("curseur : d'une base à l'autre", "rightBase", path(INITIAL_CURSOR, "up", "right"));
  run("curseur : retour à la dernière base depuis la pointe", "rightBase", path(INITIAL_CURSOR, "up", "right", "up", "down"));
  run("curseur : retour à la dernière base depuis la main", "rightBase", path(INITIAL_CURSOR, "up", "right", "down", "up"));
  run("curseur : de la pointe vers une base au choix", "leftBase", path(INITIAL_CURSOR, "up", "right", "up", "left"));
  run("curseur : rien au-dessus de la pointe", null, path(INITIAL_CURSOR, "up", "up", "up"));
  run("curseur : rien à gauche de la base gauche", null, path(INITIAL_CURSOR, "up", "left"));
  run("curseur : rien sous la main", null, path(INITIAL_CURSOR, "down"));
  run("curseur : garde sa place dans la main", 3, stepCursor(stepCursor({ ...INITIAL_CURSOR, handIndex: 3 }, "up"), "down").handIndex);
}
