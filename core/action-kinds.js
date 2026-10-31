// KINDS D'ACTION (voir doc/scripting.md/"Actions") — SEULE liste des kinds
// reconnus, et la forme de leurs champs propres, validée au CHARGEMENT
// (core/script-parse.js/parseSingleAction). L'EXÉCUTION d'un kind (appel au
// core, son, annonce) vit côté vue, dans view/action-execution.js/
// ACTION_HANDLERS, dont les clés sont vérifiées au chargement contre ce
// registre : un kind ajouté d'un côté seulement échoue aussitôt.
//
// Chaque entrée :
//   - fields : champs propres au kind, en plus des champs communs à toute
//     action (COMMON_ACTION_FIELDS). Tout autre champ est refusé : une faute
//     de frappe ("ammount") échouerait sinon en silence ;
//   - validate(action, describe, context, fail) : forme et cohérence des
//     champs propres. `context` : { registry, length } de l'entité porteuse
//     (registre de types INJECTÉ, longueur de la scène) ;
//   - requires (optionnel) : champ que l'ENTITÉ porteuse doit avoir, après
//     sa cascade instance -> archétype (vérifié par core/entity-parse.js).
//
// Montants d'argent : entiers STRICTEMENT positifs. Une action ne retire
// jamais d'argent ; ce serait un effet dédié, le jour où il en faut un.

import { ITEM_REGISTRY } from "./items.js";

// Champs permis sur TOUTE action, quel que soit son kind (voir
// doc/scripting.md/"Conditions d'action", "Effets d'action", "Confirmation
// d'une action").
const COMMON_ACTION_FIELDS = ["kind", "condition", "confirm", "effects", "refusalEffects"];

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function validateAmount(amount, describe, fail) {
  if (!isPositiveInteger(amount)) {
    fail(`${describe}.amount doit être un entier > 0 (reçu : ${JSON.stringify(amount)}).`);
  }
}

// "pickup" : ramassage. Exactement une des deux formes : vers le SAC
// (`item`, `count` défaut 1) ou vers l'ARGENT (`amount`).
function validatePickup(action, describe, context, fail) {
  const hasItem = action.item !== undefined;
  if (hasItem === (action.amount !== undefined)) {
    fail(`${describe} : "pickup" déclare SOIT item SOIT amount, jamais les deux ni aucun.`);
  }
  if (!hasItem) {
    if (action.count !== undefined) {
      fail(`${describe} : "pickup" vers l'argent n'a pas de count (seulement amount).`);
    }
    validateAmount(action.amount, describe, fail);
    return;
  }
  if (typeof action.item !== "string" || !Object.hasOwn(ITEM_REGISTRY, action.item)) {
    fail(`${describe}.item ${JSON.stringify(action.item)} absent de ITEM_REGISTRY.`);
  }
  if (action.count !== undefined && !isPositiveInteger(action.count)) {
    fail(`${describe}.count doit être un entier > 0 si présent (reçu : ${JSON.stringify(action.count)}).`);
  }
}

// "loot" : collectible persistant. Au plus une des deux formes : un
// MONTANT crédité, ou un ÉPARPILLEMENT d'éphémères (`spawn`). Aucune des
// deux : objet unique, dont les effets disent ce qu'on a pris.
function validateLoot(action, describe, context, fail) {
  if (action.amount !== undefined && action.spawn !== undefined) {
    fail(`${describe} : "loot" déclare SOIT amount SOIT spawn, jamais les deux.`);
  }
  if (action.amount !== undefined) {
    validateAmount(action.amount, describe, fail);
    return;
  }
  if (action.spawn === undefined) return;

  const { spawn } = action;
  if (typeof spawn !== "object" || spawn === null || Array.isArray(spawn)) {
    fail(`${describe}.spawn doit être un objet { spec, count, spread? }.`);
  }
  if (!isPositiveInteger(spawn.count)) {
    fail(`${describe}.spawn.count doit être un entier > 0 (reçu : ${JSON.stringify(spawn.count)}).`);
  }
  if (spawn.spread !== undefined && !(typeof spawn.spread === "number" && Number.isFinite(spawn.spread) && spawn.spread >= 0)) {
    fail(`${describe}.spawn.spread doit être un nombre >= 0 si présent (reçu : ${JSON.stringify(spawn.spread)}).`);
  }
  const { spec } = spawn;
  if (typeof spec !== "object" || spec === null || typeof spec.type !== "string" || !Object.hasOwn(context.registry, spec.type)) {
    fail(`${describe}.spawn.spec.type ${JSON.stringify(spec && spec.type)} absent du registre de types.`);
  }
  // Surcharges de l'action de l'archétype (voir core/spawn.js/
  // ephemeralArchetypeSpec) : même règle que les champs qu'elles remplacent.
  if (spec.amount !== undefined) validateAmount(spec.amount, `${describe}.spawn.spec`, fail);
  if (spec.count !== undefined && !isPositiveInteger(spec.count)) {
    fail(`${describe}.spawn.spec.count doit être un entier > 0 si présent (reçu : ${JSON.stringify(spec.count)}).`);
  }
}

// "switchSide" : passage recto <-> verso, arrivée sur l'autre face en
// `arrivalX`, dans les bornes de la scène.
function validateSwitchSide(action, describe, context, fail) {
  const { arrivalX } = action;
  if (typeof arrivalX !== "number" || !Number.isFinite(arrivalX) || arrivalX < 0 || arrivalX > context.length) {
    fail(`${describe}.arrivalX doit être un nombre dans [0, ${context.length}] (reçu : ${JSON.stringify(arrivalX)}).`);
  }
}

// "applyEffects" : sa seule substance est ses effets.
function validateApplyEffects(action, describe, context, fail) {
  if (action.effects === undefined) {
    fail(`${describe} : "applyEffects" sans effects ne ferait rien.`);
  }
}

function noFields() {}

export const ACTION_KINDS = {
  pickup: { fields: ["item", "count", "amount"], validate: validatePickup },
  loot: { fields: ["amount", "spawn"], validate: validateLoot },
  switchSide: { fields: ["arrivalX"], validate: validateSwitchSide },
  applyEffects: { fields: [], validate: validateApplyEffects },
  search: { fields: [], validate: noFields, requires: "container" },
  shop: { fields: [], validate: noFields, requires: "shop" },
  buy: { fields: [], validate: noFields, requires: "display" },
};

// Kind connu, aucun champ hors de ceux du kind et des champs communs, puis
// la validation propre au kind.
export function validateActionKind(action, describe, context, fail) {
  const kind = ACTION_KINDS[action.kind];
  if (!kind) {
    fail(`${describe}.kind "${action.kind}" inconnu (${Object.keys(ACTION_KINDS).join(" | ")}).`);
  }
  const allowed = [...COMMON_ACTION_FIELDS, ...kind.fields];
  const unknown = Object.keys(action).filter((field) => !allowed.includes(field));
  if (unknown.length > 0) {
    fail(`${describe} : champ(s) inconnu(s) pour "${action.kind}" : ${unknown.map((field) => `"${field}"`).join(", ")}.`);
  }
  kind.validate(action, describe, context, fail);
}
