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
// `descriptionKey` sont les SEULES propriétés aujourd'hui, mais chaque
// entrée est un objet plat conçu pour en recevoir d'autres PLUS TARD (ex.
// `usable`, `equippable`, un effet à l'utilisation...) SANS changer la
// forme du registre ni la logique de core/bag.js — ajouter un OBJET, c'est
// ajouter une entrée ; ajouter une CAPACITÉ, c'est ajouter une clé à
// chaque entrée concernée, jamais une nouvelle fonction ni une hiérarchie
// de types.
export const ITEM_REGISTRY = {
  apple: { stackable: true, label: "item.apple", descriptionKey: "item.apple.description" },
  key_bronze: { stackable: false, label: "item.key_bronze", descriptionKey: "item.key_bronze.description" },
};

// Propriétés d'UN objet par son type — point d'extension futur (même
// principe que core/surfaces.js/surfaceProps) : un appelant qui voudra lire
// `usable` demain appelle EXACTEMENT cette fonction, rien à ajouter ici.
// Type inconnu -> undefined, jamais d'exception (voir core/bag.js/addItem,
// qui s'en accommode déjà en dégradant sur "non empilable").
export function itemProps(type) {
  return ITEM_REGISTRY[type];
}
