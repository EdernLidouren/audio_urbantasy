// TAGS D'OBJETS — donnée pure (aucun import), le registre des tags. Lu par le
// core (core/tags.js, la validation des objets et de la condition
// hasEquipmentTag) et par la vue (noms).
//
// Structuré comme config/surfaces-values.js/SURFACE_REGISTRY : un tag est un mot-étiquette (ex.
// "military", "chic") qu'un objet peut porter pour la classification
// horizontale et de futures vérifications de contenu (PNJ, événements) —
// AUCUNE règle de jeu ici, juste la liste des tags valides et leur clé
// d'affichage. Ajouter un tag = une entrée ici, jamais une chaîne en dur
// ailleurs.
//
// Un tag est un IDENTIFIANT STABLE (la clé de ce registre, ex. "military"),
// traduit SEULEMENT à l'affichage via nameKey (i18n) — toute vérification
// (core/items.js/ITEM_REGISTRY, condition "hasEquipmentTag" — voir
// core/conditions.js et core/script-parse.js/validateCondition) porte sur la
// CLÉ, jamais le texte traduit :
// un tag ne doit jamais cesser de matcher au changement de langue.
//
// VALIDATION : tout tag référencé par un objet (voir core/items.js/
// validateItemRegistry) ou une condition "hasEquipmentTag" (voir
// core/script-parse.js/validateCondition)
// DOIT exister ici — une faute de frappe échoue clairement au chargement,
// jamais un mismatch silencieux découvert en jeu.
export const TAG_REGISTRY = {
  military: { nameKey: "tag.military" },
  chic: { nameKey: "tag.chic" },
  metal: { nameKey: "tag.metal" },
  // Composants électroniques (collection "electronics") : sert aussi à la
  // table de garnissage déduite "electronics" (config/spawn-values.js).
  electronic: { nameKey: "tag.electronic" },
  // Minéraux (collection "minerals") : table de garnissage déduite
  // "minerals" (config/spawn-values.js).
  mineral: { nameKey: "tag.mineral" },
};
