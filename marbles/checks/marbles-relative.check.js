// Vérifications du core — domaine « marbles-relative ». Les CIBLES RELATIVES du jeu
// des billes (marbles/core/effects.js/NEXT_SLOT, PREVIOUS_SLOT, resolveClauses ;
// doc/marbles.md, « La règle des cibles ») : l'emplacement suivant ou précédent de
// la référence de la bille (son emplacement, celui que vise sa pose, celui qu'elle
// quitte), la règle des cibles, l'absence de référence, le ricochet, les refus au
// chargement, les textes et la prévision. Sur des billes fabriquées. Lancées par
// core/checks/index.js/runChecks (`node tools/run-checks.js marbles-relative`).

import { throws } from "../../lib/check.js";
import { LARGE } from "../config/values.js";
import { marbleCard } from "../view/card.js";
import { fabricatedRules, forecastMatches, inHand, keyText as t, marbleCount, marblesPlayState, mustReduce, placed, validateTable } from "./helpers.js";

const NEXT = "nextSlot";
const PREVIOUS = "previousSlot";

export default function checkMarblesRelative(run) {
  run.section("références et règle des cibles", checkReferences);
  run.section("ricochet", checkRicochet);
  run.section("validation et textes", checkValidationAndTexts);
}

const TABLE = {
  plain: { base: [{ action: "speed", amount: 1 }], apex: [{ action: "speed", amount: 1 }] },
  big: { size: LARGE },
  // Base : Vitesse +2 à la bille de l'emplacement suivant.
  nextGiver: { base: [{ action: "speed", amount: 2, target: NEXT }] },
  // Pointe : Vitesse +2 à la suivante (la base droite, déjà passée : perdu), et
  // Polissage 1 à la suivante (valide).
  apexGiver: { apex: [{ action: "speed", amount: 2, target: NEXT }] },
  apexPolisher: { apex: [{ action: "polish", amount: 1, target: NEXT }] },
  // Chiquenaude : Masse +1 à la bille de l'emplacement précédent de l'emplacement visé.
  flicker: { flick: [{ action: "mass", amount: 1, target: PREVIOUS }] },
  // Final, en partance : Polissage 1 à la suivante de l'emplacement quitté.
  finalPolisher: { maxWear: 1, final: [{ action: "polish", amount: 1, target: NEXT }] },
  // Chute : Polissage 1 à la suivante, sans référence depuis la main.
  dropper: { drop: [{ action: "polish", amount: 1, target: NEXT }] },
  // Chute : Fêlure à la suivante (sans référence depuis la main) d'un montant calculé
  // à 0 (aucune bille en main), puis Fêlure 1 à la suivante, puis Masse +1.
  orderDropper: {
    drop: [
      { action: "crack", amount: { base: 0, step: 1, source: { type: "zoneCount", zone: "hand" } }, target: NEXT },
      { action: "crack", amount: 1, target: NEXT },
      { action: "mass", amount: 1, target: "apex" },
    ],
  },
  // Tic : Défausser la première bille de la main.
  handDiscarder: { hit: [{ action: "discard", target: "firstInHand" }] },
  // Base : Vitesse +3 si la bille de l'emplacement suivant est un calot.
  sizeWatcher: { base: [{ action: "speed", amount: 3, when: { type: "sizeAt", slot: NEXT, size: LARGE } }] },
};

