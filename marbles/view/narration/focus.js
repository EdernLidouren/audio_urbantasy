// Jeu des billes, ce qui se dit : les LIGNES DE CURSEUR ET D'ÉTAT. L'annonce
// principale d'une bille dans une liste, d'une place de la main, d'un emplacement
// (au repos ou pendant qu'on cherche où poser), et les annonces d'état : sac, pot,
// défausse, tour, ordre d'affichage du sac. Le détail d'une bille est dans sa fiche
// (marbles/view/card.js). Pur. Point d'entrée et vue d'ensemble :
// marbles/view/narration.js.

import { formatMenuPosition } from "../../../lib/menu.js";
import { turnLimit } from "../../core/definitions.js";
import { cardSituation, describeEffect, describePrinted, familyNames, formatCounter, marbleName, rarityName, sizeName, slotName, marbleRef } from "./effects.js";

// La ligne d'une bille hors du triangle (main, sac, défausse, pot, choix) : son nom,
// son calibre juste après, ses familles et sa rareté, son usure maximale : « rubis,
// normale, Trésor, rare, usure 4 ». Une bille active s'annonce sans ses familles ni
// sa rareté (describeSlotFocus), que dit la touche F.
export function marbleListLine(marble, rules, t) {
  return t("marbles.list.line", {
    name: marbleName(marble, t),
    size: sizeName(rules.types[marble].size, t),
    families: familyNames(marble, rules.types, t),
    rarity: rarityName(marble, rules.types, t),
    maxWear: rules.maxWearOf(marble),
  });
}

// L'annonce principale d'une bille hors du triangle : sa ligne (marbleListLine), puis
// « x sur y ». Le détail est dans sa fiche (marbles/view/card.js).
export function describeMarbleInList(marble, index, total, rules, t) {
  const line = marbleListLine(marble, rules, t);
  const position = formatMenuPosition(index, total, t);
  return position ? `${line}. ${position}` : `${line}.`;
}

// Une place de la main sous le curseur. Main vide : le dit.
export function describeHandFocus(game, index, rules, t) {
  if (game.hand.length === 0) return t("marbles.hand.empty");
  return describeMarbleInList(game.hand[index].marble, index, game.hand.length, rules, t);
}

// L'effet de phase de ce tour d'une bille active : la prévision si le tour se
// joue, sinon ce qu'elle a d'imprimé. null : la prévision la retire avant sa phase
// (une Fêlure, Empocher, Éjecter…), elle n'aura pas d'effet de phase.
function phaseText(game, slot, rules, t) {
  const predicted = rules.forecast(game);
  if (predicted.ok) return predicted.phases[slot] === null ? null : describeEffect(predicted.phases[slot], t);
  const { marble } = game.triangle[slot];
  return describePrinted(rules.effectAt(marble, slot), cardSituation(marble, 0, game.tally, game, rules.types), t, rules.statuses);
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
  const effect = phaseText(game, slot, rules, t);
  // Retirée avant sa phase : comme dans R, « pointe, argile : retirée avant sa phase. ».
  if (effect === null) return t("marbles.outcome.removed", { slot: slotName(slot, t), marble: marbleRef(placed.marble) });
  return t("marbles.slot_line.placing_occupied", { slot: slotName(slot, t), name: marbleName(placed.marble, t), effect });
}

// Le sac : combien il en reste, et combien en piochera le prochain début de tour,
// statuts compris (les règles, rules.nextTurnDraw).
export function describeBag(game, rules, t) {
  return t("marbles.state.bag", { count: game.bag.length, draw: rules.nextTurnDraw(game) });
}

// Le pot (touche P) : « 2 billes dans le pot, 1 bille perdue. ». Sa capacité se dit
// avec les autres caractéristiques (touche C, describeCharacteristics).
export function describePot(game, t) {
  return t("marbles.state.pot", { count: game.pot.length, lost: game.lost.length });
}

// Les CARACTÉRISTIQUES de la partie (touche C), chacune sur son maximum en vigueur,
// statuts compris (les règles, rules.characteristic) : « 2 sur 3 lancers, 3 sur 5
// billes en main, 0 sur 3 billes dans le pot. ». Les lancers comptés sont ceux qui
// restent ce tour (rules.throwsLeft).
export function describeCharacteristics(game, rules, t) {
  return t("marbles.state.characteristics", {
    throws: rules.throwsLeft(game),
    throwsMax: rules.characteristic(game, "throws"),
    hand: game.hand.length,
    handSize: rules.characteristic(game, "handSize"),
    pot: game.pot.length,
    potCapacity: rules.characteristic(game, "potCapacity"),
  });
}

export function describeDiscard(game, t) {
  return t("marbles.state.discard", { count: game.discard.length });
}

// Le tour (touche T) : « Tour 3 sur 10. », ou « Tour 5. » dans une partie sans
// limite de tours (une endurance).
export function describeTurn(game, t) {
  return t(turnLimit(game) === null ? "marbles.state.turn_unlimited" : "marbles.state.turn", { turn: game.turn, turnCount: turnLimit(game) });
}

// Le score et les compteurs du tour (touche I). Dans une partie où l'échange est
// permis (rules.swapEnabled), sa disponibilité aussi : rien d'autre ne permet de la
// savoir sans essayer.
export function describeScore(game, swapAvailable, rules, t) {
  const line = t("marbles.state.score", { score: game.score, speed: formatCounter(game.speed), mass: formatCounter(game.mass) });
  if (!rules.swapEnabled(game)) return line;
  return `${line} ${t(swapAvailable ? "marbles.state.swap_available" : "marbles.state.swap_unavailable")}`;
}

// L'ordre dans lequel le menu du sac se dit : alphabétique, sur le nom prononcé.
// Il ne doit jamais révéler l'ordre de la pioche : il ne dépend donc que du contenu
// du sac, et ne demande aucun hasard, ni celui de la partie ni un autre.
export function bagDisplayOrder(bag, t) {
  return [...bag].sort((a, b) => marbleName(a, t).localeCompare(marbleName(b, t)));
}
