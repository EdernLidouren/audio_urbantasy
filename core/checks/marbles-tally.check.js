// Vérifications du core — domaine « marbles-tally ». Les valeurs de partie du jeu
// des billes : le registre (core/marbles-tally.js), la génération et la déclaration
// des compteurs (core/marbles-counters.js), puis leur branchement dans le réducteur :
// la règle des mots-clés (un champ, ou un effet reçu), les actions mots-clés et leurs
// quantités réelles, Vitesse et Masse, les évènements réels, les deux portées, la
// sérialisation, et les deux billes qui les lisent, la loupe et le verre. Lancées par
// core/checks/index.js/runChecks (`node tools/run-checks.js marbles-tally`).

import { throws } from "../../lib/check.js";
import { MARBLE_TALLIES, MARBLE_TRIGGERS, LARGE, MEDIUM, SMALL } from "../../config/marbles-values.js";
import { JOURNAL_EVENTS, TALLY_COUNTERS, legalActions } from "../marbles.js";
import { CLAUSE_ACTIONS } from "../marbles-effects.js";
import { TALLY_CATEGORIES, buildTallyCounters, validateEventTallies } from "../marbles-counters.js";
import { emptyTally, recordTally, tallyValue } from "../marbles-tally.js";
import { nextRandom } from "../rng.js";
import MARBLE_TYPES from "../../marbles/types/index.js";
import { createMarblesRules } from "../marbles-rules.js";
import { emptyBagMarblesGame, inHand, withSizes } from "./helpers.js";

// Les règles du jeu, liées à la vraie table (core/marbles-rules.js), et des règles
// fabriquées, la vraie table complétée de billes de test.
const rules = createMarblesRules(MARBLE_TYPES);
const fabricated = (table) => createMarblesRules({ ...MARBLE_TYPES, ...withSizes(table) });

const placed = (marble, wear = 0) => ({ marble, wear });
const PHASES = [
  { id: "apex", slots: ["apex"] },
  { id: "base", slots: ["leftBase", "rightBase"] },
  { id: "leftBase", slots: ["leftBase"] },
  { id: "rightBase", slots: ["rightBase"] },
];

// Un registre décrit en partie : { id: { turn, game } } ou { id: n } (les deux
// portées), le reste à zéro.
function tallyOf(values = {}) {
  const tally = emptyTally(TALLY_COUNTERS);
  for (const [id, value] of Object.entries(values)) tally[id] = typeof value === "number" ? { turn: value, game: value } : { ...tally[id], ...value };
  return tally;
}

function playState(over = {}, marbles = rules) {
  return { ...emptyBagMarblesGame(marbles, 1), turn: 2, stage: "play", ...over, tally: tallyOf(over.tally) };
}

// Seulement ces compteurs-là d'un relevé.
function pick(values, ids) {
  return Object.fromEntries(Object.entries(values).filter(([id]) => ids.includes(id)));
}

// Ce qu'une action a ajouté au registre, portée « cette partie », compteurs non nuls.
function added(before, after) {
  return Object.fromEntries(
    Object.keys(after.tally)
      .map((id) => [id, after.tally[id].game - before.tally[id].game])
      .filter(([, value]) => value !== 0)
  );
}

// Les effets d'un déclencheur dans un journal, réduits à leur bille et leur Vitesse.
const effectsOf = (events, trigger) => events.filter((event) => event.type === "effect" && event.trigger === trigger).map(({ marble, speedDelta }) => ({ marble, speedDelta }));

export default function checkMarblesTally(run) {
  checkRegistry(run);
  checkGeneration(run);
  checkDeclarations(run);
  checkKeywords(run);
  checkActions(run);
  checkStats(run);
  checkEvents(run);
  checkScopes(run);
  checkTestMarbles(run);
}

