// Vérifications du core — domaine « marbles-reactions ». Ce qui RÉAGIT sur le triangle
// et ce que le pot peut écouter bille par bille, dans le jeu des billes : les
// déclencheurs Polissage et Fêlure (toute bille active polie ou fêlée d'au moins 1,
// elle comprise ; la condition « concerned » pour la bille elle-même), leurs compteurs, leurs
// textes et la prévision ; les compteurs d'évènements par bille (billes renvoyées par
// un Rebond, éjectées par un effet, normales ou calots éjectés) et une réaction du pot
// qui les écoute ; un statut de lancer pour ce tour donné par une Chiquenaude
// (marbles/config/values.js/MARBLE_TRIGGERS et MARBLE_TALLIES, doc/marbles.md). Sur
// des billes fabriquées et les statuts de test. Lancées par
// core/checks/index.js/runChecks (`node tools/run-checks.js marbles-reactions`).

import { throws } from "../../lib/check.js";
import { MARBLE_TRIGGERS, SMALL } from "../config/values.js";
import { FIRST_IN_HAND, NEXT_SLOT, allActive, applyStatus, bounce, concerned, crack, eject, mass, pocket, polish, speed } from "../content/effects.js";
import { validateMarbleTriggers } from "../core/content.js";
import { throwsLeft } from "../core/marbles.js";
import { marbleCard } from "../view/card.js";
import { fabricatedRules, forecastMatches, inHand, keyText as t, marbleCount, marblesPlayState, mustReduce, placed, statusInstance, validateTable } from "./helpers.js";

export default function checkMarblesReactions(run) {
  run.section("Polissage", checkPolished);
  run.section("Fêlure reçue", checkCracked);
  run.section("débordement et Perte", checkOverflowLoss);
  run.section("déclaration des déclencheurs", checkDeclaration);
  run.section("compteurs par bille", checkMarbleTallies);
  run.section("lancer rendu", checkThrowBack);
}

// Les effets joués pour le déclencheur `trigger`, { marble, slot, speedDelta }.
const playedFor = (events, trigger) => events.filter((event) => event.type === "effect" && event.trigger === trigger).map(({ marble, slot, speedDelta }) => ({ marble, slot, speedDelta }));

// LE POLISSAGE : en miroir de la Fêlure, toute bille active polie d'au moins 1, elle
// comprise ; chaque bille active qui a le champ réagit ; un polissage qui ne retire
// rien ne déclenche rien. La condition « concerned » restreint à la bille elle-même
// (« si c'est cette bille qui est visée »), ou aux autres ; refusée ailleurs.
function checkPolished(run) {
  const table = {
    plain: {},
    // Polissage : Vitesse +3, pour toute bille active polie.
    shiny: { polished: [speed(3)] },
    // Polissage : Vitesse +3 si c'est cette bille qui est visée (le cuivre).
    copper: { polished: [{ ...speed(3), when: concerned("self") }] },
    // Polissage : Vitesse +1 si c'est une autre bille qui est visée.
    jealous: { polished: [{ ...speed(1), when: concerned("other") }] },
    // Base : Polir de 1 la bille de l'emplacement suivant.
    polisher: { base: [polish(1, NEXT_SLOT)] },
  };
  const rules = fabricatedRules(table);
  const resolve = (triangle) => mustReduce(rules, marblesPlayState(rules, { triangle }), { type: "resolve" });
  const played = (triangle) => playedFor(resolve(triangle).events, "polished").map((effect) => `${effect.marble}:${effect.slot}:${effect.speedDelta}`);
  // La base gauche polit la pointe (usure 1) : seule bille polie.
  run.same("Polissage : elle-même polie, elle réagit", ["shiny:apex:3"], played({ rightBase: null, leftBase: placed("polisher"), apex: placed("shiny", 1) }));
  run.same("Polissage : à usure 0, rien de retiré, rien", [], played({ rightBase: null, leftBase: placed("polisher"), apex: placed("shiny", 0) }));
  // La base droite polit la base gauche : la pointe, une autre bille, réagit aussi.
  run.same("Polissage : une autre bille polie, elle réagit", ["shiny:apex:3"], played({ rightBase: placed("polisher"), leftBase: placed("plain", 1), apex: placed("shiny") }));
  // La base droite polit la base gauche : les deux cuivres réagissent, seul celui qui
  // est visé produit sa Vitesse ; l'inverse pour la condition « une autre ».
  const gained = (triangle) => played(triangle).filter((line) => !line.endsWith(":0"));
  run.same("Polissage : cette bille seulement, précisée par la condition", ["copper:leftBase:3"], gained({ rightBase: placed("polisher"), leftBase: placed("copper", 1), apex: placed("copper") }));
  run.same("Polissage : une autre bille seulement", ["jealous:apex:1"], gained({ rightBase: placed("polisher"), leftBase: placed("jealous", 1), apex: placed("jealous") }));
  run("Polissage : compté par bille qui a le champ, condition fausse comprise", 2, resolve({ rightBase: placed("polisher"), leftBase: placed("copper", 1), apex: placed("copper") }).state.tally.polished.game);
  run("Polissage : prévision égale au réel", true, forecastMatches(rules, marblesPlayState(rules, { triangle: { rightBase: placed("polisher"), leftBase: placed("copper", 1), apex: placed("shiny") } }), null));
  run(
    "fiche : « Polissage : Vitesse +3 si c'est cette bille qui est visée. »",
    "card.polished{effect: effect.combined{parts: [effect.conditional{effect: effect.combined{parts: [effect.speed_up{amount: 3}]}, condition: condition.concerned.self}]}}",
    marbleCard("copper", "x", rules, t, { timeless: true }).below[0]
  );
  // La condition hors d'un déclencheur pour toute bille active : refusée au chargement.
  run("condition « concerned » : refusée hors du Polissage et de la Fêlure", true, throws(() => validateTable({ wrong: { base: [{ ...speed(1), when: concerned("self") }] } })));
  run("condition « concerned » : bille inconnue refusée", true, throws(() => validateTable({ wrong: { polished: [{ ...speed(1), when: concerned("everyone") }] } })));
  run("condition « concerned » : acceptée dans la Fêlure", false, throws(() => validateTable({ fine: { cracked: [{ ...speed(1), when: concerned("other") }] } })));
}

