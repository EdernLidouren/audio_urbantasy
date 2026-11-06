// Jeu des billes : le MODÈLE D'EFFET. Un effet est une liste de clauses, de la
// donnée (format : en-tête de config/marbles-values.js). Ce module sait la
// valider, lire ce qu'une bille a d'imprimé et l'évaluer sur un triangle ; pur,
// il ne touche à aucun état : appliquer le résultat est l'affaire de
// core/marbles.js.
//
// AJOUTER une action ou une condition : une ligne dans CLAUSE_ACTIONS ou dans
// CONDITIONS, le moteur n'a pas à changer. Une cible est un emplacement, ou
// rien pour la bille elle-même.

import { MARBLE_TYPES } from "../config/marbles-values.js";
import { rejectUnknownFields } from "../lib/validate.js";

// Emplacements, dans l'ordre de RÉSOLUTION (phases de base gauche, de base
// droite, de pointe).
export const SLOTS = ["leftBase", "rightBase", "apex"];

// Le même « aucun effet » partout : comparer deux effets par identité dit si
// une bille a une variante de base.
const NO_EFFECT = Object.freeze([]);

// L'effet de PHASE d'une bille à un emplacement, variante de base comprise.
export function effectAt(marble, slot, types = MARBLE_TYPES) {
  const type = types[marble];
  if (slot === "apex") return type.apex ?? NO_EFFECT;
  return type.baseVariant?.[slot] ?? type.base ?? NO_EFFECT;
}

// Ce que des clauses donnent à coup sûr pour `stat` : les clauses sans cible
// (celles d'une autre bille ne sont pas l'effet de celle-ci) et sans condition
// (l'évaluer rouvrirait la porte aux dépendances circulaires).
export function printedStat(clauses, stat) {
  return clauses
    .filter((clause) => clause.action === stat && clause.target === undefined && clause.when === undefined)
    .reduce((total, clause) => total + clause.amount, 0);
}

const ZERO = Object.freeze({ speed: 0, mass: 0 });

export function addDeltas(a, b) {
  return { speed: a.speed + b.speed, mass: a.mass + b.mass };
}

// Ce que fait chaque action : un apport à la Vitesse et à la Masse.
export const CLAUSE_ACTIONS = {
  speed: (clause) => ({ ...ZERO, speed: clause.amount }),
  mass: (clause) => ({ ...ZERO, mass: clause.amount }),
};

// Chaque condition : ses champs, leur validation, et son test sur le triangle.
export const CONDITIONS = {
  // La bille à `slot` a-t-elle, IMPRIMÉ à cet emplacement, au moins `atLeast`
  // de `stat` ? Emplacement vide : non, il n'y a rien à lire.
  printedStat: {
    fields: ["type", "slot", "stat", "atLeast"],
    validate(when, describe, fail) {
      if (!SLOTS.includes(when.slot)) fail(`${describe} : emplacement inconnu "${when.slot}".`);
      if (!Object.hasOwn(CLAUSE_ACTIONS, when.stat)) fail(`${describe} : statistique inconnue "${when.stat}".`);
      if (!Number.isInteger(when.atLeast)) fail(`${describe} : atLeast doit être un entier.`);
    },
    test(when, triangle, types) {
      const placed = triangle[when.slot];
      if (placed === null) return false;
      return printedStat(effectAt(placed.marble, when.slot, types), when.stat) >= when.atLeast;
    },
  },
};

// Échoue au chargement sur un effet mal formé. Un effet absent se vérifie en
// amont : ici, il existe.
export function validateEffect(effect, describe, fail) {
  if (!Array.isArray(effect)) fail(`${describe} : un effet est une liste de clauses.`);
  for (const clause of effect) {
    rejectUnknownFields(clause, ["action", "amount", "target", "when"], describe, fail);
    if (!Object.hasOwn(CLAUSE_ACTIONS, clause.action)) fail(`${describe} : action inconnue "${clause.action}".`);
    if (!Number.isInteger(clause.amount)) fail(`${describe} : amount doit être un entier.`);
    if (clause.target !== undefined && !SLOTS.includes(clause.target)) fail(`${describe} : cible inconnue "${clause.target}".`);
    if (clause.when !== undefined) {
      const condition = CONDITIONS[clause.when.type];
      if (!condition) fail(`${describe} : condition inconnue "${clause.when.type}".`);
      rejectUnknownFields(clause.when, condition.fields, describe, fail);
      condition.validate(clause.when, describe, fail);
    }
  }
}

// Évalue des clauses sur un triangle, au moment du déclenchement :
//   self    ce qui va au compteur du tour (ou s'ajoute à l'effet de la bille) ;
//   gifts   ce qui va à d'autres emplacements, [{ slot, speed, mass }].
export function evaluateEffect(clauses, triangle, types = MARBLE_TYPES) {
  let self = ZERO;
  const gifts = [];
  for (const clause of clauses) {
    if (clause.when !== undefined && !CONDITIONS[clause.when.type].test(clause.when, triangle, types)) continue;
    const delta = CLAUSE_ACTIONS[clause.action](clause);
    if (clause.target === undefined) self = addDeltas(self, delta);
    else gifts.push({ slot: clause.target, ...delta });
  }
  return { self, gifts };
}
