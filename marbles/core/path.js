// JEU DES BILLES — LE CHEMIN DES BILLES : toute bille qui quitte sa zone, son départ,
// son déclencheur de sortie, sa destination et son arrivée (travel), les déplacements
// des actions (Empocher, Défausser, Rebond, Ramasser), l'éjection (Éjecter) et le
// retrait par usure. Une partie du déroulé (marbles/core/run.js) : chaque fonction
// reçoit son objet `run` et passe par ses méthodes (update, emit, settle, record,
// settleReactions), sans rien importer du déroulé lui-même. Simulation pure.

import { CLAUSE_ACTIONS } from "./effects.js";
import { characteristic } from "./statuses.js";

// La PLACE LIBRE en main : la taille de main en vigueur (statuts compris) moins les
// billes qui y sont ; négative pour une main au-delà de sa taille (un statut qui l'a
// réduite).
export function handRoom(run) {
  return characteristic(run.state, "handSize", run.statuses) - run.state.hand.length;
}

// --- LE CHEMIN DES BILLES ---
//
// Toute sortie d'une bille de sa zone passe par UN déroulé (travel), dans cet ordre :
//   1. DÉPART : la bille quitte sa zone (ORIGINS) et devient EN PARTANCE. Elle
//      n'appartient plus à aucune zone : ni active, ni en main, ni à la défausse,
//      pour toutes les règles (conditions, montants, cibles, régénération du sac).
//      Depuis le triangle, `removed` le dit, avec sa cause.
//      Un REMPLACEMENT intercale ici l'arrivée de la bille posée et son Tic
//      (`meanwhile`) : le Tic joue pendant que la délogée est en partance, et peut
//      donc la rediriger (Empocher, Rebond « la bille éjectée »).
//   2. DÉCLENCHEUR DE SORTIE, s'il y en a un : le Final (usure) ou l'Éjection
//      (remplacement, Éjecter), une INTERRUPTION (run.settle) réglée jusqu'au bout.
//      La bille y est "leaving" (marbles/core/effects.js/HOLDER_ZONES) : une action
//      sur elle-même y REDIRIGE sa destination (Empocher vers le pot), le départ, lui,
//      ne s'annule jamais.
//   3. DESTINATION : la défausse par défaut, ou celle qu'une redirection a posée.
//   4. ARRIVÉE (arrive) : dans la défausse (`discarded`, sa Chute), au pot
//      (`pocketed`, son entrée ; plein, `lost`, sans effet d'entrée), en main
//      (`returned`, aucun déclencheur ; pleine, la défausse à la place).
// Le trajet en cours est dans `run.inTransit` le temps du déclencheur de sortie : un
// choix qui s'ouvre alors l'emporte (pendingChoice.inTransit).

// Ce qui fait quitter sa zone à une bille, par zone d'origine `from` : { zone, slot }
// sur le triangle, { zone, index } dans la main ou la défausse, { zone } pour le haut
// du sac.
const ORIGINS = {
  // Son emplacement se vide, son bonus part avec elle ; une phase qui n'avait pas eu
  // lieu est sautée (la résolution relit l'emplacement).
  // Le départ entre au journal sans passer par la file : ses réactions se règlent
  // après le déclencheur de sortie de la bille (travel), partout le même ordre.
  triangle(run, from, marble, cause) {
    run.update({ triangle: { ...run.state.triangle, [from.slot]: null } });
    const removed = { type: "removed", slot: from.slot, marble, cause };
    run.record(removed);
    return removed;
  },
  hand(run, from) {
    run.update({ hand: run.state.hand.filter((_, other) => other !== from.index) });
  },
  discard(run, from) {
    run.update({ discard: run.state.discard.filter((_, other) => other !== from.index) });
  },
  // Le haut du sac (Défausser les prochaines billes du sac).
  bag(run) {
    run.update({ bag: run.state.bag.slice(1) });
  },
};

// Les champs d'origine que portent les évènements d'arrivée : `from` (la zone) et
// sa place, `slot` ou `index`.
function originFields(from) {
  if (from.zone === "triangle") return { from: "triangle", slot: from.slot };
  if (from.zone === "hand" || from.zone === "discard") return { from: from.zone, index: from.index };
  return { from: from.zone };
}

