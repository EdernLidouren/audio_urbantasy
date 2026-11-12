// TAGS D'OBJETS — l'accès au registre des tags (config/tags-values.js, la donnée,
// et le sens d'un tag). La validation des tags cités se fait chez qui les cite
// (core/items.js/validateItemRegistry, core/script-parse.js/validateCondition).

import { TAG_REGISTRY } from "../config/tags-values.js";

// Propriétés d'UN tag par sa clé — même patron que core/surfaces.js/
// surfaceProps. Clé inconnue -> undefined, jamais d'exception (la validation
// au chargement, voir l'en-tête, est l'endroit qui doit refuser une clé
// invalide — cet accesseur reste un simple lookup défensif pour tout
// appelant déjà en aval d'un contenu validé).
export function tagProps(key) {
  return TAG_REGISTRY[key];
}
