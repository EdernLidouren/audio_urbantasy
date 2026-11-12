// Vérifications du core — domaine « marbles-tally ». Les valeurs de partie du jeu
// des billes : le registre (marbles/core/tally.js), la génération et la déclaration
// des compteurs (marbles/core/counters.js), puis leur branchement dans le réducteur :
// la règle des mots-clés (un champ, ou un effet reçu), les actions mots-clés et leurs
// quantités réelles, Vitesse et Masse, les évènements réels, les deux portées, la
// sérialisation, et les montants calculés qui les lisent (tally_flick et hit_polish).
// Sur la table de billes des vérifications (marbles/checks/fixtures/marbles.js). Lancées
// par core/checks/index.js/runChecks (`node tools/run-checks.js marbles-tally`).

import { throws } from "../../lib/check.js";
import { MARBLE_TALLIES, MARBLE_TRIGGERS, SMALL } from "../config/values.js";
import { JOURNAL_EVENTS, TALLY_COUNTERS } from "../core/content.js";
import { CLAUSE_ACTIONS } from "../core/effects.js";
import { TALLY_CATEGORIES, buildTallyCounters, validateEventTallies } from "../core/counters.js";
import { emptyTally, recordTally, tallyValue } from "../core/tally.js";
import { CHOICELESS_TYPES, FIXTURE_TYPES, fixtureRules } from "./fixtures/marbles.js";
import { createPicker, inHand, marblesPlayState, placed, playLegalGame, withSizes } from "./helpers.js";

// Les règles de la table des vérifications (marbles/checks/fixtures/marbles.js), et des
// règles fabriquées : cette table complétée de billes propres à un cas.
const rules = fixtureRules();
// La même table sans cible au choix ni Éjecter : ces cas portent sur Empocher depuis
// la main et sur la Fêlure.
const fixedRules = fixtureRules(CHOICELESS_TYPES);
const fabricated = (table) => fixtureRules({ ...FIXTURE_TYPES, ...withSizes(table) });

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
  return marblesPlayState(marbles, { ...over, tally: tallyOf(over.tally) });
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
  run.section("registre", checkRegistry);
  run.section("génération", checkGeneration);
  run.section("déclarations", checkDeclarations);
  run.section("mots-clés", checkKeywords);
  run.section("actions", checkActions);
  run.section("Vitesse et Masse", checkStats);
  run.section("évènements", checkEvents);
  run.section("portées", checkScopes);
  run.section("montants qui lisent les valeurs", checkTallyAmounts);
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
    ["draw", "drawQuantity", "polish", "polishQuantity", "crack", "crackQuantity", "pocket", "pocketQuantity", "eject", "ejectQuantity", "discard", "discardQuantity", "bounce", "bounceQuantity", "retrieve", "retrieveQuantity"],
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
  const draws = createPicker(7);
  for (let seed = 1; seed <= 40; seed++) {
    playLegalGame(rules, rules.createGame(seed), draws, (result) => {
      for (const event of result.events) emitted.add(event.type);
    });
  }
  run.same("déclaration : chaque évènement émis est dans JOURNAL_EVENTS", [], [...emitted].filter((type) => !Object.hasOwn(JOURNAL_EVENTS, type)));
}

