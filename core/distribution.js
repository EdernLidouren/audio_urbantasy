// DISTRIBUTION de collectibles (couche "quoi peut apparaître" de la
// collecte, voir doc/entity-model.md/"Collecte") — pur, headless. Une
// distribution a TROIS formes :
//   - une RÉFÉRENCE à une table standard ({ table: "<nom>" },
//     config/spawn-values.js/SPAWN_TABLES) ;
//   - une table INLINE ({ items: { <objet>: <poids> } }) — même cascade
//     "référencé ou déclaré" que le reste du contenu ;
//   - PLUSIEURS tables ({ tables: [{ table | items, weight? }, ...] }) :
//     chaque tirage choisit d'abord une table selon son poids (1 par
//     défaut), puis un objet DANS cette table, selon ses poids à elle. Les
//     échelles des tables ne se mélangent donc jamais (une table de raretés
//     1-100 ne noie pas une table 80/20). Un objet présent dans plusieurs
//     tables cumule simplement ses chances, sans règle d'écrasement.
// Dans toute table, la clé RÉSERVÉE `nothing` (NOTHING) est une issue
// pondérée comme les autres : le tirage ne donne alors RIEN.
// Résolue à CHAQUE tirage (jamais figée dans l'état) : un monde sauvegardé
// garde la référence, et tire toujours dans la table COURANTE.
//
// Tirage pondéré : core/weather.js/pickTransition, réutilisé TEL QUEL — une
// table d'objets a exactement la forme d'une table de transitions météo
// ({ cible: poids }), aucune seconde logique de tirage. Le choix "table
// puis objet" des tables multiples est réalisé en UN SEUL tirage, sur la
// table équivalente (voir resolveDistribution) : mêmes probabilités
// exactement, un seul pas de PRNG par objet comme les autres formes.
//
// Module SÉPARÉ de core/spawn.js pour que core/scene.js et
// core/entity-parse.js puissent valider une distribution au chargement sans
// importer le moteur de spawn (qui, lui, importe core/entity-parse.js —
// voir parseSpawnedEntity) : jamais d'import circulaire.

import { SPAWN_TABLES, RARITY_LEVELS } from "../config/spawn-values.js";
import { ITEM_REGISTRY } from "./items.js";
import { TAG_REGISTRY } from "./tags.js";
import { pickTransition } from "./weather.js";

// Clé RÉSERVÉE d'une table : l'issue "rien". Jamais un objet du sac — un
// registre qui en déclarerait un sous ce nom échoue au chargement.
export const NOTHING = "nothing";
if (Object.hasOwn(ITEM_REGISTRY, NOTHING)) {
  throw new Error(`distribution: "${NOTHING}" est une clé réservée des tables, jamais un objet de ITEM_REGISTRY.`);
}

// Poids d'un niveau de rareté, par nom ("rare") — voir
// config/spawn-values.js/RARITY_LEVELS.
const RARITY_WEIGHTS = Object.fromEntries(RARITY_LEVELS.map((level) => [level.name, level.weight]));

// Poids d'une entrée de table : un nombre tel quel, ou le nom d'un niveau
// de rareté. undefined si ni l'un ni l'autre (refusé à la validation).
function entryWeight(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && Object.hasOwn(RARITY_WEIGHTS, value)) return RARITY_WEIGHTS[value];
  return undefined;
}

// Poids d'un OBJET selon sa propre rareté (ITEM_REGISTRY.rarity, 1 à 5 =
// rang dans RARITY_LEVELS). undefined si l'objet n'en déclare pas de valide.
function itemRarityWeight(item) {
  const level = RARITY_LEVELS[(ITEM_REGISTRY[item] && ITEM_REGISTRY[item].rarity) - 1];
  return level ? level.weight : undefined;
}

// Table déduite { fromTag } -> { objet: poids }, dans l'ordre du registre.
function expandTagTable(tag) {
  const weights = {};
  for (const [item, props] of Object.entries(ITEM_REGISTRY)) {
    if ((props.tags || []).includes(tag)) weights[item] = itemRarityWeight(item);
  }
  return weights;
}

// Table effective, en poids NUMÉRIQUES, quelle que soit sa forme : c'est ce
// que reçoit le tirage (pickTransition).
function toWeights(table) {
  if (table.fromTag !== undefined) return expandTagTable(table.fromTag);
  return Object.fromEntries(Object.entries(table).map(([item, value]) => [item, entryWeight(value)]));
}

