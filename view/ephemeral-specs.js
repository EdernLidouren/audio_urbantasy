// DESCRIPTEURS D'ENTITÉS ÉPHÉMÈRES posées au sol par la vue (voir
// core/state.js/spawnEphemeral, spawnScatteredEphemerals ; doc/entity-model.md/
// "Entités éphémères"). La vue connaît le registre des types, le core non :
// c'est ici qu'un type devient un descripteur complet, de la forme que
// core/entity-parse.js/parseEntity donnerait à une instance sans surcharge.
//
// À fusionner un jour avec la résolution du core pour un objet générique au
// sol (core/entity-parse.js/genericItemDefaults) : deux chemins décident aujourd'hui
// du nom, de la description et des sons d'un objet posé.

import registry from "../entities/types/index.js";
import { ITEM_REGISTRY, itemSounds } from "../core/items.js";

// Descripteur d'un type du registre. `overrides.amount` / `overrides.count`
// remplacent ce seul champ dans `action` (jamais de fusion profonde), ex. une
// pièce de 20 au lieu des 5 par défaut. `sounds` est porté explicitement :
// le rendu audio lit `entity.sounds`, jamais le registre.
export function resolveEphemeralSpec(type, overrides = {}) {
  const typeDef = registry[type];
  let action = typeDef.action;
  if (overrides.amount !== undefined) action = { ...action, amount: overrides.amount };
  if (overrides.count !== undefined) action = { ...action, count: overrides.count };
  return {
    type,
    labelKey: typeDef.nameKey,
    descriptionKey: typeDef.descriptionKey,
    sounds: typeDef.sounds,
    blocksMovement: Boolean(typeDef.blocksMovement),
    observable: Boolean(typeDef.observable),
    interactable: Boolean(typeDef.interactable),
    action,
  };
}

// Pièce de test (touche "e" en mode debug).
export const EPHEMERAL_COIN_SPEC = resolveEphemeralSpec("money");

// Objet du SAC posé au sol ("Poser", voir view/menus/inventory-menu.js) :
//   - avec un archétype du même nom (ex. "apple") : cet archétype, avec
//     `count` dans l'action ;
//   - sinon (ex. "key_bronze") : l'archétype GÉNÉRIQUE "item" pour le type
//     d'entité, avec le nom, la description et l'action de l'objet, et ses
//     sons s'il en déclare (core/items.js/itemSounds).
export function resolveDroppedItemSpec(type, count) {
  if (registry[type]) {
    return resolveEphemeralSpec(type, { count });
  }
  const props = ITEM_REGISTRY[type];
  const generic = registry.item;
  return {
    type: "item",
    labelKey: props.label,
    descriptionKey: props.descriptionKey,
    sounds: itemSounds(type) ?? generic.sounds,
    blocksMovement: Boolean(generic.blocksMovement),
    observable: Boolean(generic.observable),
    interactable: Boolean(generic.interactable),
    action: { kind: "pickup", item: type, count },
  };
}