// LA FÊLURE REÇUE : toute bille active fêlée d'au moins 1, elle comprise ; chaque bille
// active qui a le champ réagit ; fêlée jusqu'à son maximum, elle est partie.
function checkCracked(run) {
  const table = {
    plain: {},
    // Fêlure : Vitesse +2 ; une Fêlure 1 l'use (usure maximale 3).
    devil: { cracked: [speed(2)], base: [crack(1, NEXT_SLOT)] },
    // Usure maximale 1 : fêlé, il part.
    frail: { maxWear: 1, cracked: [speed(2)] },
    // Base : Fêlure 1 à la bille de l'emplacement suivant.
    cracker: { base: [crack(1, NEXT_SLOT)] },
  };
  const rules = fabricatedRules(table);
  const resolve = (triangle) => mustReduce(rules, marblesPlayState(rules, { triangle }), { type: "resolve" });
  const played = (triangle) => playedFor(resolve(triangle).events, "cracked").map((effect) => `${effect.marble}:${effect.slot}`);
  run.same("Fêlure reçue : une autre bille fêlée, le diable réagit", ["devil:apex"], played({ rightBase: placed("cracker"), leftBase: placed("plain"), apex: placed("devil") }));
  run.same("Fêlure reçue : elle-même fêlée, elle réagit", ["devil:leftBase"], played({ rightBase: placed("cracker"), leftBase: placed("devil"), apex: null }));
  // Deux diables : la base gauche (diable) fêle la pointe (diable) : les deux réagissent,
  // dans l'ordre horaire ; puis la base droite fêle la gauche : les deux encore.
  run.same(
    "Fêlure reçue : chaque bille active qui a le champ réagit, dans l'ordre horaire",
    ["devil:rightBase", "devil:leftBase", "devil:rightBase", "devil:leftBase"],
    played({ rightBase: placed("devil"), leftBase: placed("devil"), apex: placed("plain") }).slice(0, 4)
  );
  run.same("Fêlure reçue : fêlée jusqu'à son maximum, partie, elle ne réagit plus", [], played({ rightBase: placed("cracker"), leftBase: placed("frail"), apex: null }));
  // Le casseur fêle la base gauche (un diable), qui fêle la pointe (un diable) : deux
  // fêlures, comptées chacune par les deux diables.
  run("Fêlure reçue : comptée par bille qui a le champ (deux fêlures, deux diables)", 4, resolve({ rightBase: placed("cracker"), leftBase: placed("devil"), apex: placed("devil") }).state.tally.cracked.game);
  run("Fêlure reçue : prévision égale au réel", true, forecastMatches(rules, marblesPlayState(rules, { triangle: { rightBase: placed("cracker"), leftBase: placed("plain"), apex: placed("devil") } }), null));
  run.same("mots-clés : la Fêlure reçue et l'action Fêlure, deux entrées", ["cracked", "crack"], rules.keywordsOf("devil").map((keyword) => keyword.id).filter((id) => id.startsWith("crack")));
}

