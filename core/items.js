// OBJETS DU SAC — les règles du registre des objets (config/items-values.js, la
// donnée) : sa validation au chargement (validateItemRegistry, appelée plus bas),
// l'accès à un objet, ses sons au sol et sa valeur.

import { TAG_REGISTRY } from "../config/tags-values.js";
import { rejectUnknownFields } from "../lib/validate.js";
import { ITEM_REGISTRY } from "../config/items-values.js";

// Propriétés d'UN objet par son type — point d'extension futur (même
// principe que core/surfaces.js/surfaceProps) : un appelant qui voudra lire
// `usable` demain appelle EXACTEMENT cette fonction, rien à ajouter ici.
// Type inconnu -> undefined, jamais d'exception (voir core/bag.js/addItem,
// qui s'en accommode déjà en dégradant sur "non empilable").
export function itemProps(type) {
  return ITEM_REGISTRY[type];
}

// Sons d'un objet AU SOL, déduits de son champ `sound` (un pool) : beacon en
// boucle, et le même son joué une fois au ramassage. Objet sans `sound` (ou
// inconnu) -> undefined : l'appelant garde alors les sons de l'archétype
// (générique "item", voir entities/types/item.js). Appelé par
// core/entity-parse.js/genericItemDefaults, par où passent toutes les
// façons dont un objet devient une entité : instance de scène, garnissage
// (core/spawn.js), objet posé depuis le sac (core/spawn.js/ephemeralItemSpec).
export function itemSounds(type) {
  const props = ITEM_REGISTRY[type];
  if (!props || !props.sound) return undefined;
  return { beacon: { path: props.sound, loop: true }, pickup: { path: props.sound } };
}

// Champs d'un objet (voir l'en-tête) ; tout autre champ est rejeté.
const ITEM_FIELDS = ["stackable", "nameKey", "descriptionKey", "value", "rarity", "tags", "sound", "equippable", "slot", "gait"];

function failItems(message) {
  throw new Error(`core/items.js: ${message}`);
}

// Valide un registre d'objets : aucun champ inconnu (ITEM_FIELDS), et tout
// tag référencé par CHAQUE objet existe dans
// TAG_REGISTRY — même principe que la validation des surfaces contre
// SURFACE_REGISTRY (core/scene.js), mais ITEM_REGISTRY est du CODE, pas du
// contenu JSON passé à un parseur : ce module se valide donc LUI-MÊME, tout
// de suite (voir l'appel plus bas), plutôt que de dépendre d'un chemin de
// chargement externe. Exporté (plutôt qu'un IIFE anonyme) pour rester
// TESTABLE au terminal avec un registre de test (voir core/checks/inventory.check.js)
// sans avoir à corrompre ITEM_REGISTRY lui-même. Faute de frappe -> échec
// CLAIR (tag + objet concerné), jamais un mismatch silencieux découvert en
// jeu.
export function validateItemRegistry(registry) {
  for (const [type, props] of Object.entries(registry)) {
    rejectUnknownFields(props, ITEM_FIELDS, `objet "${type}"`, failItems);
    for (const tag of props.tags || []) {
      if (!TAG_REGISTRY[tag]) {
        throw new Error(`core/items.js: tag "${tag}" (objet "${type}") absent de TAG_REGISTRY.`);
      }
    }
  }
}

validateItemRegistry(ITEM_REGISTRY);

// Valeur marchande d'un type d'objet (`value` du registre) — 0 si l'objet
// est inconnu ou sans valeur entière positive. Lue par la vente (prix de
// rachat) et par l'achat (prix par défaut d'un article de catalogue).
export function itemValue(type) {
  const value = ITEM_REGISTRY[type] && ITEM_REGISTRY[type].value;
  return Number.isInteger(value) && value > 0 ? value : 0;
}
