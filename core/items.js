import { TAG_REGISTRY } from "./tags.js";

// Registre d'OBJETS DU SAC — données pures, CORE (comme SURFACE_REGISTRY,
// voir core/surfaces.js) : le core en a besoin STRUCTURELLEMENT pour
// décider comment une entrée de sac se comporte (empilable ou non, voir
// core/bag.js/addItem), pas seulement pour l'affichage — contrairement au
// registre de types d'entités (entities/types/index.js), contenu de RENDU
// pur que le core n'importe JAMAIS (voir CLAUDE.md, "Réglages en
// cascade"). label/descriptionKey sont lus par la VUE (menu d'inventaire,
// voir view/menus/inventory-menu.js) mais restent ici, dans ce MÊME
// registre : un objet et ses métadonnées d'affichage sont une seule et
// même donnée de contenu, pas deux registres séparés à garder synchronisés.
//
// EXTENSIBILITÉ (même esprit que SURFACE_REGISTRY) : `stackable`/`label`/
// `descriptionKey` sont la base commune à tout objet ; `equippable`/`slot`/
// `gait` s'y ajoutent pour un objet ÉQUIPABLE (voir core/equipment.js) —
// chaque entrée reste un objet plat conçu pour en recevoir d'autres PLUS
// TARD (ex. `usable`, un effet à l'utilisation...) SANS changer la forme du
// registre ni la logique de core/bag.js — ajouter un OBJET, c'est ajouter
// une entrée ; ajouter une CAPACITÉ, c'est ajouter une clé à chaque entrée
// concernée, jamais une nouvelle fonction ni une hiérarchie de types.
//
// `equippable` (booléen) : peut être placé dans un slot d'équipement
// (core/equipment.js/equipItem) plutôt que de rester simple contenu du sac.
// `slot` : NOM du slot qu'il occupe (voir core/equipment.js/EQUIPMENT_SLOTS)
// — aujourd'hui seulement "feet". `gait` : pool de son de pas (voir
// entities/model.md, "Surfaces de sol et son de pas") que cet objet impose
// une fois équipé — lu par core/equipment.js/gaitOf, JAMAIS stocké ailleurs
// (voir entities/player.js). Les objets équipables déclarés ici (slot
// "feet") couvrent les trois pools de pas disponibles : `barefoot_walk`
// (défaut, aucun objet équipé), `shoes_walk` (baskets), `boots_walk` (bottes
// en cuir ET rangers — DEUX objets peuvent partager le même gait/pool, rien
// n'impose une correspondance 1:1).
//
// `tags` (optionnel, tableau de clés — voir core/tags.js/TAG_REGISTRY) :
// classification HORIZONTALE d'un objet (ex. "military"), indépendante de
// stackable/equippable/slot — un objet équipé PORTE ses tags (voir
// core/equipment.js/equippedTags), une future vérification de contenu (PNJ,
// événement) les lit via la condition "hasEquipmentTag" (core/presence.js).
// Absent ou vide -> aucun tag, comportement inchangé pour tout objet
// existant.
export const ITEM_REGISTRY = {
  apple: { stackable: true, label: "item.apple", descriptionKey: "item.apple.description" },
  key_bronze: { stackable: false, label: "item.key_bronze", descriptionKey: "item.key_bronze.description" },
  sneakers: {
    stackable: false,
    label: "item.sneakers",
    descriptionKey: "item.sneakers.description",
    equippable: true,
    slot: "feet",
    gait: "shoes",
  },
  leather_boots: {
    stackable: false,
    label: "item.leather_boots",
    descriptionKey: "item.leather_boots.description",
    equippable: true,
    slot: "feet",
    gait: "boots",
  },
  combat_boots: {
    stackable: false,
    label: "item.combat_boots",
    descriptionKey: "item.combat_boots.description",
    equippable: true,
    slot: "feet",
    gait: "boots",
    tags: ["military"],
  },
};

// Propriétés d'UN objet par son type — point d'extension futur (même
// principe que core/surfaces.js/surfaceProps) : un appelant qui voudra lire
// `usable` demain appelle EXACTEMENT cette fonction, rien à ajouter ici.
// Type inconnu -> undefined, jamais d'exception (voir core/bag.js/addItem,
// qui s'en accommode déjà en dégradant sur "non empilable").
export function itemProps(type) {
  return ITEM_REGISTRY[type];
}

// Valide que tout tag référencé par CHAQUE objet d'un registre existe dans
// TAG_REGISTRY — même principe que la validation des surfaces contre
// SURFACE_REGISTRY (core/level.js), mais ITEM_REGISTRY est du CODE, pas du
// contenu JSON passé à un parseur : ce module se valide donc LUI-MÊME, tout
// de suite (voir l'appel plus bas), plutôt que de dépendre d'un chemin de
// chargement externe. Exporté (plutôt qu'un IIFE anonyme) pour rester
// TESTABLE au terminal avec un registre de test (voir core/movement.check.js)
// sans avoir à corrompre ITEM_REGISTRY lui-même. Faute de frappe -> échec
// CLAIR (tag + objet concerné), jamais un mismatch silencieux découvert en
// jeu.
export function validateItemTags(registry) {
  for (const [type, props] of Object.entries(registry)) {
    for (const tag of props.tags || []) {
      if (!TAG_REGISTRY[tag]) {
        throw new Error(`core/items.js: tag "${tag}" (objet "${type}") absent de TAG_REGISTRY.`);
      }
    }
  }
}

validateItemTags(ITEM_REGISTRY);