// Le registre seul : deux portées, la remise à zéro du tour, la lecture publique.
function checkRegistry(run) {
  const counters = [
    { id: "a", count: (event) => (event.type === "flick" ? 1 : 0) },
    { id: "b", count: (event) => (event.type === "effect" ? event.speedDelta : 0) },
  ];
  const record = (tally, event) => recordTally(tally, event, {}, counters);
  const empty = emptyTally(counters);
  run.same("registre : une partie neuve, tout à zéro dans les deux portées", { a: { turn: 0, game: 0 }, b: { turn: 0, game: 0 } }, empty);
  const flicked = [{ type: "flick" }, { type: "flick" }, { type: "effect", speedDelta: 3 }].reduce(record, empty);
  run.same("registre : chaque compteur ajoute ce que l'évènement lui apporte", { a: { turn: 2, game: 2 }, b: { turn: 3, game: 3 } }, flicked);
  run("registre : un évènement qui n'apporte rien rend le même registre", flicked, record(flicked, { type: "swapped" }));
  run.same("registre : rien n'est modifié en place", { a: { turn: 0, game: 0 }, b: { turn: 0, game: 0 } }, empty);
  run.same("registre : au début d'un tour, « ce tour » revient à zéro, pas « cette partie »", { a: { turn: 0, game: 2 }, b: { turn: 0, game: 3 } }, record(flicked, { type: "turnStarted" }));
  run("registre : un début de tour sans rien à remettre rend le même registre", empty, record(empty, { type: "turnStarted" }));
  run("lecture : ce tour", 2, tallyValue(flicked, "a", "turn"));
  run("lecture : cette partie", 3, tallyValue(flicked, "b", "game"));
  run("lecture : un compteur inconnu lève", true, throws(() => tallyValue(flicked, "nope", "turn")));
  run("lecture : une portée inconnue lève", true, throws(() => tallyValue(flicked, "a", "forever")));
}

// La génération : chaque déclencheur, phase et action a ses compteurs ; un
// déclencheur ou une action fictifs ont les leurs sans autre modification.
function checkGeneration(run) {
  const ids = TALLY_COUNTERS.map((counter) => counter.id);
  run("génération : un compteur par déclencheur", true, MARBLE_TRIGGERS.every((trigger) => ids.includes(trigger.id)));
  run("génération : les phases", true, ["apex", "base", "leftBase", "rightBase"].every((id) => ids.includes(id)));
  run.same(
    "génération : les actions mots-clés, déclenchements et quantité réelle",
    ["draw", "drawQuantity", "polish", "polishQuantity", "crack", "crackQuantity", "pocket", "pocketQuantity"],
    TALLY_COUNTERS.filter((counter) => counter.category === "action").map((counter) => counter.id)
  );
  run.same(
    "génération : Vitesse et Masse, gains et pertes",
    ["speedGains", "speedGained", "speedLosses", "speedLost", "massGains", "massGained", "massLosses", "massLost"],
    TALLY_COUNTERS.filter((counter) => counter.category === "stat").map((counter) => counter.id)
  );
  run.same("génération : les évènements déclarés", MARBLE_TALLIES.map((tally) => tally.id), TALLY_COUNTERS.filter((counter) => counter.category === "event").map((counter) => counter.id));
  run("génération : catégories dans l'ordre du menu", true, TALLY_COUNTERS.every((counter, index) => index === 0 || TALLY_CATEGORIES.indexOf(TALLY_COUNTERS[index - 1].category) <= TALLY_CATEGORIES.indexOf(counter.category)));

  const spin = { id: "spin", field: "spin", event: "spun", marble: "onSlot" };
  const twirl = { kind: "marble", keyword: { triggers: () => 0, quantity: () => 0 } };
  const nudge = { kind: "marble", keyword: { triggers: () => 0 } };
  const built = buildTallyCounters({
    triggers: [...MARBLE_TRIGGERS, spin],
    phases: PHASES,
    actions: { ...CLAUSE_ACTIONS, twirl, nudge, shove: { kind: "value" } },
    events: MARBLE_TALLIES,
    journalEvents: JOURNAL_EVENTS,
  }).map((counter) => counter.id);
  run("génération : un déclencheur fictif a son compteur", true, built.includes("spin"));
  run("génération : une action fictive a ses deux compteurs", true, built.includes("twirl") && built.includes("twirlQuantity"));
  run("génération : sans quantité réelle, un seul compteur", true, built.includes("nudge") && !built.includes("nudgeQuantity"));
  run("génération : une action de valeur sans mot-clé a ses gains et pertes", true, ["shoveGains", "shoveGained", "shoveLosses", "shoveLost"].every((id) => built.includes(id)));
  run(
    "génération : un identifiant en double refusé",
    true,
    throws(() => buildTallyCounters({ triggers: MARBLE_TRIGGERS, phases: PHASES, actions: CLAUSE_ACTIONS, events: [{ id: "flick", events: ["flick"] }], journalEvents: JOURNAL_EVENTS }))
  );
}

