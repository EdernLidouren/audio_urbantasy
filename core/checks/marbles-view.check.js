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
import {
  buildSteps,
  stepsText,
  describeEffect,
  describeHandFocus,
  describePrinted,
  describeSlotFocus,
  describeSlotForPlacement,
  describeStatus,
  placementLines,
  withHeldMark,
} from "../../view/marbles/narration.js";
import { INITIAL_CURSOR, stepCursor, zoneOf } from "../../view/marbles/navigation.js";
import { MARBLE_EVENT_SOUNDS } from "../../view/marbles/sounds.js";
import { throws } from "../../lib/check.js";

// Un gabarit resté brut : accolade, clé non traduite.
function isClean(text) {
  return typeof text === "string" && text.length > 0 && !/[{}]|marbles?\.\w/.test(text);
}

// Les textes français portent des espaces insécables, invisibles dans une
// comparaison : on compare sur l'espace ordinaire.
function plain(text) {
  return text.replace(/[\u00a0\u202f]/g, " ");
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
  // Une main pleine, pour la pioche sautée.
  const fullHand = marblesReduce({ ...createMarblesGame(4), stage: "draw", turn: 2, hand: ["clay", "glass", "agate", "mica", "tiger"] }, { type: "draw" });
  events.push(...fullHand.events);
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

      const emptyTriangle = { leftBase: null, rightBase: null, apex: null };
      const ids = Object.keys(MARBLE_TYPES);
      const lines = [
        describeStatus(state, true, t),
        describeStatus(state, false, t),
        describeHandFocus({ ...state, hand: [] }, 0, t),
        ...ids.map((id) => describeHandFocus({ ...state, hand: [id] }, 0, t)),
        ...SLOTS.map((slot) => describeSlotFocus({ ...state, triangle: emptyTriangle }, slot, t)),
        ...SLOTS.map((slot) => describeSlotForPlacement({ ...state, triangle: emptyTriangle }, slot, t)),
        ...ids.flatMap((id) =>
          SLOTS.flatMap((slot) => {
            const game = { ...state, triangle: { ...emptyTriangle, [slot]: { marble: id, wear: 1 } } };
            return [describeSlotFocus(game, slot, t), describeSlotForPlacement(game, slot, t)];
          })
        ),
        // Chaque bille posée, sur un vide et en remplaçant chaque bille : toutes
        // les formes de nom demandées par les gabarits.
        ...ids.flatMap((id) =>
          ids.flatMap((old) =>
            placementLines({ ...state, turn: 2, hand: [id], triangle: { ...emptyTriangle, apex: { marble: old, wear: 0 } } }, 0, "apex", t).map(({ key, params }) => t(key, params))
          )
        ),
        ...ids.flatMap((id) => placementLines({ ...state, turn: 2, hand: [id], triangle: emptyTriangle }, 0, "leftBase", t).map(({ key, params }) => t(key, params))),
        t("marbles.zone.hand"),
        t("marbles.zone.triangle"),
        t("marbles.place.menu_title"),
      ];
      run.same(`${locale} : chaque ligne du curseur se dit`, [], lines.filter((text) => !isClean(text)).slice(0, 3));

      run(`${locale} : aucun effet`, t("marbles.effect.none"), describeEffect({}, t));
      run(`${locale} : point final du nom de zone, pour la pause`, true, t("marbles.zone.hand").endsWith(".") && t("marbles.zone.triangle").endsWith("."));
    }

    // Ce que le joueur entend, en français (espaces insécables à part, voir plain).
    setLocale("fr");
    const said = (text) => plain(text);
    run("texte : effet positif", "Vitesse +4", said(describeEffect({ speed: 4 }, t)));
    run("texte : effet négatif en toutes lettres", "Vitesse moins 3", said(describeEffect({ speed: -3 }, t)));
    run("texte : deux effets", "Vitesse +1 et Masse +2", said(describeEffect({ speed: 1, mass: 2 }, t)));
    run("texte : effet donné", "Vitesse +4 à la pointe", said(describeEffect({ speed: 0, mass: 0, given: [{ slot: "apex", marble: "shooter", speed: 4, mass: 0 }] }, t)));
    run(
      "texte : effet imprimé de la loupe",
      "Vitesse +4 à la pointe si son effet de pointe donne au moins Vitesse +1",
      said(describePrinted(MARBLE_TYPES.magnifier.baseVariant.leftBase, t))
    );
    run(
      "texte : Impact",
      "Vitesse 3, Masse 2. Impact 6. Score 14.",
      said(stepsText(buildSteps([{ type: "impact", speed: 3, mass: 2, impact: 6, score: 14 }], t)))
    );
    run.same(
      "texte : pioche en liste",
      ["Tour 1 sur 9. Pioche : argile et verre."],
      buildSteps(
        [
          { type: "turnStarted", turn: 1, turnCount: 9 },
          { type: "draw", marble: "clay" },
          { type: "draw", marble: "glass" },
        ],
        t
      ).map((step) => said(step.text))
    );

    // Bille en main : le format exact, avec « x sur y ».
    const inHand = { ...state, hand: ["clay", "cats_eye", "shooter"] };
    run("texte : bille en main", "argile : pointe, Vitesse +4. Base, Vitesse +1. 1 sur 3", said(describeHandFocus(inHand, 0, t)));
    run(
      "texte : bille en main, deux bases différentes",
      "œil-de-chat : pointe, Vitesse +3. Base gauche, Vitesse +3. Base droite, Masse +1. 2 sur 3",
      said(describeHandFocus(inHand, 1, t))
    );
    run("texte : bille en main, base sans effet", "calot : pointe, Vitesse +8. Base, aucun effet. 3 sur 3", said(describeHandFocus(inHand, 2, t)));
    run("texte : bille sélectionnée", "calot : pointe, Vitesse +8. Base, aucun effet. 3 sur 3. Sélectionnée.", said(withHeldMark(describeHandFocus(inHand, 2, t), t)));

    // Un emplacement, avec ce que la bille fera RÉELLEMENT ce tour.
    const lensed = {
      ...state,
      stage: "play",
      turn: 2,
      speed: 0,
      mass: 1,
      hand: ["clay", "agate", "glass"],
      triangle: { leftBase: { marble: "magnifier", wear: 0 }, rightBase: null, apex: { marble: "shooter", wear: 1 } },
    };
    run("texte : emplacement, effet prévu", "pointe : calot. Vitesse +12. Usure 1 sur 3.", said(describeSlotFocus(lensed, "apex", t)));
    run("texte : emplacement vide", "base droite : vide.", said(describeSlotFocus(lensed, "rightBase", t)));
    run("texte : pose, emplacement occupé", "pointe, calot : Vitesse +12.", said(describeSlotForPlacement(lensed, "apex", t)));
    run("texte : pose, emplacement vide", "base droite", said(describeSlotForPlacement(lensed, "rightBase", t)));

    // Confirmation d'une pose : structure et texte exacts.
    const menuLines = (handIndex, slot) => placementLines(lensed, handIndex, slot, t).map(({ key, params }) => said(t(key, params)));
    run.same("confirmation sur vide : une ligne", ["Poser argile en base droite ? Vitesse +1"], menuLines(0, "rightBase"));
    run.same(
      "confirmation sur occupé : dans l'ordre réel, élision comprise",
      ["Poser argile en pointe ? Vitesse +8", "Éjection de calot : Vitesse +3", "Tic d'argile : Vitesse +2"],
      menuLines(0, "apex")
    );
    run.same(
      "confirmation : aucun effet dit, même structure",
      ["Poser verre en base gauche ? Masse +1", "Éjection de loupe : aucun effet", "Tic de verre : aucun effet"],
      menuLines(2, "leftBase")
    );

    // Ce qui se dit d'une pose et d'une résolution réelles.
    const placing = marblesReduce(lensed, { type: "place", handIndex: 0, slot: "apex" });
    run(
      "texte : pose sur occupé",
      "Éjection de calot : Vitesse +3. Vitesse 3, Masse 1. Défausse : calot. Pose : argile en pointe. Tic d'argile : Vitesse +2. Vitesse 5, Masse 1.",
      said(stepsText(buildSteps(placing.events, t)))
    );
    const lensedSteps = buildSteps(marblesReduce(lensed, { type: "resolve" }).events, t).map((step) => said(step.text));
    run("texte : la loupe dit ce qu'elle donne", "base gauche : loupe. Vitesse +4 à la pointe. Vitesse 0, Masse 1. Usure 1 sur 3.", lensedSteps[0]);
    run("texte : le bonus s'entend chez qui le reçoit", "pointe : calot. Vitesse +12. Vitesse 12, Masse 1. Usure 2 sur 3.", lensedSteps[2]);
    run.same("étapes : aucune étape silencieuse", [], buildSteps(events, t).filter((step) => step.text === ""));
    run("texte : état, compteurs du tour", true, said(describeStatus({ ...lensed, speed: 5, mass: 2 }, true, t)).includes("Vitesse 5, Masse 2."));

    // Anglais : les mêmes lignes, sans forme de nom à demander.
    setLocale("en");
    run.same(
      "anglais : confirmation sur occupé",
      ["Place clay on the apex? Speed +8", "Knockout of shooter: Speed +3", "Hit from clay: Speed +2"],
      placementLines(lensed, 0, "apex", t).map(({ key, params }) => t(key, params))
    );
    run("anglais : bille en main", "clay: apex, Speed +4. Base, Speed +1. 1 of 3", describeHandFocus(inHand, 0, t));
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
  run("zones : la main", "hand", zoneOf("hand"));
  run.same("zones : le triangle", ["triangle", "triangle", "triangle"], SLOTS.map(zoneOf));
  run("curseur : garde sa place dans la main", 3, stepCursor(stepCursor({ ...INITIAL_CURSOR, handIndex: 3 }, "up"), "down").handIndex);
}
