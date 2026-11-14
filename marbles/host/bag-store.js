// JEU DES BILLES, HÔTE — le MAGASIN DES SACS DU JOUEUR : ses emplacements (BAG_SLOTS,
// marbles/config/values.js), chacun vide (null) ou un sac (format :
// marbles/core/bags.js). L'interface que le minijeu attend d'un magasin :
//
//   list()            les emplacements, une copie : [sac | null, ...] ;
//   read(index)       l'emplacement `index` : une copie du sac, ou null ;
//   write(index, bag) y range `bag` (une copie ; un sac mal formé lève) ;
//   clear(index)      le vide.
//
// Un indice hors des emplacements lève. PROVISOIRE : le seul magasin est en MÉMOIRE,
// perdu au rechargement ; les emplacements iront dans la sauvegarde de Templeton
// (doc/marbles.md, « Sacs »). Aucune interface de construction de sac ne s'en sert
// encore.

import { emptyBagSlots, withBagSlot } from "../core/bags.js";
import { BAG_SLOTS } from "../config/values.js";

// Un magasin en mémoire, de `count` emplacements tous vides (ou `initial`, une liste
// d'emplacements, copiée).
export function createMemoryBagStore({ count = BAG_SLOTS, initial = null } = {}) {
  let slots = emptyBagSlots(count);
  if (initial !== null) initial.forEach((bag, index) => (slots = withBagSlot(slots, index, bag)));
  const check = (index) => withBagSlot(slots, index, null);
  return Object.freeze({
    list: () => structuredClone(slots),
    read: (index) => {
      check(index);
      return structuredClone(slots[index]);
    },
    write: (index, bag) => {
      slots = withBagSlot(slots, index, bag);
    },
    clear: (index) => {
      slots = withBagSlot(slots, index, null);
    },
  });
}
