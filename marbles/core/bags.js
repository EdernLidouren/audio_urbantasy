// JEU DES BILLES — les SACS : ce avec quoi une partie se joue, comme un deck dans un
// jeu de cartes. Leur format, leurs RÈGLES DE CONSTRUCTION, leur validation et les
// emplacements du joueur. Simulation pure : aucun DOM, aucun son, aucun hasard.
//
// QUATRE COUCHES, chacune à sa place :
//   le CATALOGUE   toutes les billes du jeu (marbles/content/types/), un registre de
//                  contenu, injecté (`types`) ;
//   la COLLECTION  les billes que le joueur a débloquées. Elle appartient à Templeton :
//                  le minijeu n'en reçoit que la LISTE des ids débloqués, par un
//                  fournisseur (marbles/host/collection.js), jamais son fonctionnement ;
//   les SACS       des compositions enregistrées : préfaites (marbles/content/bags/, en
//                  lecture seule) ou faites par le joueur (ses emplacements, ci-dessous) ;
//   la PARTIE      elle reçoit un sac et en crée une COPIE qui ne vit que le temps de
//                  la partie (marbles/core/marbles.js/startMarblesGame) : ses zones (sac
//                  de pioche, main, triangle, défausse, pot, billes perdues) sont des
//                  listes d'ids construites depuis le sac. Rien de ce qui arrive en
//                  partie ne touche le sac reçu, ni la collection.
// Une bille débloquée s'utilise librement, dans les limites des règles de
// construction : aucune notion d'exemplaires possédés.
//
// UN SAC, sérialisable, sans aucun état de partie :
//   { id, name?, marbles: [{ marble, count }] }
//   id       son identifiant, un texte non vide ;
//   name     le nom qu'un JOUEUR lui a donné, tel quel (un sac du joueur) ; absent pour
//            un sac PRÉFAIT, dont le nom se déduit de l'id : `marbles.bag.<id>.name`,
//            en minuscules (marbles/view/narration/bags.js/bagLineParams) ;
//   marbles  sa composition : chaque bille UNE fois, avec son nombre d'exemplaires
//            (`count`, un entier >= 1). L'ordre est celui de la composition ; la copie
//            de partie en déroule les exemplaires dans cet ordre, puis les mélange.
// Une forme fausse (un champ inconnu, un nombre nul, une bille en double) est une
// faute de données : elle LÈVE (validateBagFormat). Une bille inconnue ou non
// débloquée, un sac trop grand… sont des PROBLÈMES (bagProblems) : le sac est bien
// formé, mais il ne se joue pas.
//
// LES RÈGLES DE CONSTRUCTION : un objet, une entrée par SORTE de règle
// (BUILD_RULE_KINDS), ses paramètres pour valeur ; une sorte absente ne s'applique pas.
// Les règles par défaut sont un réglage (marbles/config/values.js/BAG_BUILD_RULES) ;
// une définition de partie les complète ou les remplace, sorte par sorte
// (mergeBuildRules). AJOUTER UNE SORTE (« une seule famille », « taille exacte ») :
// son entrée dans BUILD_RULE_KINDS, et le texte de ses problèmes
// (`marbles.bagProblem.<code>`, data/i18n/<langue>/marbles.json).
//
// LES PROBLÈMES : { code, ... } (BAG_PROBLEMS), dans un ordre fixe : les billes
// inconnues ou non débloquées d'abord, dans l'ordre du sac ; puis chaque sorte de
// règle, dans l'ordre de BUILD_RULE_KINDS, ses problèmes dans l'ordre du sac. Une liste
// vide : le sac est valide. Leurs textes : marbles/view/narration/bags.js.
//
// EMPLACEMENTS du joueur : BAG_SLOTS emplacements (marbles/config/values.js), une
// liste où chacun vaut null (vide) ou un sac. Des fonctions pures ici ; le magasin qui
// les garde est l'affaire de l'hôte (marbles/host/bag-store.js).

import { BAG_SLOTS, MARBLE_RARITIES } from "../config/values.js";
import { rejectUnknownFields } from "../../lib/validate.js";

// Le registre vide : celui de règles composées sans sacs préfaits.
export const NO_BAGS = Object.freeze({});

// Les codes de problème (en-tête), chacun avec son texte (`marbles.bagProblem.<code>`,
// vérifié par le domaine marbles-bags) :
//   unknownMarble  { marble }              une bille absente du catalogue ;
//   lockedMarble   { marble }              une bille que la collection n'a pas débloquée ;
//   bagTooSmall    { size, min }           moins de billes que la taille minimum ;
//   bagTooLarge    { size, max }           plus de billes que la taille maximum ;
//   tooManyCopies  { marble, count, max }  plus d'exemplaires que sa rareté n'en permet.
export const BAG_PROBLEMS = Object.freeze(["unknownMarble", "lockedMarble", "bagTooSmall", "bagTooLarge", "tooManyCopies"]);

