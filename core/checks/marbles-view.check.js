// Vérifications — domaine « marbles-view ». Ce que le jeu des billes DIT et
// sonne, sur les vraies tables de textes : chaque bille et chaque refus a son
// texte, chaque évènement du journal se dit et a son point d'accroche sonore,
// aucun gabarit ne reste brut, dans chaque langue. Plus les fiches des billes,
// l'ordre du menu du sac et de la confirmation, le déplacement du curseur et la
// sélection d'emplacement.
// La vue d'ensemble et la séquence de résolution ont leur domaine,
// marbles-sequence. Rien n'est annoncé ni joué ici : runChecks() se lance aussi
// dans le jeu. Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js marbles-view`).

import { LOCALE_TABLES, t, setLocale, getLocale } from "../../data/i18n/index.js";
import {
  MARBLE_CARD_MODEL,
  MARBLE_SIZES,
  MARBLE_SOUND_PROFILES,
  MARBLES_COLLISION,
  MARBLES_PITCH_VARIATION,
  MARBLES_SETTINGS,
} from "../../config/marbles-values.js";
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
} from "../../view/marbles/narration.js";
import { marbleCard } from "../../view/marbles/card.js";
import { confirmationEntries } from "../../view/menus/confirmation.js";
import { INITIAL_CURSOR, placementStart, stepCursor, zoneOf } from "../../view/marbles/navigation.js";
import {
  MARBLE_EVENT_CUES,
  discardPlace,
  eventCues,
  handPlace,
  placesDemoCues,
  positionOf,
  renderAt,
  rollRendering,
  rotationPath,
  slotPlace,
  validateMarbleSounds,
  validateRolls,
  collisionStrength,
  validateCollision,
  validateMarbleSizes,
  validatePitchVariation,
  validateSoundDepth,
  validateSoundPlaces,
} from "../../view/marbles/sounds.js";
import { pathLength, rollAt, rollDurationMs, rollEnvelope } from "../../view/marbles/rolls.js";
import { EMPTY_SOUND_QUEUE, advanceSoundQueue, enqueueCues } from "../../view/marbles/sound-queue.js";
import { throws } from "../../lib/check.js";
import MARBLE_TYPES from "../../marbles/types/index.js";

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
  let state = createMarblesGame(11, {}, MARBLE_TYPES);
  const step = (action) => {
    const result = marblesReduce(state, action, MARBLE_TYPES);
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
  const fullHand = marblesReduce({ ...createMarblesGame(4, {}, MARBLE_TYPES), stage: "draw", turn: 2, hand: ["clay", "glass", "agate", "mica", "tiger"] }, { type: "draw" }, MARBLE_TYPES);
  events.push(...fullHand.events);
  let small = createMarblesGame(2, { bag: ["clay", "glass"] }, MARBLE_TYPES);
  const end = marblesReduce(small, { type: "draw" }, MARBLE_TYPES);
  small = end.state;
  events.push(...end.events);
  // Un tour avec des emplacements vides, pour les phases sautées.
  const skipped = marblesReduce({ ...createMarblesGame(3, { bag: [] }, MARBLE_TYPES), turn: 2, stage: "play" }, { type: "resolve" }, MARBLE_TYPES);
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
  let state = createMarblesGame(seed, {}, MARBLE_TYPES);
  const journal = [];
  const step = (action) => {
    lookup(state);
    const result = marblesReduce(state, action, MARBLE_TYPES);
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
    const order = (seed) => bagDisplayOrder(createMarblesGame(seed, {}, MARBLE_TYPES).bag, t).join();
    run("sac : même liste quelle que soit la graine", order(1), order(2));
    run("sac : deux graines, deux vrais ordres de pioche", false, createMarblesGame(1, {}, MARBLE_TYPES).bag.join() === createMarblesGame(2, {}, MARBLE_TYPES).bag.join());
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
  let state = { ...createMarblesGame(1, { bag: [] }, MARBLE_TYPES), turn: 2, stage: "play", hand: ["clay", "glass", "agate"] };
  state = { ...state, triangle: { leftBase: { marble: "mica", wear: 0 }, rightBase: { marble: "tiger", wear: 0 }, apex: { marble: "giant", wear: 0 } } };
  for (const slot of ["apex", "leftBase", "rightBase"]) state = marblesReduce(state, { type: "place", handIndex: 0, slot }, MARBLE_TYPES).state;
  run.same("défausse : de la plus ancienne à la plus récente", ["giant", "mica", "tiger"], state.discard);
}

// Les sons : profils, repères d'un geste et leur ligne de temps, file de sons.
// Rien n'est joué : on vérifie QUAND chaque son partirait.
function checkSounds(run) {
  run("profils : chaque bille a un profil sonore connu", true, Object.values(MARBLE_TYPES).every((type) => Object.hasOwn(MARBLE_SOUND_PROFILES, type.sound)));
  run("profils : bille sans profil refusée", true, throws(() => validateMarbleSounds({ x: {} }, MARBLE_SOUND_PROFILES, MARBLES_SETTINGS)));
  run("profils : profil sans chute refusé", true, throws(() => validateMarbleSounds({}, { small: { beacon: "a" } }, MARBLES_SETTINGS)));
  // Taille et son : deux champs, aucun déduit de l'autre.
  run("tailles : chaque bille a une taille connue", true, Object.values(MARBLE_TYPES).every((type) => Object.hasOwn(MARBLE_SIZES, type.size)));
  run("tailles : taille inconnue refusée", true, throws(() => validateMarbleSizes({ x: { size: "huge" } }, MARBLE_SIZES)));
  run("tailles : poids nul refusé", true, throws(() => validateMarbleSizes({}, { small: { weight: 0 } })));
  run(
    "tailles : une grosse bille peut porter le son d'une moyenne",
    false,
    throws(() => validateMarbleSizes({ x: { size: "large", sound: "classic_medium" } }, MARBLE_SIZES))
  );
  run("collision : réglages du jeu valides", false, throws(() => validateCollision(MARBLES_COLLISION)));
  run("collision : écart négatif refusé", true, throws(() => validateCollision({ ...MARBLES_COLLISION, flamMs: -1 })));
  run("ton : réglages du jeu valides", false, throws(() => validatePitchVariation(MARBLES_PITCH_VARIATION)));
  run("ton : variation sans chute refusée", true, throws(() => validatePitchVariation({ impact: 0.04, roll: 0.02 })));
  const strengthTable = {
    types: { pebble: { size: "small" }, boulder: { size: "large" }, twin: { size: "small" } },
    sizes: { small: { weight: 1 }, large: { weight: 4 } },
    collision: { flamMs: 10, weightExponent: 0.5 },
  };
  run("collision : deux billes de même taille, force 1", 1, collisionStrength("pebble", "twin", strengthTable));
  run("collision : une lourde sur une légère frappe plus fort", 2, collisionStrength("boulder", "pebble", strengthTable));
  run("collision : une légère sur une lourde frappe moins fort", 0.5, collisionStrength("pebble", "boulder", strengthTable));
  run(
    "collision : exposant nul, force toujours 1",
    1,
    collisionStrength("boulder", "pebble", { ...strengthTable, collision: { flamMs: 10, weightExponent: 0 } })
  );
  run(
    "profils : profil sans roulement refusé",
    true,
    throws(() => validateMarbleSounds({}, { small: { beacon: "a", drop: "b", impact: "c" } }, MARBLES_SETTINGS))
  );
  run("profils : délai négatif refusé", true, throws(() => validateMarbleSounds({}, {}, { ...MARBLES_SETTINGS, drawSoundIntervalMs: -1 })));

  const settings = { shuffleToDrawMs: 900, drawSoundIntervalMs: 350, swapSoundDelayMs: 150 };
  const draws = ["clay", "glass", "giant"].map((marble) => ({ type: "draw", marble }));
  run.same(
    "repères : ouverture, le brassage puis une balise après l'autre",
    [
      { atMs: 0, sound: "shuffle" },
      { atMs: 900, sound: "beacon", marble: "clay" },
      { atMs: 1250, sound: "beacon", marble: "glass" },
      { atMs: 1600, sound: "beacon", marble: "giant" },
    ],
    eventCues([{ type: "turnStarted", turn: 1, turnCount: 9 }, ...draws], { shuffleFirst: true }, settings)
  );
  run.same(
    "repères : une pioche sans brassage part aussitôt",
    [0, 350],
    eventCues(draws.slice(0, 2), {}, settings).map((cue) => cue.atMs)
  );
  run.same(
    "repères : sac régénéré, le brassage avant la pioche",
    ["shuffle@0", "beacon@900"],
    eventCues([{ type: "bagRegenerated", size: 4 }, draws[0]], {}, settings).map((cue) => `${cue.sound}@${cue.atMs}`)
  );
  // Roulements, sur une table aux distances rondes : de la main au milieu à la
  // pointe, 1 ; d'une base à l'autre, 0,8 ; de la pointe à la défausse, 0,8.
  const places = {
    hand: { fromX: -0.6, toX: 0.6, y: 0 },
    leftBase: { x: -0.4, y: 0.5 },
    rightBase: { x: 0.4, y: 0.5 },
    apex: { x: 0, y: 1 },
    discard: { x: 0.8, y: 1 },
  };
  const rolls = {
    place: { speed: 1, endRatio: 1 },
    swap: { speed: 1, endRatio: 1 },
    out: { speed: 1, endRatio: 0.6 },
    strike: { speed: 2, endRatio: 1 },
    knocked: { speed: 1, endRatio: 0.6 },
    rotation: { notchMs: 700, endRatio: 0.5, gain: 0.6, dropGain: 0.5 },
    restRate: 0.5,
    fadeMs: 100,
    impactToOutMs: 30,
    outStaggerMs: 200,
  };
  const motion = { rolls, places };
  const placeName = (place) => place.slot ?? place.kind;
  const rolled = (cues) =>
    cues.map((cue) =>
      cue.sound === "roll"
        ? `roll ${cue.marble} ${cue.path.map(placeName).join(">")} @${cue.atMs}+${Math.round(cue.durationMs)}`
        : `${cue.sound} ${cue.marble}${cue.struck ? `>${cue.struck}` : ""} ${placeName(cue.place)} @${Math.round(cue.atMs)}${cue.gain === undefined ? "" : ` x${cue.gain}`}`
    );
  run.same(
    "repères : une pose, la bille roule de la main à l'emplacement, puis y tombe",
    ["roll agate hand>apex @0+1000", "drop agate apex @1000"],
    rolled(eventCues([{ type: "placed", slot: "apex", marble: "agate" }], { placeFrom: handPlace(1, 3) }, settings, motion))
  );
  run.same(
    "repères : une pose part de la place de la bille dans la main",
    handPlace(4, 5),
    eventCues([{ type: "placed", slot: "apex", marble: "agate" }], { placeFrom: handPlace(4, 5) }, settings, motion)[0].path[0]
  );
  run.same(
    "repères : sans place connue, la pose part du milieu de la main",
    { x: 0, y: 0 },
    positionOf(eventCues([{ type: "placed", slot: "apex", marble: "agate" }], {}, settings, motion)[0].path[0], places)
  );
  // Remplacement, dans l'ordre du journal : l'éjection, le retrait, la défausse,
  // la pose, le tic. La bille posée est tirée (deux fois plus vite ici) ; la
  // collision attend son arrivée, à la force du choc (une grosse, poids 2, sur une
  // petite, poids 1 : 2) ; la délogée part 30 ms après, lancée deux fois plus vite.
  // L'écart entre les deux sons de la collision se programme à la lecture.
  const knockedOut = { slot: "apex", marble: "mica" };
  const replacement = [
    { type: "knockout", ...knockedOut },
    { type: "removed", ...knockedOut, cause: "replacement" },
    { type: "discarded", ...knockedOut, cause: "replacement" },
    { type: "placed", slot: "apex", marble: "agate" },
    { type: "hit", slot: "apex", marble: "agate" },
  ];
  const collisionMotion = {
    ...motion,
    collision: { flamMs: 10, weightExponent: 1 },
    types: { agate: { size: "large" }, mica: { size: "small" } },
    sizes: { small: { weight: 1 }, large: { weight: 2 } },
  };
  run.same(
    "repères : un remplacement, la bille tirée, la collision des deux billes, puis la délogée lancée à la défausse",
    [
      "roll agate hand>apex @0+500",
      "collision agate>mica apex @500 x2",
      "roll mica apex>discard @530+500",
      "drop mica discard @1030",
    ],
    rolled(eventCues(replacement, {}, settings, collisionMotion))
  );
  run.same(
    "repères : la bille qui frappe est tirée, celle qui se pose ne l'est pas",
    ["strike", "place"],
    [
      eventCues(replacement, {}, settings, collisionMotion)[0].style,
      eventCues([{ type: "placed", slot: "apex", marble: "agate" }], {}, settings, collisionMotion)[0].style,
    ]
  );
  run(
    "repères : la délogée part à la défausse en style knocked, l'usée en style out",
    "knocked out",
    [
      eventCues(replacement, {}, settings, collisionMotion).find((cue) => cue.marble === "mica" && cue.sound === "roll").style,
      eventCues([{ type: "discarded", slot: "apex", marble: "mica", cause: "wear" }], {}, settings, collisionMotion)[0].style,
    ].join(" ")
  );
  // Échange : la bille choisie (en `a` avant l'échange, en `b` après), puis l'autre.
  const swapped = { type: "swapped", a: "leftBase", b: "rightBase" };
  run.same(
    "repères : un échange, la bille choisie roule puis l'autre, chacune tombe à l'arrivée",
    ["roll giant leftBase>rightBase @0+800", "drop giant rightBase @800", "roll mica rightBase>leftBase @150+800", "drop mica leftBase @950"],
    rolled(
      eventCues([swapped], { triangleAfter: { leftBase: { marble: "mica", wear: 0 }, rightBase: { marble: "giant", wear: 1 }, apex: null } }, settings, motion)
    )
  );
  run.same(
    "repères : un déplacement vers un vide, une seule bille roule, aussitôt",
    ["roll giant leftBase>rightBase @0+800", "drop giant rightBase @800"],
    rolled(eventCues([swapped], { triangleAfter: { leftBase: null, rightBase: { marble: "giant", wear: 0 }, apex: null } }, settings, motion))
  );
  run.same(
    "repères : les billes usées roulent à la défausse l'une après l'autre",
    ["roll clay apex>discard @0+1000", "drop clay discard @1000", "roll tiger apex>discard @200+1000", "drop tiger discard @1200"],
    rolled(
      eventCues(
        ["clay", "tiger"].flatMap((marble) => [
          { type: "removed", slot: "apex", marble, cause: "wear" },
          { type: "discarded", slot: "apex", marble, cause: "wear" },
        ]),
        {},
        settings,
        motion
      )
    )
  );
  // Rotation : chaque bille roule vers l'emplacement suivant, toutes ensemble ; un
  // emplacement vide reste muet. Les chutes, plus discrètes, à l'arrivée.
  const rotation = (triangle) => ({ type: "rotation", triangle });
  run.same(
    "repères : une rotation, les billes tournent ensemble, puis se calent",
    [
      "roll clay leftBase>apex @0+700",
      "drop clay apex @700 x0.5",
      "roll tiger rightBase>leftBase @0+700",
      "drop tiger leftBase @700 x0.5",
      "roll mica apex>rightBase @0+700",
      "drop mica rightBase @700 x0.5",
    ],
    rolled(
      eventCues(
        [rotation({ apex: { marble: "clay", wear: 1 }, rightBase: { marble: "mica", wear: 1 }, leftBase: { marble: "tiger", wear: 1 } })],
        {},
        settings,
        motion
      )
    )
  );
  run.same(
    "repères : une rotation avec un seul emplacement occupé, une seule bille tourne",
    ["roll giant rightBase>leftBase @0+700", "drop giant leftBase @700 x0.5"],
    rolled(eventCues([rotation({ apex: null, rightBase: null, leftBase: { marble: "giant", wear: 0 } })], {}, settings, motion))
  );
  run.same("rotation : un cran, l'emplacement suivant", ["leftBase", "apex"], rotationPath("leftBase", 1));
  run.same("rotation : trois crans, le tour complet", ["apex", "rightBase", "leftBase", "apex"], rotationPath("apex", 3));
  run.same(
    "rotation : l'ordre de la vue est celui du cœur",
    ["apex", "rightBase", "leftBase"],
    ["leftBase", "apex", "rightBase"].map((slot) => rotationPath(slot, 1)[1])
  );
  run("rotation : plusieurs crans, une durée par cran", 2100, rollDurationMs([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 0 }], rolls.rotation));
  run("roulements : rotation sans durée de cran refusée", true, throws(() => validateRolls({ ...rolls, rotation: { endRatio: 0.5, gain: 0.6, dropGain: 0.5 } })));
  run("roulements : vitesse nulle refusée", true, throws(() => validateRolls({ ...rolls, out: { speed: 0, endRatio: 0.5 } })));
  run("roulements : style manquant refusé", true, throws(() => validateRolls({ ...rolls, swap: undefined })));
  run("roulements : réglages du jeu valides", false, throws(() => validateRolls(rolls)));

  // Le mouvement : une bille qui ralentit fait plus de chemin au début qu'à la fin.
  const from = { x: 0, y: 0 };
  const to = { x: 0, y: 1 };
  run("mouvement : durée, distance sur vitesse moyenne", 1250, rollDurationMs([from, to], { speed: 1, endRatio: 0.6 }));
  const slowing = { path: [from, to], durationMs: 1000, endRatio: 0.2 };
  run.same("mouvement : au départ, à la place de départ, à pleine vitesse", { position: from, speedRatio: 1, done: false }, rollAt(slowing, 0));
  const arrived = rollAt(slowing, 1000);
  run.same("mouvement : à l'arrivée, à la place d'arrivée, ralentie", { position: to, speedRatio: 0.2, done: true }, { ...arrived, speedRatio: Math.round(arrived.speedRatio * 100) / 100 });
  run("mouvement : à mi-temps, plus de la moitié du chemin", true, rollAt(slowing, 500).position.y > 0.5);
  run("mouvement : sans ralentir, à mi-temps, à mi-chemin", 0.5, rollAt({ ...slowing, endRatio: 1 }, 500).position.y);
  // Un chemin à plusieurs étapes : la bille passe par chacune sans s'arrêter.
  const turn = { path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], durationMs: 1000, endRatio: 1 };
  run("mouvement : longueur d'un chemin, étape par étape", 2, pathLength(turn.path));
  run.same("mouvement : à mi-temps, à l'étape du milieu", { x: 1, y: 0 }, rollAt(turn, 500).position);
  run.same("mouvement : aux trois quarts, sur la seconde étape", { x: 1, y: 0.5 }, rollAt(turn, 750).position);
  run.same("mouvement : à l'arrivée, au bout du chemin", { x: 1, y: 1 }, rollAt(turn, 1000).position);
  run.same("mouvement : enveloppe, fondu d'entrée, plein, fondu de sortie", [0, 0.5, 1, 0.5, 0], [0, 50, 500, 950, 1000].map((ms) => rollEnvelope(ms, 1000, 100)));

  // Le rendu d'une bille qui roule : il suit la position (profondeur) et la vitesse
  // (volume, vitesse de lecture).
  const depthOf = { farGainDb: -6, nearLowpassHz: 20000, farLowpassHz: 7000, nearReverbSend: 0.05, farReverbSend: 0.35, reverb: { durationSec: 1, decay: 3, wet: 0.5 } };
  const render = (ms) => rollRendering(slowing, ms, 1, rolls, depthOf);
  run("rendu du roulement : muet au tout départ, le fondu d'entrée", 0, render(0).volume);
  run("rendu du roulement : vitesse de lecture d'origine au départ", 1, render(0).rate);
  run("rendu du roulement : passe-bas toujours présent, ouvert au plus près", 20000, render(0).lowpassHz);
  run("rendu du roulement : plus grave en ralentissant", true, render(900).rate < render(100).rate && render(900).rate > 0.5);
  run("rendu du roulement : plus loin, plus réverbéré", true, render(900).reverbSend > render(100).reverbSend);
  run("rendu du roulement : plus lente, plus douce", true, render(800).volume < render(200).volume);
  run("rendu du roulement : le gain du style s'applique", 0.6, Math.round((rollRendering({ ...slowing, gain: 0.6 }, 500, 1, rolls, depthOf).volume / render(500).volume) * 100) / 100);
  run.same(
    "repères : une phase, la balise de la bille active, à son emplacement",
    [{ atMs: 0, sound: "beacon", marble: "clay", place: slotPlace("apex") }],
    eventCues([{ type: "phase", slot: "apex", marble: "clay" }], {}, settings)
  );

  // Stéréo : chaque bille piochée s'entend à sa place dans la main, de gauche à
  // droite ; les places rendent leur panoramique.
  run.same(
    "repères : les billes piochées, les dernières de la main, dans l'ordre",
    [handPlace(3, 5), handPlace(4, 5)],
    eventCues(draws.slice(0, 2), { handAfter: ["agate", "mica", "tiger", "clay", "glass"] }, settings).map((cue) => cue.place)
  );
  run("repères : sans main connue, la pioche au centre", undefined, eventCues(draws.slice(0, 1), {}, settings)[0].place);
  const round = (value) => Math.round(value * 100) / 100;
  run.same(
    "stéréo : la main de gauche à droite",
    [-0.6, -0.3, 0, 0.3, 0.6],
    [0, 1, 2, 3, 4].map((index) => round(positionOf(handPlace(index, 5), places).x))
  );
  run("stéréo : une bille seule au milieu", 0, positionOf(handPlace(0, 1), places).x);
  run.same("stéréo : les emplacements", [-0.4, 0.4, 0], ["leftBase", "rightBase", "apex"].map((slot) => positionOf(slotPlace(slot), places).x));
  run("stéréo : panoramique hors bornes refusé", true, throws(() => validateSoundPlaces({ ...places, apex: { x: 1.5, y: 1 } })));
  run("stéréo : place manquante refusée", true, throws(() => validateSoundPlaces({ hand: places.hand, leftBase: places.leftBase })));
  run("stéréo : défausse manquante refusée", true, throws(() => validateSoundPlaces({ ...places, discard: undefined })));
  run("stéréo : places complètes acceptées", false, throws(() => validateSoundPlaces(places)));
  run.same("stéréo : la défausse a sa place", { x: 0.8, y: 1 }, positionOf(discardPlace(), places));
  run("profondeur : profondeur hors bornes refusée", true, throws(() => validateSoundPlaces({ ...places, apex: { x: 0, y: 2 } })));

  // Profondeur : volume, passe-bas et réverbération suivent y, de la main à la pointe.
  const depth = { farGainDb: -6, nearLowpassHz: 20000, farLowpassHz: 7000, nearReverbSend: 0.05, farReverbSend: 0.35, reverb: { durationSec: 1, decay: 3, wet: 0.5 } };
  const at = (place) => renderAt(place, places, depth);
  run.same("profondeur : sans place, centre, plein volume, sec", { pan: 0, gain: 1, lowpassHz: undefined, reverbSend: 0 }, at(undefined));
  run.same("profondeur : la main, au plus près, sans filtre", { pan: -0.6, gain: 1, lowpassHz: undefined, reverbSend: 0.05 }, at(handPlace(0, 5)));
  run("profondeur : la pointe, au volume le plus bas", -6, round(20 * Math.log10(at(slotPlace("apex")).gain)));
  run("profondeur : la pointe, passe-bas au plus bas", 7000, Math.round(at(slotPlace("apex")).lowpassHz));
  run("profondeur : la pointe, le plus de réverbération", 0.35, round(at(slotPlace("apex")).reverbSend));
  run("profondeur : les bases à mi-chemin, en décibels", -3, round(20 * Math.log10(at(slotPlace("leftBase")).gain)));
  run("profondeur : passe-bas logarithmique à mi-chemin", Math.round(Math.sqrt(20000 * 7000)), Math.round(at(slotPlace("rightBase")).lowpassHz));
  run.same(
    "profondeur : de plus en plus loin, de plus en plus bas et réverbéré",
    [true, true],
    [
      at(handPlace(0, 5)).gain > at(slotPlace("leftBase")).gain && at(slotPlace("leftBase")).gain > at(slotPlace("apex")).gain,
      at(handPlace(0, 5)).reverbSend < at(slotPlace("leftBase")).reverbSend && at(slotPlace("leftBase")).reverbSend < at(slotPlace("apex")).reverbSend,
    ]
  );
  run("profondeur : gain positif refusé", true, throws(() => validateSoundDepth({ ...depth, farGainDb: 3 })));
  run("profondeur : envoi hors bornes refusé", true, throws(() => validateSoundDepth({ ...depth, farReverbSend: 2 })));
  run("profondeur : réverbération sans durée refusée", true, throws(() => validateSoundDepth({ ...depth, reverb: { decay: 3, wet: 0.5 } })));
  run.same(
    "démonstration : six places, de la main à la pointe, espacées",
    ["hand@0", "hand@700", "hand@1400", "leftBase@2100", "rightBase@2800", "apex@3500"],
    placesDemoCues("clay").map((cue) => `${cue.place.slot ?? cue.place.kind}@${cue.atMs}`)
  );
  run.same("repères : une phase sur un emplacement vide reste muette", [], eventCues([{ type: "phaseSkipped", slot: "apex" }], {}, settings));

  // La file : les immédiats aussitôt, les autres à leur échéance, dans l'ordre.
  let queue = enqueueCues(EMPTY_SOUND_QUEUE, eventCues(draws, { shuffleFirst: true }, settings));
  const step = (deltaMs) => {
    const result = advanceSoundQueue(queue, deltaMs);
    queue = result.queue;
    return result.due.map((cue) => cue.marble ?? cue.sound);
  };
  run.same("file : l'immédiat part aussitôt", ["shuffle"], step(0));
  run.same("file : rien avant l'échéance", [], step(899));
  run.same("file : la première balise à son échéance", ["clay"], step(1));
  run.same("file : une longue absence rend tout ce qui est dû, dans l'ordre", ["glass", "giant"], step(5000));
  run("file : vide une fois tout joué", 0, queue.length);
}

