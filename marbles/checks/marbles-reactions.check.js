// Vérifications du core — domaine « marbles-reactions ». Ce qui RÉAGIT sur le triangle
// et ce que le pot peut écouter bille par bille, dans le jeu des billes : les
// déclencheurs Polissage reçu (la bille elle-même, polie d'au moins 1) et Fêlure reçue
// (toute bille active fêlée d'au moins 1, elle comprise), leurs compteurs, leurs
// textes et la prévision ; les compteurs d'évènements par bille (billes renvoyées par
// un Rebond, éjectées par un effet, normales ou calots éjectés) et une réaction du pot
// qui les écoute ; un statut de lancer pour ce tour donné par une Chiquenaude
// (marbles/config/values.js/MARBLE_TRIGGERS et MARBLE_TALLIES, doc/marbles.md). Sur
// des billes fabriquées et les statuts de test. Lancées par
// core/checks/index.js/runChecks (`node tools/run-checks.js marbles-reactions`).

import { throws } from "../../lib/check.js";
import { MARBLE_TRIGGERS, SMALL } from "../config/values.js";
import { NEXT_SLOT, allActive, applyStatus, bounce, crack, eject, mass, polish, speed } from "../content/effects.js";
import { validateMarbleTriggers } from "../core/content.js";
import { throwsLeft } from "../core/marbles.js";
import { marbleCard } from "../view/card.js";
import { fabricatedRules, forecastMatches, inHand, keyText as t, marblesPlayState, mustReduce, placed, validateTable } from "./helpers.js";

export default function checkMarblesReactions(run) {
  run.section("Polissage reçu", checkPolished);
  run.section("Fêlure reçue", checkCracked);
  run.section("déclaration des déclencheurs", checkDeclaration);
  run.section("compteurs par bille", checkMarbleTallies);
  run.section("lancer rendu", checkThrowBack);
}

// Les effets joués pour le déclencheur `trigger`, { marble, slot, speedDelta }.
const playedFor = (events, trigger) => events.filter((event) => event.type === "effect" && event.trigger === trigger).map(({ marble, slot, speedDelta }) => ({ marble, slot, speedDelta }));

// LE POLISSAGE REÇU : la bille elle-même, polie d'au moins 1 ; une autre bille polie,
// ou un polissage qui ne rend rien, ne la déclenche pas.
function checkPolished(run) {
  const table = {
    plain: {},
    // Polissage : Vitesse +3.
    copper: { polished: [speed(3)] },
    // Base : Polissage 1 à la bille de l'emplacement suivant.
    polisher: { base: [polish(1, NEXT_SLOT)] },
  };
  const rules = fabricatedRules(table);
  const resolve = (apex, wear) => mustReduce(rules, marblesPlayState(rules, { triangle: { rightBase: null, leftBase: placed("polisher"), apex: placed(apex, wear) } }), { type: "resolve" });
  run.same("Polissage reçu : polie de 1, Vitesse +3", [{ marble: "copper", slot: "apex", speedDelta: 3 }], playedFor(resolve("copper", 1).events, "polished"));
  run.same("Polissage reçu : à usure 0, rien de rendu, rien", [], playedFor(resolve("copper", 0).events, "polished"));
  const other = mustReduce(rules, marblesPlayState(rules, { triangle: { rightBase: placed("polisher"), leftBase: placed("plain", 1), apex: placed("copper", 1) } }), { type: "resolve" });
  run.same("Polissage reçu : une autre bille polie ne la déclenche pas", [], playedFor(other.events, "polished").filter((effect) => effect.slot !== "apex"));
  run.same("Polissage reçu : compté une fois", [1, 0], [resolve("copper", 1).state.tally.polished.game, resolve("copper", 0).state.tally.polished.game]);
  run("Polissage reçu : prévision égale au réel", true, forecastMatches(rules, marblesPlayState(rules, { triangle: { rightBase: null, leftBase: placed("polisher"), apex: placed("copper", 1) } }), null));
  run("fiche : « Polissage : Vitesse +3. »", "card.polished{effect: effect.combined{parts: [effect.combined{parts: [effect.speed_up{amount: 3}]}]}}", marbleCard("copper", "x", rules, t, { timeless: true }).below[0]);
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
