// JEU DES BILLES, HÔTE — le MAGASIN DES SACS DU JOUEUR : ses emplacements (BAG_SLOTS,
// marbles/config/values.js), chacun vide (null) ou un sac (format :
// marbles/core/bags.js), et l'id du dernier sac utilisé. L'interface que le minijeu
// attend d'un magasin, où qu'il garde ses données :
//
//   available()      vrai si des sacs du joueur existent ici (faux : aucune partie
//                    sauvegardée, ses écrans le disent) ;
//   slots()          les emplacements, une copie : [sac | null, ...] ;
//   lastUsed()       l'id du dernier sac utilisé, ou null ;
//   saveSlots(slots) enregistre les emplacements (une copie ; mal formés : erreur) ;
//   setLastUsed(id)  enregistre le dernier sac utilisé.
//
// Les OPÉRATIONS du joueur (créer, dupliquer, ajouter une bille…) sont pures
// (marbles/core/bag-editing.js) : l'écran les applique aux emplacements lus, puis les
// enregistre ici. Le magasin ne connaît ni les règles ni le catalogue.
//
// Deux magasins : createBagStore, sur une ÉCRITURE et une LECTURE reçues (le jeu :
// la sauvegarde de Templeton, session.marbleBags, câblée par main.js), et
// createMemoryBagStore, en mémoire (les vérifications, les outils).

import { emptyBagSlots, withBagSlot } from "../core/bags.js";
import { BAG_SLOTS } from "../config/values.js";

// Les emplacements `slots` vérifiés (chaque sac bien formé), en copie.
function checkedSlots(slots) {
  return slots.reduce((checked, bag, index) => withBagSlot(checked, index, bag), emptyBagSlots(slots.length));
}

// Un magasin sur `read()` (-> { slots, lastUsed }, ou null s'il n'y a pas de sacs du
// joueur ici) et `write({ slots, lastUsed })`.
export function createBagStore({ read, write }) {
  const current = () => {
    const record = read();
    if (record === null) throw new Error("marbles : aucun sac du joueur ici (available() est faux).");
    return record;
  };
  return Object.freeze({
    available: () => read() !== null,
    slots: () => structuredClone(current().slots),
    lastUsed: () => current().lastUsed,
    saveSlots: (slots) => write({ ...current(), slots: checkedSlots(slots) }),
    setLastUsed: (id) => write({ ...current(), lastUsed: id }),
  });
}

// Un magasin en mémoire, de `count` emplacements tous vides (ou `initial`, une liste
// d'emplacements, copiée).
export function createMemoryBagStore({ count = BAG_SLOTS, initial = null } = {}) {
  let record = { slots: initial === null ? emptyBagSlots(count) : checkedSlots(initial), lastUsed: null };
  return createBagStore({
    read: () => record,
    write: (next) => {
      record = structuredClone(next);
    },
  });
}