export default function checkMarblesView(run) {
  const { events, state } = sampleEvents();
  const seenTypes = [...new Set(events.map((event) => event.type))].sort();

  run.same("sons : un point d'accroche par évènement du journal", Object.keys(MARBLE_EVENT_CUES).sort(), seenTypes);
  checkSounds(run);
  checkCards(run);
  checkBagOrder(run);
  run("narration : évènement inconnu refusé", true, throws(() => buildSteps([{ type: "nope" }], (key) => key)));

  // Le découpage en étapes : tous les évènements, chacun une fois, dans l'ordre.
  run.same("étapes : aucun évènement perdu", events, buildSteps(events, (key) => key).flatMap((step) => step.events));
  const turn = createMarblesGame(4, {}, MARBLE_TYPES);
  const drawn = marblesReduce(turn, { type: "draw" }, MARBLE_TYPES);
  run.same(
    "étapes : la pioche, puis le début de tour",
    ["marbles.event.draw", "marbles.event.turn_started"],
    buildSteps(drawn.events, (key) => key).map((step) => step.text)
  );

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
      "texte : effet de phase négatif",
      "pointe, plombée : Vitesse −3.",
      said(stepsText(buildSteps([{ type: "phase", slot: "apex", marble: "leaded" }, { type: "effect", trigger: "phase", slot: "apex", marble: "leaded", speedDelta: -3, massDelta: 0, given: [], speed: -3, mass: 1 }], t)))
    );
    run("texte : deux effets", "Vitesse +1 et Masse +2", said(describeEffect({ speed: 1, mass: 2 }, t)));
    run("texte : effet donné", "Vitesse +4 à la pointe", said(describeEffect({ speed: 0, mass: 0, given: [{ slot: "apex", marble: "shooter", speed: 4, mass: 0 }] }, t)));
    run(
      "texte : effet imprimé de la loupe",
      "Vitesse +4 à la pointe si son effet de pointe donne au moins Vitesse +1",
      said(describePrinted(MARBLE_TYPES.magnifier.baseVariant.leftBase, t))
    );
    run("texte : Impact", "Impact 6. Score 14.", said(stepsText(buildSteps([{ type: "impact", speed: 3, mass: 2, impact: 6, score: 14 }], t))));

    // Annonces principales : courtes, le détail est dans la fiche.
    const inHand = { ...state, hand: ["clay", "cats_eye", "shooter"] };
    run("texte : bille en main", "argile, usure 3. 1 sur 3", said(describeHandFocus(inHand, 0, t)));
    run("texte : usure maximale propre", "géante, usure 1. 2 sur 5", said(describeMarbleInList("giant", 1, 5, t)));

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
    run.same("confirmation sur vide : la question, puis les valeurs prévues", ["Poser argile en base droite ?", "Vitesse +1"], menuLines(0, "rightBase"));
    run.same(
      "confirmation sur occupé : dans l'ordre réel, élision comprise, bonus reçu compté",
      ["Poser argile en pointe ?", "Vitesse +8", "Éjection de calot : Vitesse +3", "Tic d'argile : Vitesse +2"],
      menuLines(0, "apex")
    );
    run.same(
      "confirmation : aucun effet dit, même structure",
      ["Poser verre en base gauche ?", "Masse +1", "Éjection de loupe : aucun effet", "Tic de verre : aucun effet"],
      menuLines(2, "leftBase")
    );
    // Les valeurs prévues au format de R : ce que la loupe donne s'entend chez le
    // calot, pas chez elle.
    const lensToPlace = { ...lensed, hand: ["magnifier"], triangle: { ...lensed.triangle, leftBase: null } };
    run.same(
      "confirmation : valeurs produites seulement, sans bonus donné",
      ["Poser loupe en base gauche ?", "aucun effet"],
      placementLines(lensToPlace, 0, "leftBase", t).map(({ key, params }) => said(t(key, params)))
    );
    // Le menu entier : question, valeurs, Éjection, Tic, puis Annuler avant Confirmer ;
    // seules ces deux-là agissent.
    const entries = confirmationEntries(() => {}, placementLines(lensed, 0, "apex", t));
    run.same(
      "confirmation : ordre complet du menu sur occupé",
      ["marbles.place.question", "marbles.place.values", "marbles.place.knockout", "marbles.place.hit", "menu.confirm.cancel", "menu.confirm.confirm"],
      entries.map((entry) => entry.label)
    );
    run.same(
      "confirmation : les entrées d'information sans action",
      [false, false, false, false, true, true],
      entries.map((entry) => typeof entry.onActivate === "function")
    );
    run.same(
      "confirmation : ordre complet du menu sur vide",
      ["marbles.place.question", "marbles.place.values", "menu.confirm.cancel", "menu.confirm.confirm"],
      confirmationEntries(() => {}, placementLines(lensed, 0, "rightBase", t)).map((entry) => entry.label)
    );

    // Ce qui se dit d'une pose et d'une résolution réelles.
    const placing = marblesReduce(lensed, { type: "place", handIndex: 0, slot: "apex" }, MARBLE_TYPES);
    run(
      "texte : pose sur occupé",
      "Éjection de calot : Vitesse +3. Vitesse 3, Masse 1. Défausse : calot. Pose : argile en pointe. Tic d'argile : Vitesse +2. Vitesse 5, Masse 1.",
      said(stepsText(buildSteps(placing.events, t)))
    );
    const lensedSteps = buildSteps(marblesReduce(lensed, { type: "resolve" }, MARBLE_TYPES).events, t).map((step) => said(step.text));
    run("texte : la loupe ne produit rien elle-même", "base gauche, loupe : aucun effet.", lensedSteps[0]);
    run("texte : le bonus s'entend chez qui le reçoit", "pointe, calot : Vitesse +12.", lensedSteps[2]);
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
      ["Place clay on the apex?", "Speed +8", "Knockout of shooter: Speed +3", "Hit from clay: Speed +2"],
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

  // Sélection d'emplacement : la main n'existe plus pour le curseur, le triangle
  // se parcourt comme d'habitude.
  const inTriangle = (place, lastBase = "leftBase") => ({ ...INITIAL_CURSOR, place, lastBase });
  run("sélection : rien sous la base gauche", null, stepCursor(inTriangle("leftBase"), "down", true));
  run("sélection : rien sous la base droite", null, stepCursor(inTriangle("rightBase", "rightBase"), "down", true));
  run("sélection : de la pointe vers la dernière base", "rightBase", stepCursor(inTriangle("apex", "rightBase"), "down", true).place);
  run("sélection : d'une base à l'autre", "rightBase", stepCursor(inTriangle("leftBase"), "right", true).place);
  run("sélection : vers la pointe", "apex", stepCursor(inTriangle("rightBase", "rightBase"), "up", true).place);
  const marble = { marble: "clay", wear: 0 };
  const start = (leftBase, rightBase, apex) => placementStart({ leftBase, rightBase, apex }, SLOTS);
  run("sélection : tout vide, base gauche", "leftBase", start(null, null, null));
  run("sélection : premier vide, base droite", "rightBase", start(marble, null, null));
  run("sélection : seule la pointe est vide", "apex", start(marble, marble, null));
  run("sélection : base gauche avant pointe", "leftBase", start(null, marble, null));
  run("sélection : tout occupé, base gauche", "leftBase", start(marble, marble, marble));
}
