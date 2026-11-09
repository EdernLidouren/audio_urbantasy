// Jeu des billes : le MODÈLE D'EFFET. Un effet est une liste de clauses, de la
// donnée (format : en-tête de config/marbles-values.js). Ce module sait la
// valider, lire ce qu'une bille a d'imprimé et l'évaluer sur un triangle ; pur,
// il ne touche à aucun état : appliquer le résultat est l'affaire de
// core/marbles.js.
//
// AJOUTER une action ou une condition : une entrée dans CLAUSE_ACTIONS ou dans
// CONDITIONS, et ses textes dans la vue (view/marbles/narration.js, ACTION_TEXTS
// ou CONDITION_TEXTS). Une cible est un emplacement, ou rien pour la bille
// elle-même.
//
// VALEURS : ce qu'un effet produit, une valeur par action, sous le nom de
// l'action (`{ speed, mass, draw }`). Le core les applique (core/marbles.js/fireEffect),
// la vue les dit, la prévision les rend.

import { rejectUnknownFields } from "../lib/validate.js";

// Emplacements, dans l'ordre de RÉSOLUTION (phases de base gauche, de base
// droite, de pointe).
export const SLOTS = ["leftBase", "rightBase", "apex"];

// Le même « aucun effet » partout : comparer deux effets par identité dit si
// une bille a une variante de base.
const NO_EFFECT = Object.freeze([]);

// L'effet de PHASE d'une bille à un emplacement, variante de base comprise.
export function effectAt(marble, slot, types) {
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

// Les champs d'une clause. `target` n'appartient qu'aux actions qui ont un sens
// pour un autre emplacement : une action qui ne le déclare pas refuse toute cible
// à la validation.
const TARGETED_FIELDS = ["action", "amount", "target", "when"];
const SELF_FIELDS = ["action", "amount", "when"];

function validateInteger(clause, describe, fail) {
  if (!Number.isInteger(clause.amount)) fail(`${describe} : amount doit être un entier.`);
}

function validatePositive(clause, describe, fail) {
  if (!Number.isInteger(clause.amount) || clause.amount < 1) fail(`${describe} : amount doit être un entier >= 1.`);
}

// Ajoute le montant de la clause à la valeur de son action.
function addAmount(values, clause) {
  return { ...values, [clause.action]: values[clause.action] + clause.amount };
}

// Chaque action, sur le modèle des conditions :
//   fields    les champs qu'elle accepte ;
//   validate  la validation de ses valeurs ;
//   apply     ce qu'elle ajoute aux valeurs d'un effet, (values, clause) -> values.
// Ses textes : view/marbles/narration.js/ACTION_TEXTS.
export const CLAUSE_ACTIONS = {
  // Ajoute `amount` (négatif permis) à la Vitesse.
  speed: { fields: TARGETED_FIELDS, validate: validateInteger, apply: addAmount },
  // Ajoute `amount` (négatif permis) à la Masse.
  mass: { fields: TARGETED_FIELDS, validate: validateInteger, apply: addAmount },
  // Pioche : `amount` billes (au moins 1), piochées par la bille elle-même au
  // déclenchement (core/marbles.js/drawMarbles), à tout moment du tour. Sans
  // cible : piocher pour une autre bille n'a pas de sens.
  draw: { fields: SELF_FIELDS, validate: validatePositive, apply: addAmount },
};

// Les valeurs à zéro : toutes celles d'un effet, et celles qu'un effet peut
// DONNER à un autre emplacement (les actions qui acceptent une cible).
function zeroValues(actions) {
  return Object.freeze(Object.fromEntries(actions.map((action) => [action, 0])));
}
const ZERO = zeroValues(Object.keys(CLAUSE_ACTIONS));
const GIFT_ZERO = zeroValues(Object.keys(CLAUSE_ACTIONS).filter((action) => CLAUSE_ACTIONS[action].fields.includes("target")));

// La somme de deux jeux de valeurs ; une valeur absente de l'un compte zéro.
export function addValues(a, b) {
  const sum = { ...a };
  for (const [key, value] of Object.entries(b)) sum[key] = (sum[key] ?? 0) + value;
  return sum;
}

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
    const action = CLAUSE_ACTIONS[clause.action];
    if (!Object.hasOwn(CLAUSE_ACTIONS, clause.action)) fail(`${describe} : action inconnue "${clause.action}".`);
    rejectUnknownFields(clause, action.fields, describe, fail);
    action.validate(clause, describe, fail);
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
//   self    les valeurs de la bille elle-même, toutes présentes ;
//   gifts   ce qui va à d'autres emplacements, [{ slot, ...valeurs donnables }].
export function evaluateEffect(clauses, triangle, types) {
  let self = ZERO;
  const gifts = [];
  for (const clause of clauses) {
    if (clause.when !== undefined && !CONDITIONS[clause.when.type].test(clause.when, triangle, types)) continue;
    const { apply } = CLAUSE_ACTIONS[clause.action];
    if (clause.target === undefined) self = apply(self, clause);
    else gifts.push({ slot: clause.target, ...apply(GIFT_ZERO, clause) });
  }
  return { self, gifts };
}
