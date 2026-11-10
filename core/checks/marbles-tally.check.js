// Vérifications du core — domaine « marbles-tally ». Les valeurs de partie du jeu
// des billes (core/marbles-tally.js) : la validation des déclarations, le registre
// (augmentation, filtres, remises à zéro selon la portée, lecture publique), puis
// son branchement dans le réducteur (compté à l'émission, avant les réactions des
// billes ; sérialisé avec l'état) et les deux sources de montant qu'il nourrit, la
// loupe et le verre. Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js marbles-tally`).

import { throws } from "../../lib/check.js";
import { MARBLE_TALLIES, MEDIUM, SMALL } from "../../config/marbles-values.js";
import { JOURNAL_EVENTS, legalActions } from "../marbles.js";
import { nextRandom } from "../rng.js";
import { emptyTally, recordTally, tallyValue, validateTallies } from "../marbles-tally.js";
import MARBLE_TYPES from "../../marbles/types/index.js";
import { createMarblesRules } from "../marbles-rules.js";
import { emptyBagMarblesGame, inHand } from "./helpers.js";

// Les règles du jeu, liées à la vraie table (core/marbles-rules.js).
const rules = createMarblesRules(MARBLE_TYPES);

const placed = (marble, wear = 0) => ({ marble, wear });

function playState(over = {}) {
  return { ...emptyBagMarblesGame(rules, 1), turn: 2, stage: "play", ...over, tally: { ...emptyTally(), ...over.tally } };
}

// Les effets d'un déclencheur dans un journal, réduits à leur bille et leur Vitesse.
const effectsOf = (events, trigger) => events.filter((event) => event.type === "effect" && event.trigger === trigger).map(({ marble, speedDelta }) => ({ marble, speedDelta }));

export default function checkMarblesTally(run) {
  checkDeclarations(run);
  checkRegistry(run);
  checkFlicks(run);
  checkWindfalls(run);
  checkSerialization(run);
}

