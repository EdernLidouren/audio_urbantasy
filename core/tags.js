// Registre des TAGS D'OBJETS — données pures, structuré comme
// core/surfaces.js/SURFACE_REGISTRY : un tag est un mot-étiquette (ex.
// "military", "chic") qu'un objet peut porter pour la classification
// horizontale et de futures vérifications de contenu (PNJ, événements) —
// AUCUNE règle de jeu ici, juste la liste des tags valides et leur clé
// d'affichage. Ajouter un tag = une entrée ici, jamais une chaîne en dur
// ailleurs.
//
// Un tag est un IDENTIFIANT STABLE (la clé de ce registre, ex. "military"),
// traduit SEULEMENT à l'affichage via labelKey (i18n) — toute vérification
// (core/items.js/ITEM_REGISTRY, condition "hasEquipmentTag" — voir
// core/presence.js/core/scene.js) porte sur la CLÉ, jamais le texte traduit :
// un tag ne doit jamais cesser de matcher au changement de langue.
//
// VALIDATION : tout tag référencé par un objet (voir core/items.js/
// validateItemTags) ou une condition "hasEquipmentTag" (voir core/scene.js)
// DOIT exister ici — une faute de frappe échoue clairement au chargement,
// jamais un mismatch silencieux découvert en jeu.
export const TAG_REGISTRY = {
  military: { labelKey: "tag.military" },
  chic: { labelKey: "tag.chic" },
  metal: { labelKey: "tag.metal" },
};

// Propriétés d'UN tag par sa clé — même patron que core/surfaces.js/
// surfaceProps. Clé inconnue -> undefined, jamais d'exception (la validation
// au chargement, voir header, est l'endroit qui doit refuser une clé
// invalide — cet accesseur reste un simple lookup défensif pour tout
// appelant déjà en aval d'un contenu validé).
export function tagProps(key) {
  return TAG_REGISTRY[key];
}