// LE DÉBORDEMENT ET LA PERTE (marbles/core/path.js/sendToPot) : une bille qui arrive
// dans un pot plein y entre, la plus ancienne en sort et se perd, sa Perte joue, puis
// l'entrée de la nouvelle ; le verrou du pot fait taire la Perte d'une bille poussée
// hors du pot ; un pot de capacité 0 perd la nouvelle elle-même, depuis sa zone, sa
// Perte comprise. La Perte n'a ni emplacement de référence ni d'action sur elle-même.
function checkOverflowLoss(run) {
  const table = {
    plain: {},
    // Chiquenaude : Empocher la première bille de la main.
    pocketer: { flick: [pocket(FIRST_IN_HAND)] },
    // Perte : Vitesse +5.
    mourner: { loss: [speed(5)] },
    // En poche, à l'entrée : Vitesse +10.
    greeter: { pocketed: { entry: [speed(10)] } },
  };
  const rules = fabricatedRules(table);
  const toApex = { type: "place", handIndex: 0, slot: "apex" };
  const fullPot = (over = {}) => marblesPlayState(rules, { hand: inHand(["pocketer", "greeter"]), pot: ["mourner", "plain", "plain"], ...over });
  const steps = (events) =>
    events
      .filter((event) => ["lost", "pocketed"].includes(event.type) || (event.type === "effect" && ["loss", "pocketEntry"].includes(event.trigger)))
      .map((event) => (event.type === "effect" ? `${event.trigger}:${event.marble}` : `${event.type}:${event.marble}:${event.from}`));
  const overflow = mustReduce(rules, fullPot(), toApex);
  run.same(
    "débordement : la plus ancienne perdue depuis le pot, sa Perte, puis la nouvelle entre, son entrée",
    ["lost:mourner:pot", "loss:mourner", "pocketed:greeter:hand", "pocketEntry:greeter"],
    steps(overflow.events)
  );
  run.same("débordement : le pot reste à sa capacité, la plus ancienne chez les perdues", { pot: ["plain", "plain", "greeter"], lost: ["mourner"] }, { pot: overflow.state.pot, lost: overflow.state.lost });
  run("débordement : Perte (+5) et entrée (+10) comptées", 15, overflow.state.speed);
  run.same(
    "débordement : les valeurs de partie, un Empocher et une seule bille déplacée",
    { overflows: 1, lostMarbles: 1, loss: 1, pocket: 1, pocketQuantity: 1, pocketedMarbles: 1 },
    Object.fromEntries(["overflows", "lostMarbles", "loss", "pocket", "pocketQuantity", "pocketedMarbles"].map((id) => [id, overflow.state.tally[id].game]))
  );
  run("débordement : aucune bille perdue ni dupliquée", marbleCount(fullPot()), marbleCount(overflow.state));
  run("débordement : prévision égale au réel", true, forecastMatches(rules, fullPot(), toApex));
  run.same(
    "débordement : la prévision dit la perte et sa Perte chez l'effet qui empoche",
    [
      { marble: "mourner", lost: true, loss: 5 },
      { marble: "greeter", lost: false, loss: null },
    ],
    rules.forecast(fullPot(), toApex).flick.pockets.map(({ marble, lost, loss }) => ({ marble, lost, loss: loss === null ? null : loss.speed }))
  );

  // Le pot verrouillé (pot inerte) : le débordement a lieu, la Perte se tait, comme
  // l'entrée.
  const locked = mustReduce(rules, { ...fullPot(), statuses: [statusInstance("no_pot", { remaining: null })] }, toApex);
  run.same("pot verrouillé : le débordement a lieu, sans Perte ni entrée", [["lost:mourner:pot", "pocketed:greeter:hand"], 0], [steps(locked.events), locked.state.speed]);
  run("pot verrouillé : la Perte ne compte pas", 0, locked.state.tally.loss.game);

  // Un pot de capacité 0 : la nouvelle se perd elle-même, depuis la main, sa Perte comprise.
  const zero = mustReduce(rules, marblesPlayState(rules, { hand: inHand(["pocketer", "mourner"]), potCapacity: 0 }), toApex);
  run.same("pot de capacité nulle : la nouvelle perdue depuis la main, sa Perte jouée", [["lost:mourner:hand", "loss:mourner"], 5], [steps(zero.events), zero.state.speed]);
  run("pot de capacité nulle : sa Perte joue même pot verrouillé (elle ne sort pas du pot)", 5, mustReduce(rules, { ...marblesPlayState(rules, { hand: inHand(["pocketer", "mourner"]), potCapacity: 0 }), statuses: [statusInstance("no_pot", { remaining: null })] }, toApex).state.speed);

  run("fiche : « Perte : Vitesse +5. »", "card.loss{effect: effect.combined{parts: [effect.combined{parts: [effect.speed_up{amount: 5}]}]}}", marbleCard("mourner", "x", rules, t, { timeless: true }).below[0]);
  run("Perte : une cible relative refusée (aucun emplacement de référence)", true, throws(() => validateTable({ wrong: { loss: [polish(1, NEXT_SLOT)] } })));
  run("Perte : une action sur elle-même refusée (elle est perdue)", true, throws(() => validateTable({ wrong: { loss: [pocket()] } })));
  run("Perte : un bonus à un emplacement permis", false, throws(() => validateTable({ fine: { loss: [{ ...speed(2), target: "apex" }] } })));
}