// Un entier >= `min`.
function isCount(value, min) {
  return Number.isInteger(value) && value >= min;
}

// LES SORTES DE RÈGLES DE CONSTRUCTION (en-tête), dans l'ordre de leurs problèmes.
// Chacune :
//   validate(params, fail)  ses paramètres (une forme fausse lève) ;
//   check(bag, params, types)  ses problèmes pour ce sac, dont toutes les billes sont
//                           au catalogue (bagProblems écarte les autres avant).
export const BUILD_RULE_KINDS = Object.freeze({
  // { min, max } : la taille du sac, bornes comprises.
  size: {
    validate: (params, fail) => {
      rejectUnknownFields(params, ["min", "max"], "règle size", fail);
      if (!isCount(params.min, 0)) fail("size.min doit être un entier >= 0.");
      if (!isCount(params.max, 1)) fail("size.max doit être un entier >= 1.");
      if (params.min > params.max) fail("size.min ne doit pas dépasser size.max.");
    },
    check: (bag, { min, max }) => {
      const size = bagSize(bag);
      if (size < min) return [{ code: "bagTooSmall", size, min }];
      if (size > max) return [{ code: "bagTooLarge", size, max }];
      return [];
    },
  },
  // { <rareté>: n } : les exemplaires au plus d'une bille, selon sa rareté, chaque
  // rareté donnée.
  copies: {
    validate: (params, fail) => {
      rejectUnknownFields(params, MARBLE_RARITIES, "règle copies", fail);
      for (const rarity of MARBLE_RARITIES) {
        if (!isCount(params[rarity], 1)) fail(`copies.${rarity} doit être un entier >= 1.`);
      }
    },
    check: (bag, params, types) =>
      bag.marbles
        .filter(({ marble, count }) => count > params[types[marble].rarity])
        .map(({ marble, count }) => ({ code: "tooManyCopies", marble, count, max: params[types[marble].rarity] })),
  },
});

// Échoue sur des règles de construction mal formées : un objet { sorte: paramètres },
// chaque sorte connue. `allowNull` : une valeur null permise (une définition qui RETIRE
// une sorte, mergeBuildRules). `fail(message)` : l'erreur de l'appelant.
export function validateBuildRules(rules, fail, { allowNull = false } = {}) {
  if (rules === null || typeof rules !== "object" || Array.isArray(rules)) fail("les règles de construction sont un objet { sorte: paramètres }.");
  for (const [kind, params] of Object.entries(rules)) {
    if (!Object.hasOwn(BUILD_RULE_KINDS, kind)) fail(`règle de construction inconnue "${kind}" (${Object.keys(BUILD_RULE_KINDS).join(", ")}).`);
    if (params === null && allowNull) continue;
    if (params === null || typeof params !== "object" || Array.isArray(params)) fail(`règle de construction "${kind}" : des paramètres, un objet.`);
    BUILD_RULE_KINDS[kind].validate(params, fail);
  }
}

// Les règles `base` (celles par défaut) complétées par `overrides` (celles d'une
// définition), SORTE PAR SORTE : une sorte donnée remplace celle de la base, null la
// retire, une sorte nouvelle s'ajoute. Remplacer toutes les règles : donner chaque
// sorte de la base, ou null. Une copie, rien n'est modifié.
export function mergeBuildRules(base, overrides = {}) {
  const merged = { ...base };
  for (const [kind, params] of Object.entries(overrides)) {
    if (params === null) delete merged[kind];
    else merged[kind] = params;
  }
  return merged;
}

// Échoue sur un sac mal formé (en-tête). `fail(message)` : l'erreur de l'appelant ;
// par défaut, une erreur préfixée.
export function validateBagFormat(bag, fail = defaultFail(bag)) {
  if (bag === null || typeof bag !== "object" || Array.isArray(bag)) fail("un sac est un objet { id, name?, marbles }.");
  rejectUnknownFields(bag, ["id", "name", "marbles"], "sac", fail);
  if (typeof bag.id !== "string" || bag.id === "") fail("id doit être un texte non vide.");
  if (bag.name !== undefined && (typeof bag.name !== "string" || bag.name.trim() === "")) fail("name, s'il est donné, doit être un texte non vide.");
  if (!Array.isArray(bag.marbles)) fail("marbles doit être une liste de { marble, count }.");
  const seen = new Set();
  for (const entry of bag.marbles) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) fail("chaque entrée de marbles est { marble, count }.");
    rejectUnknownFields(entry, ["marble", "count"], "entrée de sac", fail);
    if (typeof entry.marble !== "string" || entry.marble === "") fail("marble doit être un id de bille, un texte non vide.");
    if (!isCount(entry.count, 1)) fail(`"${entry.marble}" : count doit être un entier >= 1.`);
    if (seen.has(entry.marble)) fail(`"${entry.marble}" en double : une entrée par bille, avec son nombre d'exemplaires.`);
    seen.add(entry.marble);
  }
}

