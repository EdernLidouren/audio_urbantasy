// L'ÉQUIPEMENT (session.equipment) — troisième tiers de l'inventaire après
// l'argent (core/money.js) et le sac (core/bag.js) : des SLOTS NOMMÉS,
// { feet: <entrée ou null> }. Un objet est SOIT dans le sac SOIT équipé,
// JAMAIS les deux — equipItem/unequipItem (SEULS points d'écriture)
// composent removeItem/addItem (core/bag.js) avec l'écriture du slot,
// ATOMIQUEMENT, pour maintenir cet invariant.
//
// Forme d'une entrée de slot : { type } — EXACTEMENT la forme qu'une entrée
// de sac NON empilable prend déjà (core/bag.js) : un objet équipé garde sa
// propre représentation, seul son EMPLACEMENT change (sac -> slot). Tout
// objet equippable aujourd'hui est non empilable (voir core/items.js/
// ITEM_REGISTRY) ; équiper en retire toujours exactement 1 exemplaire du
// sac.
//
// EXTENSIBILITÉ : "feet" est le SEUL slot aujourd'hui, mais chaque slot est
// indépendant — ajouter "torse"/"tête" plus tard, c'est ajouter un nom à
// EQUIPMENT_SLOTS et un type d'objet `equippable:true, slot:"torse"`
// (core/items.js), jamais une refonte : equipItem/unequipItem/gaitOf ne
// connaissent jamais le NOMBRE de slots, ils lisent seulement le champ
// `slot` de l'objet concerné.

import { addItem, removeItem } from "./bag.js";
import { ITEM_REGISTRY, itemProps } from "./items.js";

export const EQUIPMENT_SLOTS = ["feet"];

// Équipement VIDE — tous les slots à null. Utilisé par core/save.js pour
// reboucher une sauvegarde antérieure à l'équipement (même précédent que
// bag: [] / money: 0) : dérivé de EQUIPMENT_SLOTS, jamais un littéral
// dupliqué, pour qu'ajouter un slot mette aussi ce filet à jour.
export function createEmptyEquipment() {
  return Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [slot, null]));
}

// Gait EFFECTIF du joueur — dérivation PURE, JAMAIS stockée (voir
// entities/player.js, qui ne porte plus aucun gait en dur) : l'objet équipé
// au slot "feet" porte-t-il un gait (ITEM_REGISTRY) ? oui -> ce gait ;
// sinon (slot vide, ou type retiré du registre entre-temps) -> "barefoot"
// (pieds nus, défaut). Relue à CHAQUE pas (voir
// view/audio/footsteps.js/playFootstep) : équiper/déséquiper change donc
// le pas SUIVANT automatiquement, sans notification ni code de synchro.
export function gaitOf(equipment) {
  const feet = equipment.feet;
  const props = feet && ITEM_REGISTRY[feet.type];
  return (props && props.gait) || "barefoot";
}

// Équipe l'objet `type` DEPUIS LE SAC vers son slot (ITEM_REGISTRY[type].slot)
// — retire du sac, place au slot, ATOMIQUEMENT. Slot DÉJÀ occupé -> l'ancien
// occupant retourne au sac (ÉCHANGE), jamais perdu ni écrasé silencieusement.
// `type` absent du registre, non equippable, ou absent du sac -> RÉFÉRENCE
// INCHANGÉE, jamais une exception (même politique défensive que
// removeItem/addItem, core/bag.js).
export function equipItem(session, type) {
  const props = ITEM_REGISTRY[type];
  if (!props || !props.equippable) return session;
  if (!session.bag.some((entry) => entry.type === type)) return session;

  const slot = props.slot;
  const previous = session.equipment[slot];

  let next = removeItem(session, type, 1);
  if (previous) next = addItem(next, previous.type, 1);

  return { ...next, equipment: { ...next.equipment, [slot]: { type } } };
}

// Déséquipe l'objet du slot `slot` -> le remet au sac (addItem), vide le
// slot. Slot déjà vide -> RÉFÉRENCE INCHANGÉE.
export function unequipItem(session, slot) {
  const current = session.equipment[slot];
  if (!current) return session;

  const withItemBack = addItem(session, current.type, 1);
  return { ...withItemBack, equipment: { ...withItemBack.equipment, [slot]: null } };
}

// Tags EFFECTIVEMENT portés — union des tags (core/items.js/ITEM_REGISTRY)
// de CHAQUE objet équipé, DÉRIVÉE, jamais stockée (même principe que
// gaitOf ci-dessus). UNIFIÉ joueur/compagnon/PNJ : cette fonction ignore
// tout du TYPE de porteur, elle ne connaît que la FORME `equipment` ({
// <slot>: <entrée>|null, ... }) — un futur compagnon/PNJ équipé
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