// Les évènements réels déclarés : ce qui se trompe échoue au chargement.
function checkDeclarations(run) {
  const valid = { id: "a", events: ["flick"] };
  const refused = (tallies) => throws(() => validateEventTallies(tallies, JOURNAL_EVENTS));
  run("déclaration : la vraie liste est valide", false, refused(MARBLE_TALLIES));
  run("déclaration : filtre et correspondance valides", false, refused([{ ...valid, events: ["removed"], match: { cause: "wear" }, filter: { type: "size", size: SMALL } }]));
  run("déclaration : évènement inconnu refusé", true, refused([{ ...valid, events: ["flicked"] }]));
  run("déclaration : aucun évènement refusé", true, refused([{ ...valid, events: [] }]));
  run("déclaration : champ inconnu refusé", true, refused([{ ...valid, scope: "turn" }]));
  run("déclaration : correspondance qui n'est pas un objet refusée", true, refused([{ ...valid, match: "wear" }]));
  run("déclaration : filtre inconnu refusé", true, refused([{ ...valid, filter: { type: "color" } }]));
  run("déclaration : calibre inconnu refusé", true, refused([{ ...valid, filter: { type: "size", size: 9 } }]));
  // La pioche de la prévision cache sa bille : un filtre ne peut pas la lire.
  run("déclaration : filtre sur la pioche refusé", true, refused([{ ...valid, events: ["draw"], filter: { type: "size", size: SMALL } }]));

  // La liste des évènements suit le moteur : des parties jouées au hasard (un PRNG
  // de test, à graine) n'émettent rien qu'elle ignore.
  const emitted = new Set();
  let random = 7;
  for (let seed = 1; seed <= 40; seed++) {
    let state = rules.createGame(seed);
    while (state.stage !== "over") {
      const actions = legalActions(state);
      const draw = nextRandom(random);
      random = draw.state;
      const result = rules.reduce(state, actions[Math.floor(draw.value * actions.length)]);
      for (const event of result.events) emitted.add(event.type);
      state = result.state;
    }
  }
  run.same("déclaration : chaque évènement émis est dans JOURNAL_EVENTS", [], [...emitted].filter((type) => !Object.hasOwn(JOURNAL_EVENTS, type)));
}