function checkReferences(run) {
  const rules = fabricatedRules(TABLE);
  const state = (over) => marblesPlayState(rules, { bag: ["plain"], ...over });
  const resolve = (over) => mustReduce(rules, state(over), { type: "resolve" });
  const effectAt = (result, slot) => result.events.find((event) => event.type === "effect" && event.trigger === "phase" && event.slot === slot);

  // Sur le triangle : depuis la base droite, la base gauche reçoit ; depuis la base
  // gauche, la pointe.
  const fromRight = resolve({ triangle: { rightBase: placed("nextGiver"), leftBase: placed("plain"), apex: placed("plain") } });
  run("suivant depuis la base droite : la base gauche reçoit (1 + 2)", 3, effectAt(fromRight, "leftBase").speedDelta);
  const fromLeft = resolve({ triangle: { rightBase: placed("plain"), leftBase: placed("nextGiver"), apex: placed("plain") } });
  run("suivant depuis la base gauche : la pointe reçoit (1 + 2)", 3, effectAt(fromLeft, "apex").speedDelta);
  // Depuis la pointe, la suivante est la base droite, déjà passée : bonus perdu, noté.
  const fromApex = resolve({ triangle: { rightBase: placed("plain"), leftBase: null, apex: placed("apexGiver") } });
  run.same("suivant depuis la pointe : la base droite déjà passée, bonus perdu et noté", [{ slot: "rightBase", reason: "phasePassed", speed: 2, mass: 0 }], effectAt(fromApex, "apex").lost);
  // Le Polissage, lui, reste valide.
  const polished = resolve({ triangle: { rightBase: placed("plain", 2), leftBase: null, apex: placed("apexPolisher") } });
  run.same("Polissage depuis la pointe vers la suivante : la base droite polie", { slot: "rightBase", wear: 2 }, (({ slot, wear }) => ({ slot, wear }))(polished.events.find((event) => event.type === "polished")));
  // Une cible vide : sans effet, noté.
  const empty = resolve({ triangle: { rightBase: null, leftBase: null, apex: placed("apexPolisher") } });
  run("suivant vide : noté au journal", true, empty.events.some((event) => event.type === "targetEmpty" && event.action === "polish" && event.slot === "rightBase"));

  // Chiquenaude : la référence est l'emplacement visé ; le précédent de la base
  // droite est la pointe.
  const flicked = mustReduce(rules, state({ hand: inHand(["flicker"]), triangle: { rightBase: null, leftBase: null, apex: placed("plain") } }), { type: "place", handIndex: 0, slot: "rightBase" });
  run.same("Chiquenaude : précédent de l'emplacement visé (base droite), la pointe reçoit", { mass: 1, speed: 0 }, flicked.state.triangle.apex.bonus);
  const flickedApex = mustReduce(rules, state({ hand: inHand(["flicker"]), triangle: { rightBase: null, leftBase: placed("plain"), apex: null } }), { type: "place", handIndex: 0, slot: "apex" });
  run.same("Chiquenaude : précédent de la pointe, la base gauche reçoit", { mass: 1, speed: 0 }, flickedApex.state.triangle.leftBase.bonus);

  // En partance : la référence est l'emplacement quitté.
  const final = resolve({ triangle: { rightBase: placed("plain", 1), leftBase: null, apex: placed("finalPolisher") } });
  run.same("Final, en partance : la suivante de la pointe quittée, la base droite polie", ["rightBase"], final.events.filter((event) => event.type === "polished").map((event) => event.slot));

  // La Chute : depuis le triangle, l'emplacement quitté ; depuis la main, aucune
  // référence : sans effet, noté au journal.
  const fromHand = mustReduce(rules, state({ hand: inHand(["handDiscarder", "dropper"]), triangle: { rightBase: placed("plain"), leftBase: null, apex: null } }), { type: "place", handIndex: 0, slot: "rightBase" });
  run.same(
    "Chute depuis la main : sans référence, noté au journal",
    [{ type: "targetEmpty", action: "polish", slot: null, target: "noReference", by: { trigger: "drop", slot: null, marble: "dropper" } }],
    fromHand.events.filter((event) => event.type === "targetEmpty")
  );
  run("Chute depuis la main : rien de poli", false, fromHand.events.some((event) => event.type === "polished"));
  // Sans référence, la clause s'évalue comme les autres (un montant calculé à 0 ne
  // produit rien) et se note à sa place, dans l'ordre des clauses.
  const ordered = mustReduce(rules, state({ hand: inHand(["handDiscarder", "orderDropper"]), triangle: { rightBase: placed("plain"), leftBase: null, apex: null } }), { type: "place", handIndex: 0, slot: "rightBase" });
  run.same(
    "Chute sans référence : un montant à 0 ne se note pas, la Fêlure se note, son effet ne la dit pas",
    { empties: ["crack"], said: [] },
    {
      empties: ordered.events.filter((event) => event.type === "targetEmpty" && event.target === "noReference").map((event) => event.action),
      said: ordered.events.find((event) => event.type === "effect" && event.trigger === "drop").operations,
    }
  );

  // Une condition sur un emplacement relatif.
  const watching = (size) => resolve({ triangle: { rightBase: placed("sizeWatcher"), leftBase: placed(size), apex: null } });
  run.same("condition relative : la suivante (base gauche) est un calot, oui puis non", [3, 0], [watching("big"), watching("plain")].map((result) => effectAt(result, "rightBase").speedDelta));

  // Prévision : égale au réel.
  run("prévision : bonus vers la suivante, égale au réel", true, forecastMatches(rules, state({ triangle: { rightBase: placed("nextGiver"), leftBase: placed("plain"), apex: placed("plain") } }), null));
  run("prévision : bonus perdu depuis la pointe, égale au réel", true, forecastMatches(rules, state({ triangle: { rightBase: placed("plain"), leftBase: null, apex: placed("apexGiver") } }), null));
  run("prévision : Chiquenaude vers la précédente, égale au réel", true, forecastMatches(rules, state({ hand: inHand(["flicker"]), triangle: { rightBase: null, leftBase: null, apex: placed("plain") } }), { type: "place", handIndex: 0, slot: "rightBase" }));
  run("prévision : Chute sans référence, égale au réel", true, forecastMatches(rules, state({ hand: inHand(["handDiscarder", "dropper"]), triangle: { rightBase: placed("plain"), leftBase: null, apex: null } }), { type: "place", handIndex: 0, slot: "rightBase" }));
}