// La règle des mots-clés de déclenchement.
function checkKeywords(run) {
  // Un champ vide sans effet extérieur ne compte pas ; l'évènement réel, si.
  const allRounder = playState({ hand: inHand(["all_rounder"]) });
  const thrown = rules.reduce(allRounder, { type: "place", handIndex: 0, slot: "apex" });
  run.same("mots-clés : all_rounder, sans Chiquenaude, ne compte que comme bille lancée", { thrownMarbles: 1 }, added(allRounder, thrown.state));

  // Un effet à condition fausse compte : le Tic de hit_pocket sur une one_shot (pas plus
  // petite) ne produit rien, mais le champ existe. Son Empocher trouve la main vide :
  // un déclenchement, aucune bille déplacée.
  const hitPocket = playState({ hand: inHand(["hit_pocket"]), triangle: { leftBase: null, rightBase: null, apex: placed("one_shot") } });
  const hit = rules.reduce(hitPocket, { type: "place", handIndex: 0, slot: "apex" });
  run.same("mots-clés : le Tic à condition fausse ne produit rien", [{ marble: "hit_pocket", speedDelta: 0 }], effectsOf(hit.events, "hit"));
  run.same(
    "mots-clés : mais compte, comme ses évènements ; one_shot sans Éjection : +1 bille éjectée, +0 éjection",
    { hit: 1, thrownMarbles: 1, hitMarbles: 1, ejectedMarbles: 1, triangleExits: 1, discardedMarbles: 1, pocket: 1 },
    added(hitPocket, hit.state)
  );
  // Une occupante qui a une Éjection : +1 éjection, aussi.
  const knocked = playState({ hand: inHand(["all_rounder"]), triangle: { leftBase: null, rightBase: null, apex: placed("hit_pocket") } });
  run("mots-clés : l'Éjection de hit_pocket compte", 1, added(knocked, rules.reduce(knocked, { type: "place", handIndex: 0, slot: "apex" }).state).knockout);

  // Les phases : chaque base, les deux bases, la pointe. hit_pocket n'a pas d'effet de
  // base : sa phase ne compte pas ; un emplacement vide saute sa phase.
  const phases = playState({ triangle: { leftBase: placed("aging_flick"), rightBase: placed("hit_pocket"), apex: null } });
  run.same(
    "mots-clés : base gauche comptée, base droite au champ vide non, pointe vide sautée",
    { base: 1, leftBase: 1, speedGains: 1, speedGained: 1 },
    added(phases, rules.reduce(phases, { type: "resolve" }).state)
  );
  const both = playState({ triangle: { leftBase: placed("aging_flick"), rightBase: placed("all_rounder"), apex: placed("one_shot") } });
  // all_rounder d'avant Éjecter : sa base donne Vitesse +3, sans choix à trancher.
  const bothAdded = added(both, fixedRules.reduce(both, { type: "resolve" }).state);
  run.same("mots-clés : bases = bases gauches + bases droites", { apex: 1, base: 2, leftBase: 1, rightBase: 1 }, { apex: bothAdded.apex, base: bothAdded.base, leftBase: bothAdded.leftBase, rightBase: bothAdded.rightBase });
  // Une variante de base est l'effet de base de son emplacement.
  const variant = playState({ triangle: { leftBase: null, rightBase: placed("split_base"), apex: null } });
  run("mots-clés : la variante de base droite de split_base compte", 1, added(variant, rules.reduce(variant, { type: "resolve" }).state).rightBase);

  // Un champ de pointe vide qui reçoit un bonus ciblé compte (un effet extérieur).
  const giving = fabricated({ blank: { apex: [] }, giver: { base: [{ action: "speed", amount: 2, target: "apex" }], apex: [] } });
  const bonus = playState({ triangle: { leftBase: placed("giver"), rightBase: null, apex: placed("blank") } }, giving);
  const bonusAdded = added(bonus, giving.reduce(bonus, { type: "resolve" }).state);
  run("mots-clés : une pointe au champ vide qui reçoit un bonus compte", 1, bonusAdded.apex);
  const alone = playState({ triangle: { leftBase: null, rightBase: null, apex: placed("blank") } }, giving);
  run("mots-clés : sans bonus, la même ne compte pas", undefined, added(alone, giving.reduce(alone, { type: "resolve" }).state).apex);

  // Plusieurs billes au même moment comptent chacune : un mélange, trois
  // Trouvailles (all_rounder, final_pocket, base_pocket), pas hit_polish qui n'en a pas.
  const windfalls = playState({ stage: "draw", bag: [], discard: ["aging_flick"], triangle: { leftBase: placed("all_rounder"), rightBase: placed("final_pocket"), apex: placed("base_pocket") } });
  const regenerated = added(windfalls, rules.reduce(windfalls, { type: "draw" }).state);
  run.same("mots-clés : trois Trouvailles pour un mélange", { windfall: 3, shuffles: 1 }, { windfall: regenerated.windfall, shuffles: regenerated.shuffles });
}