// La règle des mots-clés de déclenchement.
function checkKeywords(run) {
  // Un champ vide sans effet extérieur ne compte pas ; l'évènement réel, si.
  const tiger = playState({ hand: inHand(["tiger"]) });
  const thrown = rules.reduce(tiger, { type: "place", handIndex: 0, slot: "apex" });
  run.same("mots-clés : la tigrée, sans Chiquenaude, ne compte que comme bille lancée", { thrownMarbles: 1 }, added(tiger, thrown.state));

  // Un effet à condition fausse compte : le Tic du gorille sur une géante (pas plus
  // petite) ne produit rien, mais le champ existe. Son Empocher trouve la main vide :
  // un déclenchement, aucune bille déplacée.
  const gorilla = playState({ hand: inHand(["gorilla"]), triangle: { leftBase: null, rightBase: null, apex: placed("giant") } });
  const hit = rules.reduce(gorilla, { type: "place", handIndex: 0, slot: "apex" });
  run.same("mots-clés : le Tic à condition fausse ne produit rien", [{ marble: "gorilla", speedDelta: 0 }], effectsOf(hit.events, "hit"));
  run.same(
    "mots-clés : mais compte, comme ses évènements ; la géante sans Éjection : +1 bille éjectée, +0 éjection",
    { hit: 1, thrownMarbles: 1, hitMarbles: 1, ejectedMarbles: 1, triangleExits: 1, pocket: 1 },
    added(gorilla, hit.state)
  );
  // Une occupante qui a une Éjection : +1 éjection, aussi.
  const knocked = playState({ hand: inHand(["tiger"]), triangle: { leftBase: null, rightBase: null, apex: placed("gorilla") } });
  run("mots-clés : l'Éjection du gorille compte", 1, added(knocked, rules.reduce(knocked, { type: "place", handIndex: 0, slot: "apex" }).state).knockout);

  // Les phases : chaque base, les deux bases, la pointe. Le gorille n'a pas d'effet de
  // base : sa phase ne compte pas ; un emplacement vide saute sa phase.
  const phases = playState({ triangle: { leftBase: placed("clay"), rightBase: placed("gorilla"), apex: null } });
  run.same(
    "mots-clés : base gauche comptée, base droite au champ vide non, pointe vide sautée",
    { base: 1, leftBase: 1, speedGains: 1, speedGained: 1 },
    added(phases, rules.reduce(phases, { type: "resolve" }).state)
  );
  const both = playState({ triangle: { leftBase: placed("clay"), rightBase: placed("tiger"), apex: placed("giant") } });
  const bothAdded = added(both, rules.reduce(both, { type: "resolve" }).state);
  run.same("mots-clés : bases = bases gauches + bases droites", { apex: 1, base: 2, leftBase: 1, rightBase: 1 }, { apex: bothAdded.apex, base: bothAdded.base, leftBase: bothAdded.leftBase, rightBase: bothAdded.rightBase });
  // Une variante de base est l'effet de base de son emplacement.
  const variant = playState({ triangle: { leftBase: null, rightBase: placed("cats_eye"), apex: null } });
  run("mots-clés : la variante de base droite de l'œil-de-chat compte", 1, added(variant, rules.reduce(variant, { type: "resolve" }).state).rightBase);

  // Un champ de pointe vide qui reçoit un bonus ciblé compte (un effet extérieur).
  const giving = fabricated({ blank: { apex: [] }, giver: { base: [{ action: "speed", amount: 2, target: "apex" }], apex: [] } });
  const bonus = playState({ triangle: { leftBase: placed("giver"), rightBase: null, apex: placed("blank") } }, giving);
  const bonusAdded = added(bonus, giving.reduce(bonus, { type: "resolve" }).state);
  run("mots-clés : une pointe au champ vide qui reçoit un bonus compte", 1, bonusAdded.apex);
  const alone = playState({ triangle: { leftBase: null, rightBase: null, apex: placed("blank") } }, giving);
  run("mots-clés : sans bonus, la même ne compte pas", undefined, added(alone, giving.reduce(alone, { type: "resolve" }).state).apex);

  // Plusieurs billes au même moment comptent chacune : un mélange, trois
  // Trouvailles (la tigrée, l'agate, le sulfure), pas le verre qui n'en a pas.
  const windfalls = playState({ stage: "draw", bag: [], discard: ["clay"], triangle: { leftBase: placed("tiger"), rightBase: placed("agate"), apex: placed("sulphide") } });
  const regenerated = added(windfalls, rules.reduce(windfalls, { type: "draw" }).state);
  run.same("mots-clés : trois Trouvailles pour un mélange", { windfall: 3, shuffles: 1 }, { windfall: regenerated.windfall, shuffles: regenerated.shuffles });
}