// Vrai si des poids NUMÉRIQUES peuvent donner un VRAI objet (autre que
// NOTHING, de poids > 0).
function canYieldItem(weights) {
  return Object.entries(weights).some(([item, weight]) => item !== NOTHING && weight > 0);
}

// Une table d'objets : au moins une entrée, chaque objet dans ITEM_REGISTRY
// (ou la clé réservée NOTHING), chaque poids fini >= 0, au moins un poids
// > 0 (jamais une table sans issue — même exigence que
// validateWeatherStates). Une table de RIEN seul est permise ici (utile
// comme membre d'une distribution multiple) ; c'est la DISTRIBUTION qui doit
// pouvoir donner un objet (voir validateDistribution).
function validateItemsTable(items, describe, fail) {
  if (typeof items !== "object" || items === null || Array.isArray(items)) {
    fail(`${describe} doit être un objet { objet: poids }.`);
  }
  // Table DÉDUITE d'une étiquette : l'étiquette doit exister, et chaque
  // objet qui la porte déclarer une rareté valide (1 à RARITY_LEVELS.length).
  if (items.fromTag !== undefined) {
    if (Object.keys(items).length !== 1) {
      fail(`${describe} : une table { fromTag } ne déclare rien d'autre.`);
    }
    if (!TAG_REGISTRY[items.fromTag]) {
      fail(`${describe} : étiquette "${items.fromTag}" absente de TAG_REGISTRY.`);
    }
    const weights = expandTagTable(items.fromTag);
    if (Object.keys(weights).length === 0) {
      fail(`${describe} : aucun objet ne porte l'étiquette "${items.fromTag}".`);
    }
    for (const [item, weight] of Object.entries(weights)) {
      if (weight === undefined) {
        fail(`${describe} : l'objet "${item}" n'a pas de rareté valide (1 à ${RARITY_LEVELS.length}).`);
      }
    }
    return;
  }
  const entries = Object.entries(items);
  if (entries.length === 0) {
    fail(`${describe} est vide.`);
  }
  let hasPositiveWeight = false;
  for (const [item, value] of entries) {
    if (item !== NOTHING && !ITEM_REGISTRY[item]) {
      fail(`${describe} : objet "${item}" absent de ITEM_REGISTRY.`);
    }
    // Un nombre, ou le nom d'un niveau de rareté (RARITY_LEVELS).
    const weight = entryWeight(value);
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) {
      fail(`${describe} : poids invalide pour "${item}" (${JSON.stringify(value)}) — un nombre, ou un niveau de rareté.`);
    }
    if (weight > 0) hasPositiveWeight = true;
  }
  if (!hasPositiveWeight) {
    fail(`${describe} : aucun poids positif.`);
  }
}

// Auto-validation des tables STANDARD au chargement du module (voir
// l'appel plus bas) — EXPORTÉE pour être testable contre une table
// fabriquée (core/checks/spawn.check.js), jamais la vraie.
export function validateSpawnTables(tables) {
  const fail = (message) => {
    throw new Error(`spawn-values: ${message}`);
  };
  if (typeof tables !== "object" || tables === null || Object.keys(tables).length === 0) {
    fail("aucune table de distribution.");
  }
  for (const [name, items] of Object.entries(tables)) {
    validateItemsTable(items, `table "${name}"`, fail);
  }
}

validateSpawnTables(SPAWN_TABLES);

// Valide UNE table simple — { table } (nom présent dans SPAWN_TABLES) ou
// { items } (table inline, validée comme une table standard), EXACTEMENT
// une des deux. `extraKeys` : clés tolérées en plus (le `weight` d'un
// membre de { tables }).
function validateSingleTable(source, describe, fail, extraKeys = []) {
  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    fail(`${describe} doit être un objet { table } ou { items }.`);
  }
  const { table, items } = source;
  if ((table === undefined) === (items === undefined)) {
    fail(`${describe} doit déclarer SOIT table SOIT items, jamais les deux ni aucun.`);
  }
  const unknown = Object.keys(source).filter((key) => !["table", "items", ...extraKeys].includes(key));
  if (unknown.length > 0) {
    fail(`${describe} : clé(s) inconnue(s) ${unknown.map((key) => `"${key}"`).join(", ")}.`);
  }
  if (table !== undefined) {
    if (typeof table !== "string" || !SPAWN_TABLES[table]) {
      fail(`${describe} : table ${JSON.stringify(table)} absente de SPAWN_TABLES.`);
    }
    return;
  }
  validateItemsTable(items, `${describe}.items`, fail);
}

