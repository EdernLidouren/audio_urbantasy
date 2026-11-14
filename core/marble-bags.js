// LES SACS DE BILLES DU JOUEUR dans la partie : le seul endroit où Templeton connaît
// les sacs du jeu des billes (doc/marbles.md, « Sacs » ; doc/save.md). La session les
// porte, donc la sauvegarde :
//
//   session.marbleBags = { slots: [sac | null, ...], lastUsed: id | null }
//   slots     BAG_SLOTS emplacements (marbles/config/values.js), chacun vide (null)
//             ou un sac au format du jeu des billes (marbles/core/bags.js), dont l'id
//             est celui de l'emplacement (`slot-1`…) ;
//   lastUsed  l'id du dernier sac avec lequel une partie de billes a été lancée (un
//             sac du joueur ou un sac préfait), ou null.
//
// Rien d'autre : la VALIDITÉ d'un sac se calcule à la lecture, par le jeu des billes
// (marbles/core/bag-editing.js/bagStatus), jamais enregistrée ; les règles de
// construction et les opérations du joueur vivent dans marbles/. Ce module ne lit que
// le FORMAT d'un sac (marbles/core/bags.js, pur, sans contenu). Pur.

import { BAG_SLOTS } from "../marbles/config/values.js";
import { emptyBagSlots, repairBagRecord, slotBagId } from "../marbles/core/bags.js";

// Les sacs d'une partie neuve : tous les emplacements vides, aucun dernier sac.
export function createMarbleBags() {
  return { slots: emptyBagSlots(BAG_SLOTS), lastUsed: null };
}

export function marbleBagsOf(session) {
  return session.marbleBags;
}

// La session dont les sacs sont `marbleBags` (une copie, la session reçue intacte).
export function withMarbleBags(session, marbleBags) {
  return { ...session, marbleBags };
}

// LA RELECTURE d'une sauvegarde (core/save.js/deserializeGame) : ses sacs remis en
// forme sans jamais lever ni rien perdre en silence. `renames` : les ids de billes
// renommés (config/save-renames.js, chaînes résolues). -> { data, repairs } :
// `repairs`, une entrée { slot, problem } par changement (slot : son numéro, à partir
// de 1 ; null pour l'ensemble), signalée au joueur (view/debug-warnings.js). Un sac
// qui cite une bille inconnue se garde tel quel : il sera invalide, pas réparé.
export function repairMarbleBags(data, renames = {}) {
  const raw = data.marbleBags;
  const repairs = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { data: { ...data, marbleBags: createMarbleBags() }, repairs: [{ slot: null, problem: "sacs de billes illisibles, emplacements vidés" }] };
  }
  const rawSlots = Array.isArray(raw.slots) ? raw.slots : [];
  if (!Array.isArray(raw.slots)) repairs.push({ slot: null, problem: "emplacements de sacs illisibles, vidés" });
  rawSlots.slice(BAG_SLOTS).forEach((extra, offset) => {
    if (extra !== null) repairs.push({ slot: BAG_SLOTS + offset + 1, problem: "emplacement en trop, sac retiré" });
  });
  const slots = emptyBagSlots(BAG_SLOTS).map((empty, index) => {
    const stored = rawSlots[index] ?? null;
    if (stored === null) return null;
    const { bag, problems } = repairBagRecord(stored, slotBagId(index), renames);
    for (const problem of problems) repairs.push({ slot: index + 1, problem });
    return bag;
  });
  let lastUsed = raw.lastUsed ?? null;
  if (lastUsed !== null && typeof lastUsed !== "string") {
    repairs.push({ slot: null, problem: "dernier sac utilisé illisible, oublié" });
    lastUsed = null;
  }
  if (repairs.length === 0 && raw.slots === rawSlots && rawSlots.length === BAG_SLOTS && Object.keys(raw).length === 2 && sameSlots(rawSlots, slots)) return { data, repairs };
  return { data: { ...data, marbleBags: { slots, lastUsed } }, repairs };
}

// Des emplacements identiques (rien à réécrire : la session reçue est rendue telle
// quelle).
function sameSlots(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