// Les actions mots-clés : déclenchements et quantités réelles, après plancher ou
// plafond.
function checkActions(run) {
  // « Pioche 2 » avec une seule bille disponible : 1 déclenchement, 1 bille.
  const drawing = fabricated({ digger: { apex: [{ action: "draw", amount: 2 }] } });
  const dig = playState({ bag: ["clay"], triangle: { leftBase: null, rightBase: null, apex: placed("digger") } }, drawing);
  const dug = added(dig, drawing.reduce(dig, { type: "resolve" }).state);
  run.same("actions : Pioche 2, une seule bille, 1 déclenchement et 1 bille", { draw: 1, drawQuantity: 1, drawnMarbles: 1 }, { draw: dug.draw, drawQuantity: dug.drawQuantity, drawnMarbles: dug.drawnMarbles });
  // La pioche du tour n'est pas une Pioche : billes piochées, pas d'action.
  const turnDraw = playState({ stage: "draw", bag: ["clay"] });
  run.same("actions : la pioche du tour, sans Pioche", { drawnMarbles: 1 }, added(turnDraw, rules.reduce(turnDraw, { type: "draw" }).state));

  // Polissage 2 sur une bille à 1 : 1 point rendu.
  const polishing = fabricated({ shiner: { apex: [{ action: "polish", amount: 2 }], maxWear: 3 } });
  const shine = playState({ triangle: { leftBase: null, rightBase: null, apex: placed("shiner", 1) } }, polishing);
  const shone = added(shine, polishing.reduce(shine, { type: "resolve" }).state);
  run.same("actions : Polissage 2 sur une usure de 1, 1 point rendu", { polish: 1, polishQuantity: 1 }, { polish: shone.polish, polishQuantity: shone.polishQuantity });

  // Fêlure 3 de la plombée sur une porcelaine à 1 sur 2 : 1 point ajouté, retirée.
  const cracking = playState({ hand: inHand(["leaded"]), triangle: { leftBase: null, rightBase: null, apex: placed("porcelain", 1) } });
  run.same(
    "actions : Fêlure 3 sur une usure de 1 sur 2, 1 point ajouté ; usée, sans Tic ni éjection",
    { flick: 1, crack: 1, crackQuantity: 1, final: 1, thrownMarbles: 1, wornMarbles: 1, triangleExits: 1, speedGains: 1, speedGained: 4 },
    added(cracking, rules.reduce(cracking, { type: "place", handIndex: 0, slot: "apex" }).state)
  );
  // Sur un emplacement vide : un déclenchement, aucune usure (une Fêlure de base
  // fabriquée).
  const cracker = fabricated({ cracker: { base: [{ action: "crack", amount: 1, target: "apex" }] } });
  const empty = playState({ triangle: { leftBase: placed("cracker"), rightBase: null, apex: null } }, cracker);
  const missed = added(empty, cracker.reduce(empty, { type: "resolve" }).state);
  run.same("actions : Fêlure sur un emplacement vide, 1 déclenchement, 0 point", { crack: 1, crackQuantity: undefined }, { crack: missed.crack, crackQuantity: missed.crackQuantity });
}

// Vitesse et Masse : gains et pertes séparés, occurrences et totaux ; un bonus reçu
// compte chez qui le reçoit, un bonus perdu jamais.
function checkStats(run) {
  const tiger = playState({ triangle: { leftBase: placed("clay"), rightBase: placed("agate"), apex: placed("tiger") } });
  const stats = added(tiger, rules.reduce(tiger, { type: "resolve" }).state);
  run.same(
    "Vitesse et Masse : l'argile +1, l'agate Masse +1, la tigrée −1",
    { speedGains: 1, speedGained: 1, speedLosses: 1, speedLost: 1, massGains: 1, massGained: 1 },
    Object.fromEntries(Object.entries(stats).filter(([id]) => /^(speed|mass)/.test(id)))
  );
  const giving = fabricated({ giver: { base: [{ action: "speed", amount: 4, target: "apex" }], apex: [] }, lost: { hit: [{ action: "speed", amount: 4, target: "apex" }], apex: [] } });
  const received = playState({ triangle: { leftBase: placed("giver"), rightBase: null, apex: placed("clay") } }, giving);
  const receivedAdded = added(received, giving.reduce(received, { type: "resolve" }).state);
  run.same("Vitesse et Masse : le bonus reçu compte chez qui le reçoit (4 + 4)", { speedGains: 1, speedGained: 8 }, { speedGains: receivedAdded.speedGains, speedGained: receivedAdded.speedGained });
  const losing = playState({ hand: inHand(["lost"]), triangle: { leftBase: placed("clay"), rightBase: null, apex: null } }, giving);
  const lostAdded = added(losing, giving.reduce(losing, { type: "place", handIndex: 0, slot: "leftBase" }).state);
  run("Vitesse et Masse : un bonus perdu (pointe vide) ne compte pas", undefined, lostAdded.speedGained);
}