// LE trajet d'une bille, le seul (voir plus haut). `journey` :
//   marble       la bille ;
//   from         d'où elle part (ORIGINS) ;
//   cause        pourquoi : "wear", "replacement", "eject", ou l'action qui la
//                déplace ("pocket", "discard") ;
//   exit         (facultatif) l'évènement de son déclencheur de sortie, `final` ou
//                `knockout`, réglé pendant qu'elle est en partance ;
//   destination  (facultatif) "discard" par défaut, ou "pot" (Empocher) ;
//                une action qui déplace pose la sienne (CLAUSE_ACTIONS, `moves`) ;
//   by           (facultatif) l'effet qui la déplace, que porte son arrivée ;
//   movedBy      (facultatif) l'action qui la déplace (Empocher, Défausser,
//                Rebond, Ramasser), que porte son arrivée : ses compteurs la lisent ;
//   meanwhile    (facultatif) ce qui se passe entre son départ et son déclencheur de
//                sortie, elle en partance : l'arrivée de la bille posée et son Tic,
//                pour un remplacement (marbles/core/marbles.js/placeMarble).
export function travel(run, { marble, from, cause, exit = null, destination = "discard", by = null, movedBy = null, meanwhile = null }) {
  const departure = ORIGINS[from.zone](run, from, marble, cause);
  const moving = { kind: "leaving", marble, slot: from.slot ?? null, destination, by, movedBy, redirected: false };
  run.inTransit = [...run.inTransit, moving];
  if (meanwhile !== null) meanwhile();
  if (exit !== null) run.settle(exit);
  // Les réactions au départ (un départ du triangle), après le déclencheur de sortie :
  // la bille concernée joue d'abord son effet.
  if (departure !== undefined) run.settleReactions(departure);
  run.inTransit = run.inTransit.filter((other) => other !== moving);
  arrive(run, moving, from, cause);
}

// Redirige la bille EN PARTANCE `marble` (la plus récente de ce nom) vers
// `destination`, par l'effet `by` : `redirected` le note, un déclenchement de
// l'action `action`. Deux effets peuvent le faire : celui de la bille elle-même
// (son Final, son Éjection), et le Tic de la bille qui la déloge (« la bille
// éjectée »), qui joue AVANT son Éjection. La dernière redirection l'emporte. -> vrai
// si une bille en partance a été trouvée.
export function redirect(run, marble, destination, action, by) {
  const moving = run.inTransit.findLast((other) => other.kind === "leaving" && other.marble === marble);
  if (moving === undefined) return false;
  Object.assign(moving, { destination, by, movedBy: action, redirected: true });
  run.emit({ type: "redirected", marble, destination, action, by });
  return true;
}

// L'ARRIVÉE d'une bille à sa destination, son trajet fini : au pot (sendToPot), ou
// à la défausse (`discarded`, de sa cause), une interruption comme les autres
// arrivées, réglée avant la suite : la CHUTE de la bille (MARBLE_TRIGGERS, `drop`)
// y joue, elle à la défausse.
function arrive(run, moving, from, cause) {
  const origin = originFields(from);
  const marks = { ...(moving.redirected ? { redirected: true } : {}), ...(moving.movedBy === null ? {} : { movedBy: moving.movedBy }) };
  if (moving.destination === "pot") {
    sendToPot(run, moving.marble, origin, moving.by, marks);
    return;
  }
  // En main (Rebond, Ramasser), à 0 tour en main, sans Éveil : ce n'est pas une
  // pioche. `handIndex` : sa place d'arrivée, la dernière.
  const roomInHand = handRoom(run) > 0;
  if (moving.destination === "hand" && roomInHand) {
    run.update({ hand: [...run.state.hand, { marble: moving.marble, turnsInHand: 0 }] });
    run.settle({ type: "returned", marble: moving.marble, ...origin, handIndex: run.state.hand.length - 1, cause, ...marks, ...(moving.by === null ? {} : { by: moving.by }) });
    return;
  }
  // La défausse, destination par défaut, ou celle d'une bille renvoyée vers une
  // main pleine (`handFull`). L'effet qui l'a déplacée, s'il y en a un : la
  // prévision rattache l'arrivée, et sa Chute, à cet effet.
  run.update({ discard: [...run.state.discard, moving.marble] });
  const handFull = moving.destination === "hand" ? { handFull: true } : {};
  run.settle({ type: "discarded", marble: moving.marble, ...origin, cause, ...handFull, ...marks, ...(moving.by === null ? {} : { by: moving.by }) });
}

// LES DÉPLACEMENTS d'une action qui en fait (CLAUSE_ACTIONS, `moves` : Empocher,
// Défausser) : un trajet (travel), sans déclencheur de sortie, de cause l'action,
// vers sa destination.
export function moveBy(run, marble, from, action, by) {
  travel(run, { marble, from, cause: action, destination: CLAUSE_ACTIONS[action].moves, by, movedBy: action });
}

