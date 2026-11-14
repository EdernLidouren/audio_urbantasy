// JEU DES BILLES — la GESTION DES SACS DU JOUEUR : les opérations sur ses emplacements
// et sur un sac (format, règles et problèmes : marbles/core/bags.js). Pur : chaque
// opération rend un résultat neuf, jamais une modification de ce qu'elle reçoit, et
// valide ses entrées.
//
// RÉSULTATS : { ok: true, ... } (les emplacements ou le sac neufs), ou un REFUS
// { ok: false, error, ... } (BAG_EDIT_REFUSALS), que la vue dit
// (`marbles.bagEdit.<error>`, marbles/view/narration/bags.js). Un indice hors des
// emplacements ou un sac mal formé LÈVENT : des fautes de programmation, pas un geste
// du joueur.
//
// LES SACS DU JOUEUR : chacun vit dans un emplacement, dont il tire son id
// (slotBagId : `slot-1` à `slot-5`) et son nom générique (« sac 1 »,
// marbles/view/narration/bags.js). Une copie d'un sac préfait ou d'un autre sac prend
// l'id de SON emplacement, sans nom : le champ `name` attend une future saisie de
// texte, aucune opération ne l'écrit.
//
// BROUILLONS : un sac invalide (trop petit, une bille inconnue…) s'enregistre ; sa
// validité se CALCULE à la lecture (bagStatus), elle n'est jamais enregistrée. Il ne se
// joue pas : la partie le refuse (marbles/core/marbles.js/startMarblesGame).
//
// AUCUNE RÈGLE ICI : ajouter un exemplaire passe le sac candidat à la validation
// existante (marbles/core/bags.js/bagProblems), et refuse sur le problème que
// l'ajout ferait apparaître : une règle de construction ajoutée y vaut aussitôt.

import { bagProblems, bagSize, slotBagId, validateBagFormat, withBagSlot } from "./bags.js";

// Les refus (en-tête) et leurs paramètres :
//   slotOccupied  { slot }           l'emplacement visé n'est pas vide ;
//   slotEmpty     { slot }           l'emplacement visé est vide ;
//   unknownMarble { marble }         une bille absente du catalogue ;
//   lockedMarble  { marble }         une bille que la collection n'a pas débloquée ;
//   bagFull       { size, max }      le sac a atteint sa taille maximale ;
//   maxCopies     { marble, max }    la bille a atteint le maximum de sa rareté ;
//   notInBag      { marble }         la bille n'est pas dans le sac.
export const BAG_EDIT_REFUSALS = Object.freeze(["slotOccupied", "slotEmpty", "unknownMarble", "lockedMarble", "bagFull", "maxCopies", "notInBag"]);

function refuse(error, params = {}) {
  return { ok: false, error, ...params };
}

// Un indice d'emplacement valide, ou une erreur.
function checkSlot(slots, index) {
  if (!Number.isInteger(index) || index < 0 || index >= slots.length) throw new Error(`marbles : emplacement de sac ${index} hors de 0 à ${slots.length - 1}.`);
}

// Les indices des emplacements vides, dans l'ordre.
export function emptySlotIndexes(slots) {
  return slots.flatMap((slot, index) => (slot === null ? [index] : []));
}

// --- Les emplacements ---

// Un SAC VIDE dans l'emplacement vide `index`.
export function createEmptyBag(slots, index) {
  return copyBagToSlot(slots, index, { id: "empty", marbles: [] });
}

// La COPIE de `source` (un sac préfait, ou un sac du joueur) dans l'emplacement vide
// `index` : sa composition, l'id de l'emplacement, aucun nom.
export function copyBagToSlot(slots, index, source) {
  checkSlot(slots, index);
  validateBagFormat(source);
  if (slots[index] !== null) return refuse("slotOccupied", { slot: index });
  const bag = { id: slotBagId(index), marbles: structuredClone(source.marbles) };
  return { ok: true, slots: withBagSlot(slots, index, bag), bag };
}

// La DUPLICATION du sac de l'emplacement `from` dans l'emplacement vide `to`.
export function duplicateBag(slots, from, to) {
  checkSlot(slots, from);
  if (slots[from] === null) return refuse("slotEmpty", { slot: from });
  return copyBagToSlot(slots, to, slots[from]);
}