// Les évènements réels, et l'égalité des sorties du triangle avec les billes usées,
// éjectées et mises en poche depuis le triangle, sur des parties entières.
function checkEvents(run) {
  const shuffle = playState({ stage: "draw", bag: [], discard: ["clay"] });
  run.same("évènements : un mélange sans bille active, une bille piochée", { shuffles: 1, drawnMarbles: 1 }, added(shuffle, rules.reduce(shuffle, { type: "draw" }).state));
  let random = 3;
  const mismatches = [];
  let pocketedFromTriangle = 0;
  for (let seed = 1; seed <= 30; seed++) {
    let state = rules.createGame(seed);
    // Les mises en poche depuis le triangle, comptées dans le journal (aucune valeur
    // de partie ne les isole).
    let fromTriangle = 0;
    while (state.stage !== "over") {
      const actions = legalActions(state);
      const draw = nextRandom(random);
      random = draw.state;
      const result = rules.reduce(state, actions[Math.floor(draw.value * actions.length)]);
      fromTriangle += result.events.filter((event) => event.type === "removed" && event.cause === "pocket").length;
      state = result.state;
      const { triangleExits, wornMarbles, ejectedMarbles } = state.tally;
      if (triangleExits.game !== wornMarbles.game + ejectedMarbles.game + fromTriangle) mismatches.push(seed);
    }
    pocketedFromTriangle += fromTriangle;
  }
  run.same("évènements : billes sorties du triangle = billes usées + éjectées + mises en poche depuis le triangle", [], mismatches);
  run("évènements : des mises en poche depuis le triangle rencontrées", true, pocketedFromTriangle > 0);

  // Le pot : mises en poche, pertes, et Empocher, déclenchements et billes déplacées.
  const gorilla = playState({ hand: inHand(["gorilla", "porcelain"]), triangle: { leftBase: null, rightBase: null, apex: placed("clay") } });
  run.same(
    "pot : une mise en poche, son entrée, Empocher et sa bille déplacée",
    { pocketedMarbles: 1, pocketEntry: 1, pocket: 1, pocketQuantity: 1 },
    pick(added(gorilla, rules.reduce(gorilla, { type: "place", handIndex: 0, slot: "apex" }).state), ["pocketedMarbles", "pocketEntry", "pocket", "pocketQuantity", "lostMarbles"])
  );
  const full = { ...gorilla, pot: ["clay", "glass", "mica"] };
  run.same(
    "pot plein : une bille perdue, pas d'entrée, une bille déplacée quand même",
    { lostMarbles: 1, pocket: 1, pocketQuantity: 1 },
    pick(added(full, rules.reduce(full, { type: "place", handIndex: 0, slot: "apex" }).state), ["pocketedMarbles", "pocketEntry", "pocket", "pocketQuantity", "lostMarbles"])
  );
  // Sans effet d'entrée (l'argile) : la mise en poche compte, pas l'entrée.
  const plainEntry = playState({ hand: inHand(["gorilla", "clay"]), triangle: { leftBase: null, rightBase: null, apex: placed("clay") } });
  run.same(
    "pot : une bille sans effet d'entrée, pas d'entrée comptée",
    { pocketedMarbles: 1, pocket: 1, pocketQuantity: 1 },
    pick(added(plainEntry, rules.reduce(plainEntry, { type: "place", handIndex: 0, slot: "apex" }).state), ["pocketedMarbles", "pocketEntry", "pocket", "pocketQuantity"])
  );
  // À chaque résolution : seulement les billes du pot qui ont cet effet.
  const resolving = playState({ triangle: { leftBase: placed("clay"), rightBase: null, apex: null }, pot: ["agate", "glass", "sulphide"] });
  run("pot : à chaque résolution, l'agate et le sulfure, pas le verre", 2, added(resolving, rules.reduce(resolving, { type: "resolve" }).state).pocketResolution);
}

