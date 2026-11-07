// Vérifications — domaine « marbles-view ». Ce que le jeu des billes DIT et
// sonne, sur les vraies tables de textes : chaque bille et chaque refus a son
// texte, chaque évènement du journal se dit et a son point d'accroche sonore,
// aucun gabarit ne reste brut, dans chaque langue. Plus les fiches des billes,
// l'ordre du menu du sac et de la confirmation, et le déplacement du curseur. Rien n'est annoncé ni joué ici : runChecks() se lance aussi dans le
// jeu. Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js marbles-view`).

import { LOCALE_TABLES, t, setLocale, getLocale } from "../../data/i18n/index.js";
import { MARBLE_CARD_MODEL, MARBLE_TYPES } from "../../config/marbles-values.js";
import { detailLine, stepDetail } from "../../lib/detail-card.js";
import { createMarblesGame, marblesReduce, MARBLE_ERRORS, SLOTS } from "../marbles.js";
import {
  bagDisplayOrder,
  buildSteps,
  stepsText,
  describeBag,
  describeDiscard,
  describeEffect,
  describeHandFocus,
  describeMarbleInList,
  describePrinted,
  describeSlotFocus,
  describeSlotForPlacement,
  describeTurn,
  formatCounter,
  placementLines,
  withHeldMark,
} from "../../view/marbles/narration.js";
import { marbleCard } from "../../view/marbles/card.js";
import { confirmationEntries } from "../../view/menus/confirmation.js";
import { INITIAL_CURSOR, stepCursor, zoneOf } from "../../view/marbles/navigation.js";
import { MARBLE_EVENT_SOUNDS } from "../../view/marbles/sounds.js";
import { throws } from "../../lib/check.js";