// La déclaration : la portée et l'exigence, refusées hors de leur cadre.
function checkDeclaration(run) {
  const polished = MARBLE_TRIGGERS.find((trigger) => trigger.id === "polished");
  const others = MARBLE_TRIGGERS.filter((trigger) => trigger.id !== "polished");
  const withPolished = (changes) => () => validateMarbleTriggers([...others, { ...polished, ...changes }]);
  run("déclaration : scope inconnu refusé", true, throws(withPolished({ scope: "everyone" })));
  run("déclaration : scope hors du triangle refusé", true, throws(withPolished({ scope: "any", marble: "leaving" })));
  run("déclaration : atLeast non entier refusé", true, throws(withPolished({ atLeast: { applied: "un" } })));
}

// LES COMPTEURS PAR BILLE : les quantités de billes d'une action (billes déplacées par
// rebond, chassées par effet), écoutables, et l'évènement des billes normales ou calots
// éjectés ; le pot y réagit bille par bille. Une quantité de points (l'usure rendue)
// ne s'écoute pas, et une réaction qui produirait l'action qu'elle écoute, par sa
// quantité, est une boucle refusée.
function checkMarbleTallies(run) {
  const table = {
    plain: {},
    small: { size: SMALL },
    // Tic : Rebond de toutes les billes actives.
    globe: { hit: [bounce(allActive())] },
    // Tic : Éjecter toutes les billes actives.
    blower: { hit: [eject(allActive())] },
    // En poche, à chaque bille déplacée par rebond : Masse +1.
    keeper: { pocketed: { bounceQuantity: [mass(1)] } },
  };
  const rules = fabricatedRules(table);
  const place = (marble, triangle, over = {}) => mustReduce(rules, marblesPlayState(rules, { hand: inHand([marble]), triangle, ...over }), { type: "place", handIndex: 0, slot: "apex" });
  const full = { rightBase: placed("plain"), leftBase: placed("small"), apex: placed("plain") };
  // globe posée en pointe : la délogée est en partance ; le Tic renvoie les deux bases
  // et le globe lui-même (toutes les billes actives).
  const bounced = place("globe", full, { pot: ["keeper"] });
  run.same("billes déplacées par rebond : trois, et le pot réagit à chacune", { bounceQuantity: 3, mass: 4 }, { bounceQuantity: bounced.state.tally.bounceQuantity.game, mass: bounced.state.mass });
  const crowded = place("globe", full, { hand: inHand(["globe", "plain", "plain", "plain", "plain"]), handSize: 5 });
  run("billes déplacées par rebond : main pleine, comptées aussi", 3, crowded.state.tally.bounceQuantity.game);
  const blown = place("blower", full);
  run.same(
    "billes chassées par effet : les deux bases et elle-même, pas la délogée par la pose ; normales ou calots : la délogée et les deux normales",
    { ejectQuantity: 3, ejectedMarbles: 4, ejectedBigMarbles: 3 },
    { ejectQuantity: blown.state.tally.ejectQuantity.game, ejectedMarbles: blown.state.tally.ejectedMarbles.game, ejectedBigMarbles: blown.state.tally.ejectedBigMarbles.game }
  );
  run("quantité de points : l'usure rendue ne s'écoute pas", true, throws(() => validateTable({ x: { pocketed: { polishQuantity: [mass(1)] } } })));
  run("boucle : réagir aux billes déplacées par rebond en faisant un Rebond, refusé", true, throws(() => validateTable({ x: { pocketed: { bounceQuantity: [bounce("apex")] } } })));
  run("quantité de billes : écouter les billes piochées par une pioche, permis", false, throws(() => validateTable({ x: { pocketed: { drawQuantity: [mass(1)] } } })));
}

// UN LANCER RENDU : une Chiquenaude qui donne « lancers +1, ce tour » ; le lancer de la
// pose est compté, puis rendu aussitôt.
function checkThrowBack(run) {
  const rules = fabricatedRules({ plain: {}, soda: { flick: [applyStatus("throws_now")] } });
  const start = marblesPlayState(rules, { hand: inHand(["soda", "plain"]) });
  const before = throwsLeft(start, rules.statuses);
  const after = mustReduce(rules, start, { type: "place", handIndex: 0, slot: "apex" }).state;
  run("lancer rendu : la pose du soda ne coûte rien ce tour", before, throwsLeft(after, rules.statuses));
}
