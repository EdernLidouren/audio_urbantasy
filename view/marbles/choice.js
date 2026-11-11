// Jeu des billes : l'INTERFACE DE CHOIX, quand un effet laisse le joueur choisir sa
// cible (core/marbles.js, `pendingChoice`). Pur, sans DOM ni son : l'écran
// (view/marbles/screen.js) y lit ce que le curseur propose, ce qu'il dit et la
// réponse qu'Entrée envoie ; c'est la même navigation que l'écran habituel.
//
// - MAIN : un menu horizontal des SEULES billes éligibles, dans l'ordre de la main,
//   suivies de « Terminer » en mode « jusqu'à N ».
// - TRIANGLE : la même géométrie que l'écran (pointe en haut, les deux bases en
//   dessous) et la même navigation (view/marbles/navigation.js). Les emplacements
//   non éligibles restent accessibles, pour garder le repère, mais se disent « Non
//   éligible. » et ne se valident pas.
// - Les deux zones : on passe de l'une à l'autre comme d'habitude, le nom de la zone
//   annoncé ; une seule : l'autre n'existe pas pour le curseur.
// Le curseur est celui de l'écran ({ place, handIndex, lastBase }) ; dans la main,
// `handIndex` est la place dans le menu du choix, pas dans la main.

import { SLOTS } from "../../core/marbles.js";
import { formatMenuPosition } from "../../lib/menu.js";
import { cursorOn, stepCursor, zoneOf } from "./navigation.js";
import { describeMarbleInList, describeSlotFocus } from "./narration.js";

// Les zones du choix en attente.
function hasZone(pending, zone) {
  return pending.zones.includes(zone);
}

// Le menu de la main pendant un choix : les billes éligibles, chacune { kind:
// "marble", index (sa place dans la main), marble }, puis { kind: "finish" } en mode
// « jusqu'à N ». Vide si la main n'est pas une zone du choix.
export function choiceHandOptions(pending) {
  if (!hasZone(pending, "hand")) return [];
  const marbles = pending.eligible.filter((target) => target.zone === "hand").map(({ index, marble }) => ({ kind: "marble", index, marble }));
  return pending.upTo ? [...marbles, { kind: "finish" }] : marbles;
}

// Un emplacement est-il éligible ?
function isSlotEligible(pending, slot) {
  return pending.eligible.some((target) => target.zone === "triangle" && target.slot === slot);
}

// Où s'ouvre le curseur d'un choix : sur la première option de la main si la main en
// est une zone, sinon sur le premier emplacement éligible.
export function choiceStartCursor(pending, cursor) {
  if (hasZone(pending, "hand")) return { ...cursor, place: "hand", handIndex: 0 };
  return cursorOn(cursor, SLOTS.find((slot) => isSlotEligible(pending, slot)) ?? SLOTS[0]);
}

// Un pas vertical (ou sur le triangle) du curseur pendant un choix, ou null : comme
// l'écran, sans jamais entrer dans une zone qui n'est pas celle du choix.
export function stepChoiceCursor(pending, cursor, direction) {
  const next = stepCursor(cursor, direction, !hasZone(pending, "hand"));
  if (next === null || !hasZone(pending, zoneOf(next.place))) return null;
  return next;
}

// L'option de la main sous le curseur, ou null.
function handOption(pending, cursor) {
  return cursor.place === "hand" ? (choiceHandOptions(pending)[cursor.handIndex] ?? null) : null;
}

// La bille sous le curseur pendant un choix ({ marble, turnsInHand }), pour sa fiche
// et ses mots-clés, ou null (Terminer, emplacement vide).
export function choiceMarbleAt(game, cursor) {
  const pending = game.pendingChoice;
  if (cursor.place === "hand") {
    const option = handOption(pending, cursor);
    return option?.kind === "marble" ? game.hand[option.index] : null;
  }
  const placed = game.triangle[cursor.place];
  return placed === null ? null : { marble: placed.marble, turnsInHand: 0 };
}

// Ce que dit le curseur pendant un choix : une bille éligible de la main (sa
// position comptée dans le menu du choix), « Terminer », ou un emplacement, suivi de
// « Non éligible. » s'il ne se valide pas.
export function choiceFocusLine(game, cursor, rules, t) {
  const pending = game.pendingChoice;
  if (cursor.place === "hand") {
    const options = choiceHandOptions(pending);
    const option = options[cursor.handIndex];
    if (option.kind === "finish") {
      const position = formatMenuPosition(cursor.handIndex, options.length, t);
      return position ? `${t("marbles.choice.finish")}. ${position}` : `${t("marbles.choice.finish")}.`;
    }
    return describeMarbleInList(option.marble, cursor.handIndex, options.length, rules, t);
  }
  const line = describeSlotFocus(game, cursor.place, rules, t);
  return isSlotEligible(pending, cursor.place) ? line : `${line} ${t("marbles.choice.not_eligible")}`;
}

// La réponse qu'Entrée envoie sous ce curseur : { action } (l'action « choisir » du
// réducteur), ou { refusal: "notEligible" } sur un emplacement non éligible.
export function choiceAnswer(pending, cursor) {
  if (cursor.place === "hand") {
    const option = handOption(pending, cursor);
    if (option === null) return { refusal: "notEligible" };
    return option.kind === "finish" ? { action: { type: "choose", done: true } } : { action: { type: "choose", target: { zone: "hand", index: option.index } } };
  }
  if (!isSlotEligible(pending, cursor.place)) return { refusal: "notEligible" };
  return { action: { type: "choose", target: { zone: "triangle", slot: cursor.place } } };
}