// Les actions mots-clés : déclenchements et quantités réelles, après plancher ou
// plafond.
function checkActions(run) {
  // « Pioche 2 » avec une seule bille disponible : 1 déclenchement, 1 bille.
  const drawing = fabricated({ digger: { apex: [{ action: "draw", amount: 2 }] } });
  const dig = playState({ bag: ["aging_flick"], triangle: { leftBase: null, rightBase: null, apex: placed("digger") } }, drawing);
  const dug = added(dig, drawing.reduce(dig, { type: "resolve" }).state);
  run.same("actions : Pioche 2, une seule bille, 1 déclenchement et 1 bille", { draw: 1, drawQuantity: 1, drawnMarbles: 1 }, { draw: dug.draw, drawQuantity: dug.drawQuantity, drawnMarbles: dug.drawnMarbles });
  // La pioche du tour n'est pas une Pioche : billes piochées, pas d'action.
  const turnDraw = playState({ stage: "draw", bag: ["aging_flick"] });
  run.same("actions : la pioche du tour, sans Pioche", { drawnMarbles: 1 }, added(turnDraw, rules.reduce(turnDraw, { type: "draw" }).state));

  // Polissage 2 sur une bille à 1 : 1 point rendu.
  const polishing = fabricated({ shiner: { apex: [{ action: "polish", amount: 2 }], maxWear: 3 } });
  const shine = playState({ triangle: { leftBase: null, rightBase: null, apex: placed("shiner", 1) } }, polishing);
  const shone = added(shine, polishing.reduce(shine, { type: "resolve" }).state);
  run.same("actions : Polissage 2 sur une usure de 1, 1 point rendu", { polish: 1, polishQuantity: 1 }, { polish: shone.polish, polishQuantity: shone.polishQuantity });

  // Fêlure 3 de flick_strike sur une fragile à 1 sur 2 : 1 point ajouté, retirée.
  const cracking = playState({ hand: inHand(["flick_strike"]), triangle: { leftBase: null, rightBase: null, apex: placed("fragile", 1) } });
  run.same(
    "actions : Fêlure 3 sur une usure de 1 sur 2, 1 point ajouté ; usée, sans Tic ni éjection",
    { flick: 1, crack: 1, crackQuantity: 1, final: 1, thrownMarbles: 1, wornMarbles: 1, triangleExits: 1, discardedMarbles: 1, speedGains: 1, speedGained: 4 },
    added(cracking, fixedRules.reduce(cracking, { type: "place", handIndex: 0, slot: "apex" }).state)
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
  const allRounder = playState({ triangle: { leftBase: placed("aging_flick"), rightBase: placed("final_pocket"), apex: placed("all_rounder") } });
  const stats = added(allRounder, rules.reduce(allRounder, { type: "resolve" }).state);
  run.same(
    "Vitesse et Masse : aging_flick +1, final_pocket Masse +1, all_rounder −1",
    { speedGains: 1, speedGained: 1, speedLosses: 1, speedLost: 1, massGains: 1, massGained: 1 },
    Object.fromEntries(Object.entries(stats).filter(([id]) => /^(speed|mass)/.test(id)))
  );
  const giving = fabricated({ giver: { base: [{ action: "speed", amount: 4, target: "apex" }], apex: [] }, lost: { hit: [{ action: "speed", amount: 4, target: "apex" }], apex: [] } });
  const received = playState({ triangle: { leftBase: placed("giver"), rightBase: null, apex: placed("aging_flick") } }, giving);
  const receivedAdded = added(received, giving.reduce(received, { type: "resolve" }).state);
  run.same("Vitesse et Masse : le bonus reçu compte chez qui le reçoit (4 + 4)", { speedGains: 1, speedGained: 8 }, { speedGains: receivedAdded.speedGains, speedGained: receivedAdded.speedGained });
  const losing = playState({ hand: inHand(["lost"]), triangle: { leftBase: placed("aging_flick"), rightBase: null, apex: null } }, giving);
  const lostAdded = added(losing, giving.reduce(losing, { type: "place", handIndex: 0, slot: "leftBase" }).state);
  run("Vitesse et Masse : un bonus perdu (pointe vide) ne compte pas", undefined, lostAdded.speedGained);
}

// Les évènements réels, et l'égalité des sorties du triangle avec les billes usées,
// éjectées et mises en poche depuis le triangle, sur des parties entières.
function checkEvents(run) {
  const shuffle = playState({ stage: "draw", bag: [], discard: ["aging_flick"] });
  run.same("évènements : un mélange sans bille active, une bille piochée", { shuffles: 1, drawnMarbles: 1 }, added(shuffle, rules.reduce(shuffle, { type: "draw" }).state));
  const draws = createPicker(3);
  const mismatches = [];
  let pocketedFromTriangle = 0;
  for (let seed = 1; seed <= 30; seed++) {
    // Les mises en poche depuis le triangle, comptées dans le journal (aucune valeur
    // de partie ne les isole).
    let fromTriangle = 0;
    playLegalGame(rules, rules.createGame(seed), draws, (result) => {
      fromTriangle += result.events.filter((event) => event.type === "removed" && event.cause === "pocket").length;
      const { triangleExits, wornMarbles, ejectedMarbles } = result.state.tally;
      if (triangleExits.game !== wornMarbles.game + ejectedMarbles.game + fromTriangle) mismatches.push(seed);
    });
    pocketedFromTriangle += fromTriangle;
  }
  run.same("évènements : billes sorties du triangle = billes usées + éjectées + mises en poche depuis le triangle", [], mismatches);
  run("évènements : des mises en poche depuis le triangle rencontrées", true, pocketedFromTriangle > 0);

  // Le pot : mises en poche, pertes, et Empocher, déclenchements et billes déplacées.
  const hitPocket = playState({ hand: inHand(["hit_pocket", "fragile"]), triangle: { leftBase: null, rightBase: null, apex: placed("aging_flick") } });
  run.same(
    "pot : une mise en poche, son entrée, Empocher et sa bille déplacée",
    { pocketedMarbles: 1, pocketEntry: 1, pocket: 1, pocketQuantity: 1 },
    pick(added(hitPocket, fixedRules.reduce(hitPocket, { type: "place", handIndex: 0, slot: "apex" }).state), ["pocketedMarbles", "pocketEntry", "pocket", "pocketQuantity", "lostMarbles"])
  );
  const full = { ...hitPocket, pot: ["aging_flick", "hit_polish", "awaken_draw"] };
  run.same(
    "pot plein : une bille perdue, pas d'entrée, une bille déplacée quand même",
    { lostMarbles: 1, pocket: 1, pocketQuantity: 1 },
    pick(added(full, fixedRules.reduce(full, { type: "place", handIndex: 0, slot: "apex" }).state), ["pocketedMarbles", "pocketEntry", "pocket", "pocketQuantity", "lostMarbles"])
  );
  // Sans effet d'entrée (aging_flick) : la mise en poche compte, pas l'entrée.
  const plainEntry = playState({ hand: inHand(["hit_pocket", "aging_flick"]), triangle: { leftBase: null, rightBase: null, apex: placed("aging_flick") } });
  run.same(
    "pot : une bille sans effet d'entrée, pas d'entrée comptée",
    { pocketedMarbles: 1, pocket: 1, pocketQuantity: 1 },
    pick(added(plainEntry, fixedRules.reduce(plainEntry, { type: "place", handIndex: 0, slot: "apex" }).state), ["pocketedMarbles", "pocketEntry", "pocket", "pocketQuantity"])
  );
  // À chaque résolution : seulement les billes du pot qui ont cet effet.
  const resolving = playState({ triangle: { leftBase: placed("aging_flick"), rightBase: null, apex: null }, pot: ["final_pocket", "hit_polish", "base_pocket"] });
  run("pot : à chaque résolution, final_pocket et base_pocket, pas hit_polish", 2, added(resolving, rules.reduce(resolving, { type: "resolve" }).state).pocketResolution);
}

// Les portées : remise à zéro au début du tour, avant la pioche ; un refus ne compte
// rien ; le registre traverse une sérialisation.
function checkScopes(run) {
  const state = playState({ hand: inHand(["aging_flick", "aging_flick"]), tally: { flick: { turn: 1, game: 4 } } });
  const placedAgingFlick = rules.reduce(state, { type: "place", handIndex: 0, slot: "apex" });
  run.same("portées : la Chiquenaude de aging_flick, dans les deux portées", { turn: 2, game: 5 }, placedAgingFlick.state.tally.flick);
  const refused = rules.reduce({ ...placedAgingFlick.state, throwsUsed: placedAgingFlick.state.throwsPerTurn }, { type: "place", handIndex: 0, slot: "leftBase" });
  run("portées : un lancer refusé ne compte pas", placedAgingFlick.state.tally, refused.state.tally);
  const drawing = rules.reduce({ ...placedAgingFlick.state, stage: "draw", bag: ["final_pocket"] }, { type: "draw" });
  run("portées : la remise à zéro ouvre la pioche du tour", "turnStarted", drawing.events[0].type);
  run.same("portées : au tour suivant, « ce tour » à zéro, « cette partie » gardée", { turn: 0, game: 5 }, drawing.state.tally.flick);
  run.same("portées : la pioche du tour compte dans le nouveau tour", { turn: 1, game: 1 }, drawing.state.tally.drawnMarbles);

  const restored = JSON.parse(JSON.stringify(placedAgingFlick.state));
  run.same("sérialisation : le registre fait l'aller-retour", placedAgingFlick.state.tally, restored.tally);
  run(
    "sérialisation : la partie reprend à l'identique",
    JSON.stringify(rules.reduce(placedAgingFlick.state, { type: "resolve" })),
    JSON.stringify(rules.reduce(restored, { type: "resolve" }))
  );
  run.same("sérialisation : une partie neuve porte le registre à zéro", emptyTally(TALLY_COUNTERS), rules.createGame(1).tally);
}

// Les montants calculés qui lisent une valeur de partie : la Chiquenaude de
// tally_flick (ce tour), la pointe de hit_polish (cette partie).
function checkTallyAmounts(run) {
  // tally_flick : sa Chiquenaude se compte elle-même ; celle de all_rounder (sans
  // Chiquenaude) ne compte pas, celle de aging_flick si.
  const state = playState({ hand: inHand(["tally_flick", "all_rounder", "tally_flick", "aging_flick", "tally_flick"]) });
  const first = rules.reduce(state, { type: "place", handIndex: 0, slot: "leftBase" });
  run.same("tally_flick : la première chiquenaude du tour lit 1, Vitesse +2", [{ marble: "tally_flick", speedDelta: 2 }], effectsOf(first.events, "flick"));
  const allRounder = rules.reduce(first.state, { type: "place", handIndex: 0, slot: "rightBase" });
  run("tally_flick : all_rounder lancée ne compte pas comme chiquenaude", 1, allRounder.state.tally.flick.turn);
  const second = rules.reduce(allRounder.state, { type: "place", handIndex: 0, slot: "apex" });
  run.same("tally_flick : la deuxième lit 2, Vitesse +4", [{ marble: "tally_flick", speedDelta: 4 }], effectsOf(second.events, "flick"));
  const agingFlick = rules.reduce(second.state, { type: "place", handIndex: 0, slot: "apex" });
  const fourth = rules.reduce(agingFlick.state, { type: "place", handIndex: 0, slot: "leftBase" });
  run.same("tally_flick : la quatrième lirait 4, plafonnée à +6", [{ marble: "tally_flick", speedDelta: 6 }], effectsOf(fourth.events, "flick"));

  // hit_polish : les Trouvailles déclenchées, pas les mélanges.
  const hitPolish = (over) => effectsOf(rules.reduce(playState({ triangle: { leftBase: null, rightBase: null, apex: placed("hit_polish") }, ...over }), { type: "resolve" }).events, "phase");
  run.same("hit_polish : 2 trouvailles, Vitesse +2", [{ marble: "hit_polish", speedDelta: 2 }], hitPolish({ tally: { windfall: 2 } }));
  run.same("hit_polish : des mélanges seuls n'y font rien", [{ marble: "hit_polish", speedDelta: 0 }], hitPolish({ tally: { shuffles: 5 } }));
  run.same("hit_polish : plafonné à +10", [{ marble: "hit_polish", speedDelta: 10 }], hitPolish({ tally: { windfall: 15 } }));
  // Un mélange pendant la résolution, avant la pointe : la Pioche de awaken_draw en base
  // gauche, all_rounder en base droite trouve, hit_polish la compte.
  // all_rounder d'avant Éjecter (sa base ne fait pas choisir).
  const midResolution = (rightBase) =>
    effectsOf(fixedRules.reduce(playState({ bag: [], discard: ["aging_flick"], triangle: { leftBase: placed("awaken_draw"), rightBase, apex: placed("hit_polish") } }), { type: "resolve" }).events, "phase").at(-1);
  run.same("hit_polish : une Trouvaille pendant la résolution, avant sa phase", { marble: "hit_polish", speedDelta: 1 }, midResolution(placed("all_rounder")));
  run.same("hit_polish : un mélange sans Trouvaille, rien", { marble: "hit_polish", speedDelta: 0 }, midResolution(placed("aging_flick")));
}
