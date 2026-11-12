// Jeu des billes, ce qui se dit : les LIGNES DE CURSEUR ET D'ÉTAT. L'annonce
// principale d'une bille dans une liste, d'une place de la main, d'un emplacement
// (au repos ou pendant qu'on cherche où poser), et les annonces d'état : sac, pot,
// défausse, tour, ordre d'affichage du sac. Le détail d'une bille est dans sa fiche
// (view/marbles/card.js). Pur. Point d'entrée et vue d'ensemble :
// view/marbles/narration.js.

import { throwsLeft } from "../../../core/marbles.js";
import { formatMenuPosition } from "../../../lib/menu.js";
import { cardSituation, describeEffect, describePrinted, formatCounter, marbleName, sizeName, slotName } from "./effects.js";

// L'annonce principale d'une bille hors du triangle (main, sac, défausse) : son
// nom, son calibre juste après, son usure maximale, puis « x sur y » : « gorille,
// calot, usure 3. ». Le détail est dans sa fiche (view/marbles/card.js).
export function describeMarbleInList(marble, index, total, rules, t) {
  const line = t("marbles.list.line", { name: marbleName(marble, t), size: sizeName(rules.types[marble].size, t), maxWear: rules.maxWearOf(marble) });
  const position = formatMenuPosition(index, total, t);
  return position ? `${line}. ${position}` : `${line}.`;
}

// Une place de la main sous le curseur. Main vide : le dit.
export function describeHandFocus(game, index, rules, t) {
  if (game.hand.length === 0) return t("marbles.hand.empty");
  return describeMarbleInList(game.hand[index].marble, index, game.hand.length, rules, t);
}

// L'effet de phase de ce tour d'une bille active : la prévision si le tour se
// joue, sinon ce qu'elle a d'imprimé.
function phaseText(game, slot, rules, t) {
  const predicted = rules.forecast(game);
  if (predicted.ok) return describeEffect(predicted.phases[slot], t);
  const { marble } = game.triangle[slot];
  return describePrinted(rules.effectAt(marble, slot), cardSituation(marble, 0, game.tally), t);
}

// L'annonce principale d'un emplacement sous le curseur : la bille, son calibre
// juste après, sa place et son usure, ou « vide ». Le détail est dans sa fiche.
export function describeSlotFocus(game, slot, rules, t) {
  const placed = game.triangle[slot];
  if (placed === null) return t("marbles.slot_line.empty", { slot: slotName(slot, t) });
  return t("marbles.slot_line.occupied", {
    slot: slotName(slot, t),
    name: marbleName(placed.marble, t),
    size: sizeName(rules.types[placed.marble].size, t),
    wear: placed.wear,
    maxWear: rules.maxWearOf(placed.marble),
  });
}

// Un emplacement sous le curseur pendant qu'on cherche où poser : ce qui compte
// pour décider, la bille déjà là et ce qu'elle ferait ce tour.
export function describeSlotForPlacement(game, slot, rules, t) {
  const placed = game.triangle[slot];
  if (placed === null) return t("marbles.slot_line.placing_empty", { slot: slotName(slot, t) });
  return t("marbles.slot_line.placing_occupied", {
    slot: slotName(slot, t),
    name: marbleName(placed.marble, t),
    effect: phaseText(game, slot, rules, t),
  });
}

// Le sac : combien il en reste, et combien on en pioche à chaque tour.
export function describeBag(game, t) {
  return t("marbles.status.bag", { count: game.bag.length, draw: game.drawPerTurn });
}

// Le pot (touche P) : « 2 billes sur 3 dans le pot, 1 bille perdue. ».
export function describePot(game, t) {
  return t("marbles.status.pot", { count: game.pot.length, capacity: game.potCapacity, lost: game.lost.length });
}

export function describeDiscard(game, t) {
  return t("marbles.status.discard", { count: game.discard.length });
}

// Où en est le tour. Avec les lancers restants et la disponibilité de l'échange :
// rien d'autre ne permet de les savoir sans essayer.
export function describeTurn(game, swapAvailable, t) {
  const line = t("marbles.status.turn", {
    turn: game.turn,
    turnCount: game.turnCount,
    score: game.score,
    speed: formatCounter(game.speed),
    mass: formatCounter(game.mass),
  });
  const throws = t("marbles.status.throws", { count: throwsLeft(game) });
  return `${line} ${throws} ${t(swapAvailable ? "marbles.status.swap_available" : "marbles.status.swap_unavailable")}`;
}

// L'ordre dans lequel le menu du sac se dit : alphabétique, sur le nom prononcé.
// Il ne doit jamais révéler l'ordre de la pioche : il ne dépend donc que du contenu
// du sac, et ne demande aucun hasard, ni celui de la partie ni un autre.
export function bagDisplayOrder(bag, t) {
  return [...bag].sort((a, b) => marbleName(a, t).localeCompare(marbleName(b, t)));
}