// Les portées : remise à zéro au début du tour, avant la pioche ; un refus ne compte
// rien ; le registre traverse une sérialisation.
function checkScopes(run) {
  const state = playState({ hand: inHand(["clay", "clay"]), tally: { flick: { turn: 1, game: 4 } } });
  const placedClay = rules.reduce(state, { type: "place", handIndex: 0, slot: "apex" });
  run.same("portées : la Chiquenaude de l'argile, dans les deux portées", { turn: 2, game: 5 }, placedClay.state.tally.flick);
  const refused = rules.reduce({ ...placedClay.state, throwsUsed: placedClay.state.throwsPerTurn }, { type: "place", handIndex: 0, slot: "leftBase" });
  run("portées : un lancer refusé ne compte pas", placedClay.state.tally, refused.state.tally);
  const drawing = rules.reduce({ ...placedClay.state, stage: "draw", bag: ["agate"] }, { type: "draw" });
  run("portées : la remise à zéro ouvre la pioche du tour", "turnStarted", drawing.events[0].type);
  run.same("portées : au tour suivant, « ce tour » à zéro, « cette partie » gardée", { turn: 0, game: 5 }, drawing.state.tally.flick);
  run.same("portées : la pioche du tour compte dans le nouveau tour", { turn: 1, game: 1 }, drawing.state.tally.drawnMarbles);

  const restored = JSON.parse(JSON.stringify(placedClay.state));
  run.same("sérialisation : le registre fait l'aller-retour", placedClay.state.tally, restored.tally);
  run(
    "sérialisation : la partie reprend à l'identique",
    JSON.stringify(rules.reduce(placedClay.state, { type: "resolve" })),
    JSON.stringify(rules.reduce(restored, { type: "resolve" }))
  );
  run.same("sérialisation : une partie neuve porte le registre à zéro", emptyTally(TALLY_COUNTERS), rules.createGame(1).tally);
}

// La loupe et le verre, avec la nouvelle règle.
function checkTestMarbles(run) {
  // La loupe : sa Chiquenaude se compte elle-même ; celle de la tigrée (sans
  // Chiquenaude) ne compte pas, celle de l'argile si.
  const state = playState({ hand: inHand(["magnifier", "tiger", "magnifier", "clay", "magnifier"]) });
  const first = rules.reduce(state, { type: "place", handIndex: 0, slot: "leftBase" });
  run.same("loupe : la première chiquenaude du tour lit 1, Vitesse +2", [{ marble: "magnifier", speedDelta: 2 }], effectsOf(first.events, "flick"));
  const tiger = rules.reduce(first.state, { type: "place", handIndex: 0, slot: "rightBase" });
  run("loupe : la tigrée lancée ne compte pas comme chiquenaude", 1, tiger.state.tally.flick.turn);
  const second = rules.reduce(tiger.state, { type: "place", handIndex: 0, slot: "apex" });
  run.same("loupe : la deuxième lit 2, Vitesse +4", [{ marble: "magnifier", speedDelta: 4 }], effectsOf(second.events, "flick"));
  const clay = rules.reduce(second.state, { type: "place", handIndex: 0, slot: "apex" });
  const fourth = rules.reduce(clay.state, { type: "place", handIndex: 0, slot: "leftBase" });
  run.same("loupe : la quatrième lirait 4, plafonnée à +6", [{ marble: "magnifier", speedDelta: 6 }], effectsOf(fourth.events, "flick"));

  // Le verre : les Trouvailles déclenchées, pas les mélanges.
  const glass = (over) => effectsOf(rules.reduce(playState({ triangle: { leftBase: null, rightBase: null, apex: placed("glass") }, ...over }), { type: "resolve" }).events, "phase");
  run.same("verre : 2 trouvailles, Vitesse +2", [{ marble: "glass", speedDelta: 2 }], glass({ tally: { windfall: 2 } }));
  run.same("verre : des mélanges seuls n'y font rien", [{ marble: "glass", speedDelta: 0 }], glass({ tally: { shuffles: 5 } }));
  run.same("verre : plafonné à +10", [{ marble: "glass", speedDelta: 10 }], glass({ tally: { windfall: 15 } }));
  // Un mélange pendant la résolution, avant la pointe : la Pioche du mica en base
  // gauche, la tigrée en base droite trouve, le verre la compte.
  const midResolution = (rightBase) =>
    effectsOf(rules.reduce(playState({ bag: [], discard: ["clay"], triangle: { leftBase: placed("mica"), rightBase, apex: placed("glass") } }), { type: "resolve" }).events, "phase").at(-1);
  run.same("verre : une Trouvaille pendant la résolution, avant sa phase", { marble: "glass", speedDelta: 1 }, midResolution(placed("tiger")));
  run.same("verre : un mélange sans Trouvaille, rien", { marble: "glass", speedDelta: 0 }, midResolution(placed("clay")));
  run("vérification du calibre des billes du test", true, MARBLE_TYPES.magnifier.size === SMALL && MARBLE_TYPES.glass.size === MEDIUM && MARBLE_TYPES.gorilla.size === LARGE);
}