// La bille de la défausse à `index` la quitte (Ramasser). Vers la main, s'il n'y a
// plus de place (`handLimited`), elle reste où elle est : sans effet, noté.
// -> vrai si elle est partie.
export function moveFromDiscard(run, index, action, by) {
  if (CLAUSE_ACTIONS[action].handLimited && handRoom(run) <= 0) {
    run.emit({ type: "targetEmpty", action, slot: null, target: "handFull", by });
    return false;
  }
  moveBy(run, run.state.discard[index], { zone: "discard", index }, action, by);
  return true;
}

// La bille de la main à `index` quitte la main.
export function moveFromHand(run, index, action, by) {
  moveBy(run, run.state.hand[index].marble, { zone: "hand", index }, action, by);
}

// La bille d'un emplacement quitte le triangle : ni usure ni éjection, donc ni Final
// ni Éjection ; une phase qui n'avait pas eu lieu est sautée. Vide : noté.
export function moveFromSlot(run, slot, action, by) {
  const placed = run.state.triangle[slot];
  if (placed === null) {
    run.emit({ type: "targetEmpty", action, slot, by });
    return;
  }
  moveBy(run, placed.marble, { zone: "triangle", slot }, action, by);
}

// Les `count` prochaines billes du sac, une par une, du haut : chacune son trajet
// (sa Chute, une Défausse). Un sac qui en a moins donne ce qu'il a, sans
// régénération (mélanger la défausse pour la redéfausser n'aurait pas de sens) ; un
// sac vide : sans effet, noté. À l'aveugle (la prévision), la bille est inconnue.
export function moveFromBag(run, count, action, by) {
  if (run.state.bag.length === 0) {
    run.emit({ type: "targetEmpty", action, slot: null, target: "bag", by });
    return;
  }
  for (let moved = 0; moved < count && run.state.bag.length > 0; moved++) {
    moveBy(run, run.state.bag[0], { zone: "bag" }, action, by);
  }
}

// L'arrivée au pot ; plein, la bille est perdue. Au pot, ses effets d'entrée se
// règlent aussitôt (une interruption : run.settle), avant la suite. `extra` :
// `redirected` quand une redirection l'y a envoyée (son déclenchement d'Empocher
// est déjà compté par `redirected`).
function sendToPot(run, marble, origin, by, extra = {}) {
  if (run.state.pot.length < characteristic(run.state, "potCapacity", run.statuses)) {
    run.update({ pot: [...run.state.pot, marble] });
    run.settle({ type: "pocketed", marble, ...origin, potIndex: run.state.pot.length - 1, by, ...extra });
    return;
  }
  run.update({ lost: [...run.state.lost, marble] });
  // Une arrivée comme les autres : réglée aussitôt, ses réactions comprises.
  run.settle({ type: "lost", marble, ...origin, by, ...extra });
}

// La bille de `slot` est CHASSÉE par l'effet `by` : `eject`, puis son trajet
// (travel), cause "eject", son Éjection pour déclencheur de sortie, dont les
// conditions de calibre comparent la bille chassée à celle qui éjecte (le
// remplacement { placed, ejected }). Ni Tic ni Final. Pendant la résolution, sa
// phase, si elle n'avait pas eu lieu, est sautée. Partie dès son départ, elle n'est
// plus sur le triangle pendant son Éjection : rien ne peut la chasser une seconde
// fois.
export function ejectFromSlot(run, slot, by) {
  const placed = run.state.triangle[slot];
  if (placed === null) {
    run.emit({ type: "targetEmpty", action: "eject", slot, by });
    return;
  }
  const { marble } = placed;
  run.emit({ type: "eject", slot, marble, by });
  const exit = { type: "knockout", slot, marble, replacement: { placed: by.marble, ejected: marble }, by };
  travel(run, { marble, from: { zone: "triangle", slot }, cause: "eject", exit });
}

// LE retrait par usure d'une bille, le seul : à l'étape des retraits, ou aussitôt
// quand une Fêlure l'amène à son maximum. Son trajet (travel), cause "wear" : elle
// quitte son emplacement, son Final joue pendant qu'elle est en partance, puis elle
// arrive à sa destination, la défausse sauf redirection.
export function retireMarble(run, slot) {
  const { marble } = run.state.triangle[slot];
  travel(run, { marble, from: { zone: "triangle", slot }, cause: "wear", exit: { type: "final", slot, marble } });
}
