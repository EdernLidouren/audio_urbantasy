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

// Un champ hors de `allowed` est une erreur de contenu : une faute de frappe
// (`"descriptonKey"`, `"ambience"`) retomberait sinon EN SILENCE sur le
// défaut du champ visé. Les champs optionnels restent optionnels : seul un
// champ que le format ne connaît pas échoue.
export function rejectUnknownFields(value, allowed, describe) {
  const unknown = Object.keys(value).filter((field) => !allowed.includes(field));
  if (unknown.length > 0) {
    fail(`${describe} : champ(s) inconnu(s) ${unknown.map((field) => `"${field}"`).join(", ")}.`);
  }
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
