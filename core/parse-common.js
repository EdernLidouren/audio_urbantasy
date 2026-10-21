// Briques COMMUNES du parsing de scène (core/scene.js, core/entity-parse.js,
// core/script-parse.js) : l'erreur de chargement, deux tests de type, et le
// comportement d'entité (utilisé par un champ d'entité ET par l'effet
// "behavior" d'une règle de présence). Pur.

import BEHAVIORS from "./behaviors/index.js";

// Erreur de parsing : préfixe commun à tous les messages de chargement
// d'une scène (les messages sont testés tels quels, voir core/checks/).
export function fail(message) {
  throw new Error(`parseScene: ${message}`);
}

export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// Générique : ne connaît aucun kind par son nom. Cherche kind dans le
// registre (comme registry[type] pour les types d'entité),
// puis délègue la validation propre au comportement à son module (voir
// core/behaviors/wander.js) — parseParams ne renvoie que les champs fournis,
// les défauts se résolvent ailleurs (voir le contrat documenté dans le
// module), jamais ici.
export function parseBehavior(behavior, index, id) {
  if (typeof behavior !== "object" || behavior === null) {
    fail(`entities[${index}] ("${id}") : behavior doit être un objet si présent.`);
  }

  const { kind } = behavior;
  const module = BEHAVIORS[kind];
  if (!module) {
    fail(`entities[${index}] ("${id}") : behavior.kind "${kind}" inconnu.`);
  }

  const params = module.parseParams(behavior, (message) => fail(`entities[${index}] ("${id}") : ${message}`));
  return { kind, ...params };
}