// Un gabarit resté brut (accolade, clé non traduite), ou un nombre négatif écrit
// avec un trait d'union, qu'un lecteur d'écran peut taire.
function isClean(text) {
  return typeof text === "string" && text.length > 0 && !/[{}]|marbles?\.\w|-\d/.test(text);
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

// Traduction de test : la clé et ses valeurs, pour vérifier ce que lit la fiche
// sans dépendre des textes.
function keyT(key, params) {
  return params ? `${key} ${JSON.stringify(params)}` : key;
}

// Les fiches d'une bille : ce que le modèle déclare, avec les vrais textes.
function checkCards(run) {
  const previousLocale = getLocale();
  try {
    setLocale("fr");
    const fields = (marble) => {
      const card = marbleCard(marble, "principal", t);
      return { above: card.above.map(plain), below: card.below.map(plain) };
    };
    run.same(
      "fiche : pointe puis base au-dessus, tic au-dessous",
      { above: ["Pointe : Vitesse +4.", "Base : Vitesse +1."], below: ["Tic : Vitesse +2."] },
      fields("clay")
    );
    run.same(
      "fiche : éjection au-dessous, base sans effet",
      { above: ["Pointe : Vitesse +8.", "Base : aucun effet."], below: ["Éjection : Vitesse +3."] },
      fields("shooter")
    );
    run.same(
      "fiche : sans champ facultatif, le repli",
      { above: ["Pointe : Vitesse +2.", "Base : Masse +1."], below: ["Aucun effet particulier."] },
      fields("glass")
    );
    run.same(
      "fiche : effet négatif avec le vrai signe moins",
      ["Pointe : Vitesse −3.", "Base : Masse +2."],
      fields("leaded").above
    );
    run.same(
      "fiche : variante de base, un seul champ",
      ["Pointe : Vitesse +3.", "Base gauche : Vitesse +3. Base droite : Masse +1."],
      fields("cats_eye").above
    );
    run(
      "fiche : effet imprimé conditionnel de la loupe",
      "Base gauche : Vitesse +4 à la pointe si son effet de pointe donne au moins Vitesse +1. Base droite : Vitesse +1.",
      fields("magnifier").above[1]
    );
    run.same(
      "fiche : tic et éjection dans l'ordre",
      ["Tic : Vitesse +1.", "Éjection : Masse +2."],
      marbleCard("both", "x", t, {
        types: { both: { knockout: [{ action: "mass", amount: 2 }], hit: [{ action: "speed", amount: 1 }] } },
      }).below.map(plain)
    );
  } finally {
    setLocale(previousLocale);
  }

  // Parcours sur une vraie fiche, comme au clavier.
  const card = marbleCard("clay", "principal", keyT);
  const walk = (...directions) => {
    let position = 0;
    return directions.map((direction) => {
      position = stepDetail(position, card, direction);
      return detailLine(card, position).split(" ")[0];
    });
  };
  run.same(
    "fiche : pointe, base, réannonce, retour, annonce principale, tic",
    ["marbles.card.apex", "marbles.card.base", "marbles.card.base", "marbles.card.apex", "principal", "marbles.card.hit"],
    walk(1, 1, 1, -1, -1, -1)
  );

  // Ajouter un champ se fait en le déclarant : aucune navigation à toucher.
  const extendedModel = { ...MARBLE_CARD_MODEL, below: [...MARBLE_CARD_MODEL.below, { field: "spin", labelKey: "spin.label" }] };
  const spinner = { spinner: { spin: [{ action: "speed", amount: 1 }] } };
  run(
    "fiche : un champ déclaré apparaît",
    true,
    marbleCard("spinner", "x", keyT, { model: extendedModel, types: spinner }).below[0].startsWith("spin.label")
  );
  run.same(
    "fiche : un champ déclaré, absent de la bille, n'existe pas",
    [MARBLE_CARD_MODEL.emptyBelowKey],
    marbleCard("plain", "x", keyT, { model: extendedModel, types: { plain: {} } }).below
  );
  run("fiche : champ obligatoire vide, aucun effet", 2, marbleCard("plain", "x", keyT, { types: { plain: {} } }).above.length);
}

// Une partie à décisions fixes, avec ou sans consultation du sac et de la défausse
// entre deux actions.
function playWithLookups(seed, lookup) {
  let state = createMarblesGame(seed);
  const journal = [];
  const step = (action) => {
    lookup(state);
    const result = marblesReduce(state, action);
    if (result.ok) {
      state = result.state;
      journal.push(...result.events);
    }
  };
  while (state.stage !== "over") {
    step({ type: "draw" });
    for (const slot of SLOTS) step({ type: "place", handIndex: 0, slot });
    step({ type: "resolve" });
  }
  return { journal, state };
}

function checkBagOrder(run) {
  // L'ordre affiché ne dépend que du contenu : deux ordres de pioche, une liste.
  const bag = ["tiger", "clay", "giant", "agate", "clay"];
  run.same("sac : l'ordre affiché ne dépend pas de l'ordre de pioche", bagDisplayOrder(bag, t), bagDisplayOrder([...bag].reverse(), t));
  run.same("sac : rien de perdu, doublons compris", [...bag].sort(), [...bagDisplayOrder(bag, t)].sort());
  const original = [...bag];
  bagDisplayOrder(bag, t);
  run.same("sac : la liste reçue n'est pas touchée", original, bag);

  // Sur les vraies parties : une graine, un ordre de pioche, jamais révélé.
  const previousLocale = getLocale();
  try {
    setLocale("fr");
    run.same("sac : alphabétique sur le nom dit", ["agate", "clay", "clay", "giant", "tiger"], bagDisplayOrder(bag, t));
    const order = (seed) => bagDisplayOrder(createMarblesGame(seed).bag, t).join();
    run("sac : même liste quelle que soit la graine", order(1), order(2));
    run("sac : deux graines, deux vrais ordres de pioche", false, createMarblesGame(1).bag.join() === createMarblesGame(2).bag.join());
  } finally {
    setLocale(previousLocale);
  }

  // Consulter ne change rien à la partie : même journal, même état, générateur
  // compris, que les menus aient été ouverts ou non.
  const plainGame = playWithLookups(21, () => {});
  const looked = playWithLookups(21, (state) => {
    Object.freeze(state);
    Object.freeze(state.bag);
    Object.freeze(state.discard);
    bagDisplayOrder(state.bag, t);
    describeBag(state, t);
    describeDiscard(state, t);
    for (const marble of [...state.bag, ...state.discard]) marbleCard(marble, "x", t);
  });
  run.same("sac : consulter ne change pas le journal", plainGame.journal, looked.journal);
  run.same("sac : consulter ne change pas l'état final", plainGame.state, looked.state);
  run("sac : la partie comparée pioche bien", true, plainGame.journal.some((event) => event.type === "draw"));

  // La défausse : l'ordre d'arrivée, celui que tient l'état.
  let state = { ...createMarblesGame(1, { bag: [] }), turn: 2, stage: "play", hand: ["clay", "glass", "agate"] };
  state = { ...state, triangle: { leftBase: { marble: "mica", wear: 0 }, rightBase: { marble: "tiger", wear: 0 }, apex: { marble: "giant", wear: 0 } } };
  for (const slot of ["apex", "leftBase", "rightBase"]) state = marblesReduce(state, { type: "place", handIndex: 0, slot }).state;
  run.same("défausse : de la plus ancienne à la plus récente", ["giant", "mica", "tiger"], state.discard);
}

export default function checkMarblesView(run) {
  const { events, state } = sampleEvents();
  const seenTypes = [...new Set(events.map((event) => event.type))].sort();

  run.same("sons : un point d'accroche par évènement du journal", Object.keys(MARBLE_EVENT_SOUNDS).sort(), seenTypes);
  checkCards(run);
  checkBagOrder(run);
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
        describeTurn(state, true, t),
        describeTurn(state, false, t),
        describeBag(state, t),
        describeDiscard(state, t),
        describeTurn({ ...state, speed: -3, mass: -1 }, true, t),
        stepsText(buildSteps([{ type: "impact", speed: -3, mass: -1, impact: 0, score: 0 }], t)),
        describeHandFocus({ ...state, hand: [] }, 0, t),
        // Chaque champ de chaque fiche, et le repli.
        ...ids.flatMap((id) => {
          const card = marbleCard(id, "x", t);
          return [...card.above, ...card.below];
        }),
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
        t("marbles.pile.bag"),
        t("marbles.pile.discard"),
        t("marbles.pile.back"),
      ];
      run.same(`${locale} : chaque ligne du curseur se dit`, [], lines.filter((text) => !isClean(text)).slice(0, 3));

      run(`${locale} : aucun effet`, t("marbles.effect.none"), describeEffect({}, t));
      run(`${locale} : point final du nom de zone, pour la pause`, true, t("marbles.zone.hand").endsWith(".") && t("marbles.zone.triangle").endsWith("."));
    }

    // Ce que le joueur entend, en français (espaces insécables à part, voir plain).
    setLocale("fr");
    const said = (text) => plain(text);
    run("texte : effet positif", "Vitesse +4", said(describeEffect({ speed: 4 }, t)));
    run("texte : effet négatif, vrai signe moins collé au nombre", "Vitesse −3", said(describeEffect({ speed: -3 }, t)));
    run("texte : Masse négative", "Masse −2", said(describeEffect({ mass: -2 }, t)));
    run("texte : compteur négatif", "−3", formatCounter(-3));
    run("texte : compteur positif", "3", formatCounter(3));
    run(
      "texte : Impact, compteurs négatifs",
      "Vitesse −3, Masse −1. Impact 0. Score 0.",
      said(stepsText(buildSteps([{ type: "impact", speed: -3, mass: -1, impact: 0, score: 0 }], t)))
    );
    run(
      "texte : effet, compteurs négatifs",
      "Vitesse −3. Vitesse −3, Masse 1.",
      said(stepsText(buildSteps([{ type: "phase", slot: "apex", marble: "leaded" }, { type: "effect", trigger: "phase", slot: "apex", marble: "leaded", speedDelta: -3, massDelta: 0, given: [], speed: -3, mass: 1 }], t))).replace(/^.*?\. /, "")
    );
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

    // Annonces principales : courtes, le détail est dans la fiche.
    const inHand = { ...state, hand: ["clay", "cats_eye", "shooter"] };
    run("texte : bille en main", "argile, usure 3. 1 sur 3", said(describeHandFocus(inHand, 0, t)));
    run("texte : usure maximale propre", "géante, usure 1. 2 sur 5", said(describeMarbleInList("giant", 1, 5, t)));
    run("texte : bille sélectionnée", "calot, usure 3. 3 sur 3. Sélectionnée.", said(withHeldMark(describeHandFocus(inHand, 2, t), t)));

    const lensed = {
      ...state,
      stage: "play",
      turn: 2,
      speed: 0,
      mass: 1,
      hand: ["clay", "agate", "glass"],
      triangle: { leftBase: { marble: "magnifier", wear: 0 }, rightBase: null, apex: { marble: "shooter", wear: 1 } },
    };
    run("texte : bille active", "calot, pointe, usure 1 sur 3.", said(describeSlotFocus(lensed, "apex", t)));
    run("texte : emplacement vide", "base droite : vide.", said(describeSlotFocus(lensed, "rightBase", t)));
    // Pendant une pose, la prévision reste.
    run("texte : pose, emplacement occupé", "pointe, calot : Vitesse +12.", said(describeSlotForPlacement(lensed, "apex", t)));
    run("texte : pose, emplacement vide", "base droite", said(describeSlotForPlacement(lensed, "rightBase", t)));

    // S et D : les nombres et leurs accords.
    const counts = (bag, discard, drawPerTurn = 1) => ({ ...state, bag: Array(bag).fill("clay"), discard: Array(discard).fill("clay"), drawPerTurn });
    run("texte : sac, pluriel", "Encore 8 billes dans le sac, 1 bille à piocher en début de tour.", said(describeBag(counts(8, 0), t)));
    run("texte : sac, une bille", "Encore 1 bille dans le sac, 1 bille à piocher en début de tour.", said(describeBag(counts(1, 0), t)));
    run("texte : sac vide", "Encore 0 bille dans le sac, 1 bille à piocher en début de tour.", said(describeBag(counts(0, 0), t)));
    run("texte : sac, pioche en vigueur", "Encore 8 billes dans le sac, 2 billes à piocher en début de tour.", said(describeBag(counts(8, 0, 2), t)));
    run("texte : défausse, pluriel", "3 billes dans la défausse.", said(describeDiscard(counts(0, 3), t)));
    run("texte : défausse, une bille", "1 bille dans la défausse.", said(describeDiscard(counts(0, 1), t)));
    run("texte : défausse vide", "0 bille dans la défausse.", said(describeDiscard(counts(0, 0), t)));

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
    run(
      "texte : le tour, compteurs compris",
      "Tour 2 sur 9. Score 5. Vitesse 5, Masse 2. Échange disponible.",
      said(describeTurn({ ...lensed, score: 5, speed: 5, mass: 2 }, true, t))
    );

    // Anglais : les mêmes lignes, sans forme de nom à demander.
    setLocale("en");
    run.same(
      "anglais : confirmation sur occupé",
      ["Place clay on the apex? Speed +8", "Knockout of shooter: Speed +3", "Hit from clay: Speed +2"],
      placementLines(lensed, 0, "apex", t).map(({ key, params }) => t(key, params))
    );
    run("anglais : bille en main", "clay, wear 3. 1 of 3", describeHandFocus(inHand, 0, t));
    run("anglais : bille active", "shooter, apex, wear 1 of 3.", describeSlotFocus(lensed, "apex", t));
    run("anglais : effet négatif", "Speed −3", describeEffect({ speed: -3 }, t));
    run("anglais : sac, une bille", "1 marble left in the bag, 1 marble to draw at the start of the turn.", describeBag({ ...state, bag: ["clay"], drawPerTurn: 1 }, t));
    run("anglais : sac vide", "0 marbles left in the bag, 1 marble to draw at the start of the turn.", describeBag({ ...state, bag: [], drawPerTurn: 1 }, t));
    run("anglais : défausse", "2 marbles in the discard.", describeDiscard({ ...state, discard: ["clay", "glass"] }, t));
    run.same("anglais : fiche", ["Apex: Speed +4.", "Base: Speed +1."], marbleCard("clay", "x", t).above);
  } finally {
    setLocale(previousLocale);
  }

  // La confirmation : l'ordre du modèle, ses lignes de lecture d'abord.
  run.same("confirmation : ordre du modèle", ["menu.confirm.cancel", "menu.confirm.confirm"], confirmationEntries(() => {}).map((entry) => entry.label));
  run.same(
    "confirmation : les lignes à lire d'abord, en lecture seule",
    ["a", "b", "menu.confirm.cancel", "menu.confirm.confirm"],
    confirmationEntries(() => {}, [{ key: "a" }, { key: "b" }]).map((entry) => entry.label)
  );
  run("confirmation : une ligne de lecture ne s'active pas", undefined, confirmationEntries(() => {}, [{ key: "a" }])[0].onActivate);

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