// La SUPPRESSION du sac de l'emplacement `index`.
export function deleteBag(slots, index) {
  checkSlot(slots, index);
  if (slots[index] === null) return refuse("slotEmpty", { slot: index });
  return { ok: true, slots: withBagSlot(slots, index, null) };
}

// L'ENREGISTREMENT de `bag` (une copie de travail de l'éditeur) dans l'emplacement
// `index`, celui dont il porte l'id.
export function storeBag(slots, index, bag) {
  checkSlot(slots, index);
  if (bag.id !== slotBagId(index)) throw new Error(`marbles : le sac "${bag.id}" n'est pas celui de l'emplacement ${index} (${slotBagId(index)}).`);
  return { ok: true, slots: withBagSlot(slots, index, bag) };
}

// --- Un sac ---

// Le nombre d'exemplaires de `marble` dans `bag`.
export function copiesOf(bag, marble) {
  return bag.marbles.find((entry) => entry.marble === marble)?.count ?? 0;
}

// `bag` avec `count` exemplaires de `marble` : l'entrée garde sa place, une bille
// nouvelle s'ajoute à la fin, une entrée à 0 disparaît.
function withCopies(bag, marble, count) {
  const present = bag.marbles.some((entry) => entry.marble === marble);
  const marbles = present ? bag.marbles.map((entry) => (entry.marble === marble ? { marble, count } : entry)) : [...bag.marbles, { marble, count }];
  return { ...bag, marbles: marbles.filter((entry) => entry.count > 0) };
}

// Le refus d'un ajout d'après le problème qu'il ferait apparaître.
const ADD_REFUSALS = {
  unknownMarble: ({ marble }) => refuse("unknownMarble", { marble }),
  lockedMarble: ({ marble }) => refuse("lockedMarble", { marble }),
  bagTooLarge: ({ max }) => refuse("bagFull", { size: max, max }),
  tooManyCopies: ({ marble, max }) => refuse("maxCopies", { marble, max }),
};

// AJOUTER un exemplaire de `marble` à `bag`. `context` : { types, rules, unlocked },
// le catalogue, les règles de construction qui s'appliquent, les billes débloquées
// (null : toutes). Refusé si la bille est inconnue ou non débloquée, si le sac a
// atteint sa taille maximale, ou la bille le maximum de sa rareté (dans cet ordre, celui
// des problèmes). -> { ok, bag, count } (le nombre d'exemplaires après l'ajout).
export function addMarble(bag, marble, { types, rules, unlocked = null }) {
  validateBagFormat(bag);
  const count = copiesOf(bag, marble) + 1;
  const candidate = withCopies(bag, marble, count);
  const blocking = bagProblems(candidate, rules, { types, unlocked }).find(
    (problem) => problem.code === "bagTooLarge" || (problem.marble === marble && Object.hasOwn(ADD_REFUSALS, problem.code))
  );
  if (blocking !== undefined) return ADD_REFUSALS[blocking.code](blocking);
  return { ok: true, bag: candidate, count };
}

// RETIRER un exemplaire de `marble` de `bag` ; son dernier exemplaire retiré, son
// entrée disparaît. Toujours permis tant que la bille y est, inconnue comprise.
// -> { ok, bag, count } (le nombre d'exemplaires après le retrait).
export function removeMarble(bag, marble) {
  validateBagFormat(bag);
  const count = copiesOf(bag, marble);
  if (count === 0) return refuse("notInBag", { marble });
  return { ok: true, bag: withCopies(bag, marble, count - 1), count: count - 1 };
}

// L'ÉTAT d'un sac : sa taille, ses problèmes, valide ou non (calculé, jamais
// enregistré). `context` : comme addMarble.
export function bagStatus(bag, { types, rules, unlocked = null }) {
  const problems = bagProblems(bag, rules, { types, unlocked });
  return { size: bagSize(bag), problems, valid: problems.length === 0 };
}

// Deux sacs de même COMPOSITION (mêmes billes, mêmes exemplaires), quel que soit
// l'ordre : la copie de travail de l'éditeur a-t-elle changé ?
export function sameComposition(a, b) {
  const counts = (bag) => JSON.stringify([...bag.marbles].sort((x, y) => (x.marble < y.marble ? -1 : 1)).map(({ marble, count }) => [marble, count]));
  return counts(a) === counts(b);
}