// La forme d'une déclaration : tout ce qui manque ou se trompe échoue au chargement.
function checkDeclarations(run) {
  const texts = { name: "a.name", source: "a.source" };
  const valid = { id: "a", scope: "turn", events: ["flick"], texts };
  const refused = (tallies) => throws(() => validateTallies(tallies, JOURNAL_EVENTS));
  run("déclaration : la vraie liste est valide", false, refused(MARBLE_TALLIES));
  run("déclaration : une liste fabriquée valide", false, refused([valid, { ...valid, id: "b", scope: "game", filter: { type: "size", size: SMALL }, events: ["placed", "hit"] }]));
  run("déclaration : portée inconnue refusée", true, refused([{ ...valid, scope: "forever" }]));
  run("déclaration : évènement inconnu refusé", true, refused([{ ...valid, events: ["flicked"] }]));
  run("déclaration : aucun évènement refusé", true, refused([{ ...valid, events: [] }]));
  run("déclaration : identifiant en double refusé", true, refused([valid, valid]));
  run("déclaration : champ inconnu refusé", true, refused([{ ...valid, per: 2 }]));
  run("déclaration : texte manquant refusé", true, refused([{ ...valid, texts: { name: "a.name" } }]));
  run("déclaration : filtre inconnu refusé", true, refused([{ ...valid, filter: { type: "color" } }]));
  run("déclaration : calibre inconnu refusé", true, refused([{ ...valid, filter: { type: "size", size: 9 } }]));
  // La pioche de la prévision cache sa bille : un filtre ne peut pas la lire.
  run("déclaration : filtre sur la pioche refusé", true, refused([{ ...valid, events: ["draw"], filter: { type: "size", size: SMALL } }]));
  run("déclaration : chaque compteur a son évènement", true, MARBLE_TALLIES.every((tally) => tally.events.every((event) => Object.hasOwn(JOURNAL_EVENTS, event))));

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

// Le registre seul, sur des listes fabriquées.
function checkRegistry(run) {
  const turnFlicks = { id: "turnFlicks", scope: "turn", events: ["flick"], texts: {} };
  const gameFlicks = { id: "gameFlicks", scope: "game", events: ["flick"], texts: {} };
  const smallPlaced = { id: "smallPlaced", scope: "game", events: ["placed", "hit"], filter: { type: "size", size: SMALL }, texts: {} };
  const tallies = [turnFlicks, gameFlicks, smallPlaced];
  const record = (tally, event) => recordTally(tally, event, MARBLE_TYPES, tallies);

  const empty = emptyTally(tallies);
  run.same("registre : une partie neuve, tout à zéro", { turnFlicks: 0, gameFlicks: 0, smallPlaced: 0 }, empty);
  run.same("registre : les vrais compteurs", { flicksThisTurn: 0, windfallsThisGame: 0 }, emptyTally());
  run.same("registre : la partie neuve les porte", emptyTally(), rules.createGame(1).tally);

  const flicked = record(record(empty, { type: "flick", slot: "apex", marble: "clay" }), { type: "flick", slot: "apex", marble: "clay" });
  run.same("registre : chaque évènement compté compte 1", { turnFlicks: 2, gameFlicks: 2, smallPlaced: 0 }, flicked);
  run("registre : un évènement sans compteur rend le même registre", flicked, record(flicked, { type: "swapped", a: "apex", b: "leftBase" }));
  run.same("registre : rien n'est modifié en place", { turnFlicks: 0, gameFlicks: 0, smallPlaced: 0 }, empty);
  run.same(
    "registre : au début d'un tour, la portée « ce tour » revient à zéro, pas « cette partie »",
    { turnFlicks: 0, gameFlicks: 2, smallPlaced: 0 },
    record(flicked, { type: "turnStarted", turn: 3, turnCount: 9 })
  );
  // Le filtre : la loupe est une minibille, le verre une normale.
  const sized = [
    { type: "placed", slot: "apex", marble: "magnifier" },
    { type: "hit", slot: "apex", marble: "magnifier", replacement: null },
    { type: "placed", slot: "apex", marble: "glass" },
  ].reduce(record, empty);
  run("registre : le filtre de calibre ne compte que les minibilles", 2, sized.smallPlaced);
  run("registre : vérification du calibre des billes du test", true, MARBLE_TYPES.magnifier.size === SMALL && MARBLE_TYPES.glass.size === MEDIUM);

  run("lecture : la valeur d'un compteur", 2, tallyValue(flicked, "gameFlicks"));
  run("lecture : un compteur inconnu lève", true, throws(() => tallyValue(flicked, "nope")));
}

// « Par chiquenaude ce tour » : compté à l'émission, avant la réaction de la bille,
// qui se compte donc elle-même.
function checkFlicks(run) {
  const state = playState({ hand: inHand(["magnifier", "magnifier", "magnifier", "magnifier", "clay"]) });
  const first = rules.reduce(state, { type: "place", handIndex: 0, slot: "leftBase" });
  run.same("chiquenaudes : la première du tour de la loupe lit 1, Vitesse +2", [{ marble: "magnifier", speedDelta: 2 }], effectsOf(first.events, "flick"));
  run("chiquenaudes : comptée", 1, first.state.tally.flicksThisTurn);
  const second = rules.reduce(first.state, { type: "place", handIndex: 0, slot: "rightBase" });
  run.same("chiquenaudes : la deuxième lit 2, Vitesse +4", [{ marble: "magnifier", speedDelta: 4 }], effectsOf(second.events, "flick"));
  // Une Chiquenaude sans effet compte aussi : l'argile.
  const clay = rules.reduce(second.state, { type: "place", handIndex: 2, slot: "apex" });
  run("chiquenaudes : celle d'une bille sans effet de chiquenaude compte aussi", 3, clay.state.tally.flicksThisTurn);
  const fourth = rules.reduce(clay.state, { type: "place", handIndex: 0, slot: "apex" });
  run.same("chiquenaudes : la quatrième lirait 4, plafonnée à +6", [{ marble: "magnifier", speedDelta: 6 }], effectsOf(fourth.events, "flick"));
  run("chiquenaudes : la Vitesse du tour les cumule", 2 + 4 + 6, fourth.state.speed);

  // Un refus ne compte rien : l'état d'avant, registre compris.
  const refused = rules.reduce({ ...fourth.state, throwsUsed: fourth.state.throwsPerTurn }, { type: "place", handIndex: 0, slot: "apex" });
  run("chiquenaudes : un lancer refusé ne compte pas", 4, refused.state.tally.flicksThisTurn);

  // Fin du tour : la résolution garde le compte, le début du tour suivant l'efface,
  // avant sa pioche (turnStarted est le premier évènement de la pioche du tour).
  const resolved = rules.reduce(fourth.state, { type: "resolve" });
  const nextTurn = resolved.state.stage === "draw" ? rules.reduce(resolved.state, { type: "draw" }) : resolved;
  run("chiquenaudes : la portée « ce tour », à zéro au tour suivant", 0, nextTurn.state.tally.flicksThisTurn);
  const drawing = rules.reduce({ ...fourth.state, stage: "draw" }, { type: "draw" });
  run("chiquenaudes : la remise à zéro ouvre la pioche du tour", "turnStarted", drawing.events[0].type);
  run("chiquenaudes : après la pioche du tour, zéro", 0, drawing.state.tally.flicksThisTurn);
}

// « Par trouvaille cette partie » : chaque régénération du sac depuis la défausse,
// qu'une bille active ait une Trouvaille ou non ; jamais remis à zéro en cours de
// partie.
function checkWindfalls(run) {
  // Début de tour, triangle vide : aucune bille n'a de Trouvaille.
  const turnStart = rules.reduce(playState({ stage: "draw", bag: [], discard: ["clay"] }), { type: "draw" });
  run("trouvailles : une régénération sans bille active compte", 1, turnStart.state.tally.windfallsThisGame);
  run("trouvailles : aucun effet de Trouvaille", 0, effectsOf(turnStart.events, "windfall").length);
  const later = rules.reduce({ ...turnStart.state, stage: "draw", bag: [], discard: ["clay"], hand: inHand([]) }, { type: "draw" });
  run("trouvailles : la portée « cette partie » ne revient pas à zéro au tour suivant", 2, later.state.tally.windfallsThisGame);

  // Le verre à la pointe lit le registre à sa phase.
  const glass = (windfalls) =>
    effectsOf(rules.reduce(playState({ triangle: { leftBase: null, rightBase: null, apex: placed("glass") }, tally: { windfallsThisGame: windfalls } }), { type: "resolve" }).events, "phase");
  run.same("trouvailles : le verre, 2 trouvailles, Vitesse +2", [{ marble: "glass", speedDelta: 2 }], glass(2));
  run.same("trouvailles : le verre, aucune, Vitesse 0", [{ marble: "glass", speedDelta: 0 }], glass(0));
  run.same("trouvailles : le verre, plafonné à +10", [{ marble: "glass", speedDelta: 10 }], glass(15));
  // Une régénération pendant la résolution, avant sa phase : la Pioche du mica en
  // base gauche régénère, le verre à la pointe la compte.
  const midResolution = rules.reduce(
    playState({ bag: [], discard: ["clay"], triangle: { leftBase: placed("mica"), rightBase: null, apex: placed("glass") }, tally: { windfallsThisGame: 1 } }),
    { type: "resolve" }
  );
  run.same("trouvailles : comptée dès la régénération, avant la phase du verre", { marble: "glass", speedDelta: 2 }, effectsOf(midResolution.events, "phase").at(-1));
  run("trouvailles : le registre après la résolution", 2, midResolution.state.tally.windfallsThisGame);
}

// Le registre est dans l'état : il traverse une sérialisation, et la partie reprend
// à l'identique.
function checkSerialization(run) {
  const state = playState({ hand: inHand(["magnifier", "clay"]), bag: [], discard: ["agate"], tally: { windfallsThisGame: 3 } });
  const played = rules.reduce(state, { type: "place", handIndex: 0, slot: "apex" }).state;
  const restored = JSON.parse(JSON.stringify(played));
  run.same("sérialisation : le registre fait l'aller-retour", played.tally, restored.tally);
  run(
    "sérialisation : la partie reprend à l'identique",
    JSON.stringify(rules.reduce(played, { type: "resolve" })),
    JSON.stringify(rules.reduce(restored, { type: "resolve" }))
  );
}