// Le RICOCHET : une Éjection qui éjecte la bille de l'emplacement suivant, depuis
// l'emplacement qu'elle quitte. La chaîne passe par le chemin des billes et reste
// bornée : un emplacement déjà vidé n'a plus rien à éjecter. La bille posée est
// arrivée AVANT l'Éjection de la délogée (son Tic joue avant) : le ricochet fait le
// tour du triangle et la chasse à son tour ; sans Éjection, elle arrête la chaîne.
function checkRicochet(run) {
  const rules = fabricatedRules({ plain: {}, ricochet: { knockout: [{ action: "eject", target: NEXT }] } });
  const start = marblesPlayState(rules, { hand: inHand(["plain"]), triangle: { rightBase: placed("ricochet"), leftBase: placed("ricochet"), apex: placed("ricochet") } });
  const result = mustReduce(rules, start, { type: "place", handIndex: 0, slot: "rightBase" });
  const journal = result.events.filter((event) => ["removed", "knockout", "eject", "discarded", "targetEmpty", "placed"].includes(event.type)).map((event) => `${event.type}:${event.slot ?? ""}`);
  run.same(
    "ricochet : la posée arrive, puis chaque bille part, joue son Éjection en partance, éjecte la suivante ; la dernière chasse la posée",
    [
      "removed:rightBase",
      "placed:rightBase",
      "knockout:rightBase",
      "eject:leftBase",
      "removed:leftBase",
      "knockout:leftBase",
      "eject:apex",
      "removed:apex",
      "knockout:apex",
      "eject:rightBase",
      "removed:rightBase",
      "knockout:rightBase",
      "discarded:rightBase",
      "discarded:apex",
      "discarded:leftBase",
      "discarded:rightBase",
    ],
    journal
  );
  run("ricochet : aucun enchaînement interrompu", false, result.events.some((event) => event.type === "chainInterrupted"));
  run.same(
    "ricochet : les quatre à la défausse, la posée la première arrivée, le triangle vide",
    { discard: ["plain", "ricochet", "ricochet", "ricochet"], triangle: [null, null, null] },
    { discard: result.state.discard, triangle: [result.state.triangle.rightBase, result.state.triangle.leftBase, result.state.triangle.apex] }
  );
  run("ricochet : aucune bille perdue ni dupliquée", marbleCount(start), marbleCount(result.state));
  run("ricochet : prévision égale au réel", true, forecastMatches(rules, start, { type: "place", handIndex: 0, slot: "rightBase" }));
}

function checkValidationAndTexts(run) {
  const speedNext = { action: "speed", amount: 1, target: NEXT };
  const valid = (type) => !throws(() => validateTable({ x: type }));
  run("validation : relative permise en base, à la pointe, au Tic, en Chiquenaude, à l'Éjection, à la Chute", true, valid({ base: [speedNext], apex: [speedNext], hit: [speedNext], flick: [speedNext], knockout: [speedNext], drop: [{ action: "polish", amount: 1, target: NEXT }] }));
  run("validation : Polissage relatif permis au Final", true, valid({ final: [{ action: "polish", amount: 1, target: PREVIOUS }] }));
  run("validation : bonus relatif refusé au Final (plus de phase)", false, valid({ final: [speedNext] }));
  run("validation : relative refusée à l'Éveil (en main, sans référence)", false, valid({ awaken: [{ action: "polish", amount: 1, target: NEXT }] }));
  run("validation : relative refusée en poche, à l'entrée", false, valid({ pocketed: { entry: [{ action: "polish", amount: 1, target: NEXT }] } }));
  run("validation : relative refusée en poche, à chaque résolution", false, valid({ pocketed: { resolution: [{ action: "polish", amount: 1, target: PREVIOUS }] } }));
  run("validation : condition relative refusée à l'Éveil", false, valid({ awaken: [{ action: "speed", amount: 1, when: { type: "sizeAt", slot: NEXT, size: LARGE } }] }));
  run("validation : Ramasser ne vise pas un emplacement", false, valid({ hit: [{ action: "retrieve", target: NEXT }] }));
  run("validation : Éjecter, Empocher, Défausser, Rebond relatifs permis", true, valid({ hit: ["eject", "pocket", "discard", "bounce"].map((action) => ({ action, target: NEXT })) }));

  const card = (type) => marbleCard("x", "x", fabricatedRules({ x: type }), t);
  run("texte : bonus à la suivante", "card.base{effect: effect.combined{parts: [effect.given_relative{effect: effect.combined{parts: [effect.speed_up{amount: 2}]}, relative: next}]}}", card({ base: [{ action: "speed", amount: 2, target: NEXT }] }).above[1]);
  run("texte : Polissage à la précédente", "card.apex{effect: effect.combined{parts: [effect.wear_relative{effect: effect.combined{parts: [effect.polish{amount: 1}]}, relative: previous}]}}", card({ apex: [{ action: "polish", amount: 1, target: PREVIOUS }] }).above[0]);
  run("texte : Éjecter la suivante", "card.knockout{effect: effect.combined{parts: [effect.eject_relative{relative: next}]}}", card({ knockout: [{ action: "eject", target: NEXT }] }).below[0]);
  run(
    "texte : condition sur la suivante",
    true,
    card({ base: [{ action: "speed", amount: 3, when: { type: "sizeAt", slot: NEXT, size: LARGE } }] }).above[1].includes("condition.sizeAt_relative{relative: next")
  );
}