// Valide UNE distribution déclarée par une source — `fail` fourni par
// l'appelant (core/scene.js pour une plage, core/entity-parse.js pour un
// conteneur, core/save.js à la relecture), même patron que parseVariables.
// EXACTEMENT une
// des trois formes (voir header) : { table }, { items } ou { tables }.
// Chaque membre de { tables } est lui-même un { table } ou un { items },
// plus un `weight` optionnel (nombre >= 0 ou niveau de rareté, défaut 1),
// au moins un membre de poids > 0. Quelle que soit la forme, la
// distribution doit pouvoir donner au moins un VRAI objet : une source qui
// ne tirerait jamais que `nothing` est une erreur de contenu.
export function validateDistribution(distribution, describe, fail) {
  if (typeof distribution !== "object" || distribution === null || Array.isArray(distribution)) {
    fail(`${describe} doit être un objet { table }, { items } ou { tables }.`);
  }
  if (distribution.tables !== undefined) {
    const { tables } = distribution;
    if (Object.keys(distribution).length !== 1) {
      fail(`${describe} : une distribution { tables } ne déclare rien d'autre.`);
    }
    if (!Array.isArray(tables) || tables.length === 0) {
      fail(`${describe}.tables doit être un tableau non vide.`);
    }
    let hasPositiveWeight = false;
    tables.forEach((member, index) => {
      const memberDescribe = `${describe}.tables[${index}]`;
      validateSingleTable(member, memberDescribe, fail, ["weight"]);
      const weight = member.weight === undefined ? 1 : entryWeight(member.weight);
      if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) {
        fail(`${memberDescribe} : poids invalide (${JSON.stringify(member.weight)}) — un nombre, ou un niveau de rareté.`);
      }
      if (weight > 0) hasPositiveWeight = true;
    });
    if (!hasPositiveWeight) {
      fail(`${describe}.tables : aucun poids de table positif.`);
    }
  } else {
    validateSingleTable(distribution, describe, fail);
  }
  if (!canYieldItem(resolveDistribution(distribution))) {
    fail(`${describe} ne peut jamais donner d'objet (que "${NOTHING}").`);
  }
}

// Poids NUMÉRIQUES d'une table simple ({ table } ou { items }).
function singleTableWeights(source) {
  return toWeights(source.table !== undefined ? SPAWN_TABLES[source.table] : source.items);
}

// Table effective d'une distribution déjà validée, en poids NUMÉRIQUES
// RELATIFS (noms de rareté et tables { fromTag } résolus) — relue à chaque
// appel (voir header : jamais figée). Forme simple : la table telle quelle.
// Forme { tables } : la table ÉQUIVALENTE au choix "table puis objet" —
// chaque table compte pour (son poids / total des poids de tables), répartis
// entre ses objets selon SES propres poids ; un objet présent dans plusieurs
// tables additionne ses parts. Ordre : première apparition, table après
// table (déterministe).
export function resolveDistribution(distribution) {
  if (distribution.tables === undefined) return singleTableWeights(distribution);
  const members = distribution.tables.map((member) => ({
    share: member.weight === undefined ? 1 : entryWeight(member.weight),
    weights: singleTableWeights(member),
  }));
  const totalShare = members.reduce((sum, member) => sum + member.share, 0);
  const merged = {};
  for (const { share, weights } of members) {
    const tableTotal = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    if (share <= 0 || tableTotal <= 0) continue;
    for (const [item, weight] of Object.entries(weights)) {
      merged[item] = (merged[item] ?? 0) + (share / totalShare) * (weight / tableTotal);
    }
  }
  return merged;
}

// Tire UN objet dans la distribution, via le PRNG seedé passé en paramètre
// (un tirage consommé, rngState renvoyé pour enchaîner). `item` vaut null
// quand le tirage tombe sur NOTHING : RIEN, le pas de PRNG est consommé
// quand même (le déterminisme ne dépend pas de l'issue).
export function drawItem(distribution, rngState) {
  const picked = pickTransition(resolveDistribution(distribution), rngState);
  return { item: picked.target === NOTHING ? null : picked.target, rngState: picked.rngState };
}
