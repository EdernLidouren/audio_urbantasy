// La FORME de l'équipement (session.equipment), sans écriture : ses slots,
// l'équipement vide et les tags qu'il fait porter. À part de core/equipment.js,
// dont les écritures (equipItem/unequipItem) composent avec le sac
// (core/bag.js) : l'état (core/state.js) et les conditions (core/presence.js)
// lisent la forme sans dépendre du sac, ce qui évite un cycle d'imports
// (sac -> état -> équipement -> sac). Détail de l'équipement : en-tête de
// core/equipment.js, doc/entity-model.md/"Équipement".

import { itemProps } from "./items.js";

export const EQUIPMENT_SLOTS = ["feet"];

// Équipement VIDE — tous les slots à null. Utilisé par core/save.js pour
// reboucher une sauvegarde antérieure à l'équipement (même précédent que
// bag: [] / money: 0) : dérivé de EQUIPMENT_SLOTS, jamais un littéral
// dupliqué, pour qu'ajouter un slot mette aussi ce filet à jour.
export function createEmptyEquipment() {
  return Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [slot, null]));
}

// Tags EFFECTIVEMENT portés — union des tags (core/items.js/ITEM_REGISTRY)
// de CHAQUE objet équipé, DÉRIVÉE, jamais stockée (même principe que
// core/equipment.js/gaitOf). UNIFIÉ joueur/compagnon/PNJ : cette fonction
// ignore tout du TYPE de porteur, elle ne connaît que la FORME `equipment`
// ({ <slot>: <entrée>|null, ... }) — un futur compagnon/PNJ équipé
// l'utiliserait EXACTEMENT comme le joueur (equippedTags(entity.equipment)),
// aucun cas spécial à écrire. Slot vide ou type sans tags -> ignoré, jamais
// une exception (même repli défensif que gaitOf).
export function equippedTags(equipment) {
  const tags = new Set();
  for (const occupant of Object.values(equipment)) {
    if (!occupant) continue;
    const props = itemProps(occupant.type);
    for (const tag of (props && props.tags) || []) tags.add(tag);
  }
  return tags;
}