function defaultFail(bag) {
  return (message) => {
    throw new Error(`marbles, sac "${bag?.id}" : ${message}`);
  };
}

// Le nombre de billes d'un sac, tous exemplaires compris.
export function bagSize(bag) {
  return bag.marbles.reduce((total, { count }) => total + count, 0);
}

// Les billes d'un sac, chaque exemplaire déroulé, dans l'ordre de sa composition :
// la liste d'ids d'où part la copie de partie, avant le mélange.
export function bagMarbles(bag) {
  return bag.marbles.flatMap(({ marble, count }) => Array.from({ length: count }, () => marble));
}

// Un sac d'id `id` composé d'après une liste d'ids (doublons permis) : chaque bille
// une fois, à sa première apparition, avec son nombre d'exemplaires. Pour les outils
// qui lisent un sac décrit en liste.
export function bagFromList(id, marbles) {
  const counts = new Map();
  for (const marble of marbles) counts.set(marble, (counts.get(marble) ?? 0) + 1);
  return { id, marbles: [...counts].map(([marble, count]) => ({ marble, count })) };
}

// LES PROBLÈMES d'un sac bien formé (en-tête), [] s'il est valide. `rules` : les
// règles de construction qui s'appliquent ; `types` : le catalogue ; `unlocked` : les
// ids des billes débloquées (une liste ou un Set), ou null pour ne pas consulter de
// collection (tout est permis). Une bille inconnue n'est soumise à aucune règle : elle
// n'a ni rareté ni nom.
export function bagProblems(bag, rules, { types, unlocked = null }) {
  const open = unlocked === null ? null : new Set(unlocked);
  const problems = [];
  for (const { marble } of bag.marbles) {
    if (!Object.hasOwn(types, marble)) problems.push({ code: "unknownMarble", marble });
    else if (open !== null && !open.has(marble)) problems.push({ code: "lockedMarble", marble });
  }
  const known = { ...bag, marbles: bag.marbles.filter(({ marble }) => Object.hasOwn(types, marble)) };
  for (const [kind, rule] of Object.entries(BUILD_RULE_KINDS)) {
    if (rules[kind] !== undefined && rules[kind] !== null) problems.push(...rule.check(known, rules[kind], types));
  }
  return problems;
}

// --- Le registre des sacs préfaits ---

// Échoue sur un registre de sacs préfaits mal formé : un objet { id: sac }, chaque sac
// nommé par sa clé, bien formé, SANS nom propre (le sien se déduit de son id), et
// valide selon `rules` (les règles par défaut) avec tout le catalogue : un sac préfait
// se joue tel quel.
export function validatePresetBags(bags, types, rules) {
  if (bags === null || typeof bags !== "object" || Array.isArray(bags)) throw new Error("marbles : le registre des sacs est un objet { id: sac }.");
  for (const [id, bag] of Object.entries(bags)) {
    if (bag?.id !== id) throw new Error(`marbles : le sac "${id}" doit porter son id ("${bag?.id}").`);
    validateBagFormat(bag);
    if (bag.name !== undefined) throw new Error(`marbles, sac "${id}" : un sac préfait n'a pas de name, son nom est un texte (marbles.bag.${id}.name).`);
    const problems = bagProblems(bag, rules, { types });
    if (problems.length > 0) throw new Error(`marbles, sac "${id}" : invalide selon les règles par défaut (${problems.map(describeProblem).join(" ; ")}).`);
  }
}

// Un problème en clair, pour les erreurs et les outils (les textes du jeu :
// marbles/view/narration/bags.js).
export function describeProblem({ code, ...params }) {
  return `${code} ${JSON.stringify(params)}`;
}

// --- Les emplacements du joueur (en-tête) ---

// Des emplacements tous vides.
export function emptyBagSlots(count = BAG_SLOTS) {
  if (!isCount(count, 1)) throw new Error("marbles : le nombre d'emplacements de sacs doit être un entier >= 1.");
  return Array.from({ length: count }, () => null);
}

// Les emplacements dont l'emplacement `index` vaut `bag` (null : vidé). Une copie ;
// un indice hors des emplacements ou un sac mal formé lève.
export function withBagSlot(slots, index, bag) {
  if (!Number.isInteger(index) || index < 0 || index >= slots.length) throw new Error(`marbles : emplacement de sac ${index} hors de 0 à ${slots.length - 1}.`);
  if (bag !== null) validateBagFormat(bag);
  return slots.map((slot, at) => (at === index ? (bag === null ? null : structuredClone(bag)) : slot));
}
