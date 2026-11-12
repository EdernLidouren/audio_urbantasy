// Jeu des billes : l'INTERFACE DE CHOIX, quand un effet laisse le joueur choisir sa
// cible (marbles/core/marbles.js, `pendingChoice`). Pur, sans DOM ni son : l'écran
// (marbles/view/screen.js) y lit ce que le curseur propose, ce qu'il dit et la
// réponse qu'Entrée envoie ; c'est la même navigation que l'écran habituel.
//
// - MAIN, ou DÉFAUSSE : un menu horizontal des SEULES billes éligibles, dans l'ordre
//   de la main, ou dans l'ordre d'arrivée à la défausse, suivies de « Terminer » en
//   mode « jusqu'à N ». Un choix n'a jamais les deux : leur menu prend la place du
//   curseur dans la main (`place: "hand"`).
// - TRIANGLE : la même géométrie que l'écran (pointe en haut, les deux bases en
//   dessous) et la même navigation (marbles/view/navigation.js). Les emplacements
//   non éligibles restent accessibles, pour garder le repère, mais se disent « Non
//   éligible. » et ne se valident pas. L'emplacement que vise une bille EN TRANSIT
//   (en cours de lancer, pendingChoice.inTransit) l'annonce après son contenu,
//   « En approche : loupe. », pour information : elle n'est jamais une cible.
// - Les deux zones : on passe de l'une à l'autre comme d'habitude, le nom de la zone
//   annoncé ; une seule : l'autre n'existe pas pour le curseur.
// Le curseur est celui de l'écran ({ place, handIndex, lastBase }) ; dans la main,
// `handIndex` est la place dans le menu du choix, pas dans la main.

import { SLOTS } from "../core/marbles.js";
import { formatMenuPosition } from "../../lib/menu.js";
import { cursorOn, stepCursor, zoneOf } from "./navigation.js";
import { describeMarbleInList, describeSlotFocus, marbleName } from "./narration.js";

// Les zones dont le choix se fait dans un MENU HORIZONTAL, à la place du curseur dans
// la main : la main, la défausse.
const LIST_ZONES = ["hand", "discard"];

// Les zones du choix en attente ; la place "hand" du curseur est celle du menu.
function hasZone(pending, zone) {
  if (zone === "hand") return pending.zones.some((listed) => LIST_ZONES.includes(listed));
  return pending.zones.includes(zone);
}

// Le menu du choix (main ou défausse) : les billes éligibles, chacune { kind:
// "marble", zone, index (sa place dans sa zone), marble }, puis { kind: "finish" } en
// mode « jusqu'à N ». Vide si ni la main ni la défausse ne sont une zone du choix.
export function choiceHandOptions(pending) {
  if (!hasZone(pending, "hand")) return [];
  const marbles = pending.eligible
    .filter((target) => LIST_ZONES.includes(target.zone))
    .map(({ zone, index, marble }) => ({ kind: "marble", zone, index, marble }));
  return pending.upTo ? [...marbles, { kind: "finish" }] : marbles;
}

// L'entrée sous une option du menu du choix : sa bille, avec son compteur de tours
// en main (0 à la défausse), et sa place dans sa zone ; null pour Terminer.
export function choiceListEntry(game, option) {
  if (option?.kind !== "marble") return null;
  if (option.zone === "discard") return { marble: game.discard[option.index], turnsInHand: 0, zone: "discard", index: option.index };
  return { ...game.hand[option.index], zone: "hand", index: option.index };
}

// Un emplacement est-il éligible ?
function isSlotEligible(pending, slot) {
  return pending.eligible.some((target) => target.zone === "triangle" && target.slot === slot);
}

// La main a-t-elle des options dans ce choix ? Une zone du choix peut n'en avoir
// aucune (aucune bille éligible en main, ou la dernière déjà choisie) : le curseur
// n'y entre alors jamais.
function handHasOptions(pending) {
  return choiceHandOptions(pending).length > 0;
}

// Où s'ouvre le curseur d'un choix : sur la première option de la main si la main en
// a, sinon sur le premier emplacement éligible.
export function choiceStartCursor(pending, cursor) {
  if (handHasOptions(pending)) return { ...cursor, place: "hand", handIndex: 0 };
  return cursorOn(cursor, SLOTS.find((slot) => isSlotEligible(pending, slot)) ?? SLOTS[0]);
}

// Où reste le curseur après une réponse qui n'a pas fini le choix : sur sa place si
// elle a encore des options (l'index borné par l'écran), sinon où le choix s'ouvre.
export function choiceCursorAfterAnswer(pending, cursor) {
  if (cursor.place === "hand" && !handHasOptions(pending)) return choiceStartCursor(pending, cursor);
  return cursor;
}

// Un pas vertical (ou sur le triangle) du curseur pendant un choix, ou null : comme
// l'écran, sans jamais entrer dans une zone qui n'est pas celle du choix, ni dans
// une main sans option.
export function stepChoiceCursor(pending, cursor, direction) {
  const next = stepCursor(cursor, direction, !handHasOptions(pending));
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
    const entry = choiceListEntry(game, handOption(pending, cursor));
    return entry === null ? null : { marble: entry.marble, turnsInHand: entry.turnsInHand };
  }
  const placed = game.triangle[cursor.place];
  return placed === null ? null : { marble: placed.marble, turnsInHand: 0 };
}

// Les billes en transit qui visent `slot`, dites après son contenu : « En approche :
// loupe. ». Rien si aucune ne le vise. La règle (qui est en transit, et vers où) est
// celle du core ; la vue ne fait que la dire.
function approachLines(pending, slot, t) {
  return pending.inTransit
    .filter((transit) => transit.slot === slot)
    .map((transit) => t(`marbles.choice.in_transit.${transit.kind}`, { name: marbleName(transit.marble, t) }));
}

// Ce que dit le curseur pendant un choix : une bille éligible de la main (sa
// position comptée dans le menu du choix), « Terminer », ou un emplacement, suivi
// des billes en approche, puis de « Non éligible. » s'il ne se valide pas.
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
  const parts = [describeSlotFocus(game, cursor.place, rules, t), ...approachLines(pending, cursor.place, t)];
  if (!isSlotEligible(pending, cursor.place)) parts.push(t("marbles.choice.not_eligible"));
  return parts.join(" ");
}

// La réponse qu'Entrée envoie sous ce curseur : { action } (l'action « choisir » du
// réducteur), ou { refusal: "notEligible" } sur un emplacement non éligible.
export function choiceAnswer(pending, cursor) {
  if (cursor.place === "hand") {
    const option = handOption(pending, cursor);
    if (option === null) return { refusal: "notEligible" };
    return option.kind === "finish" ? { action: { type: "choose", done: true } } : { action: { type: "choose", target: { zone: option.zone, index: option.index } } };
  }
  if (!isSlotEligible(pending, cursor.place)) return { refusal: "notEligible" };
  return { action: { type: "choose", target: { zone: "triangle", slot: cursor.place } } };
}
