// Briques COMMUNES du parsing de scène (core/scene.js, core/entity-parse.js,
// core/script-parse.js) : l'erreur de chargement, deux tests de type, et le
// comportement d'entité (utilisé par un champ d'entité ET par l'effet
// "behavior" d'une règle de présence). Pur.

import BEHAVIORS from "./behaviors/index.js";
import { rejectUnknownFields as rejectUnknown } from "../lib/validate.js";

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

// Champ inconnu -> erreur (voir lib/validate.js), avec l'erreur de scène par
// défaut. `failWith` : l'erreur de l'appelant, pour un format qui n'est pas
// une scène (départ, registre de types).
export function rejectUnknownFields(value, allowed, describe, failWith = fail) {
  rejectUnknown(value, allowed, describe, failWith);
}

// Générique : ne connaît aucun kind par son nom. Cherche kind dans le
// registre (comme registry[type] pour les types d'entité),
// puis délègue la validation propre au comportement à son module (voir
// core/behaviors/wander.js) — parseParams ne renvoie que les champs fournis,
// les défauts se résolvent ailleurs (voir le contrat documenté dans le
// module), jamais ici. Un champ hors de la liste PARAMS du module est
// rejeté (voir rejectUnknownFields).
export function parseBehavior(behavior, index, id) {
  if (typeof behavior !== "object" || behavior === null) {
    fail(`entities[${index}] ("${id}") : behavior doit être un objet si présent.`);
  }

  const { kind } = behavior;
  const module = BEHAVIORS[kind];
  if (!module) {
    fail(`entities[${index}] ("${id}") : behavior.kind "${kind}" inconnu.`);
  }
  rejectUnknownFields(behavior, ["kind", ...module.PARAMS], `entities[${index}] ("${id}") : behavior "${kind}"`);

  const params = module.parseParams(behavior, (message) => fail(`entities[${index}] ("${id}") : ${message}`));
  return { kind, ...params };
}
