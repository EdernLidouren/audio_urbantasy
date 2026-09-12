// DISTRIBUTION de collectibles (couche "quoi peut apparaître" de la
// collecte, voir doc/entity-model.md/"Collecte") — pur, headless. Une
// distribution est soit une RÉFÉRENCE à une table standard
// ({ table: "<nom>" }, config/spawn-values.js/SPAWN_TABLES), soit une table
// INLINE ({ items: { <objet>: <poids> } }) — même cascade "référencé ou
// déclaré" que le reste du contenu. Résolue à CHAQUE tirage (jamais figée
// dans l'état) : un monde sauvegardé garde la référence, et tire toujours
// dans la table COURANTE.
//
// Tirage pondéré : core/weather.js/pickTransition, réutilisé TEL QUEL — une
// table d'objets a exactement la forme d'une table de transitions météo
// ({ cible: poids }), aucune seconde logique de tirage.
//
// Module SÉPARÉ de core/spawn.js pour que core/level.js puisse valider une
// distribution au chargement sans importer le moteur de spawn (qui, lui,
// importe core/level.js — voir parseSpawnedEntity) : jamais d'import
// circulaire.

import { SPAWN_TABLES } from "../config/spawn-values.js";
import { ITEM_REGISTRY } from "./items.js";
import { pickTransition } from "./weather.js";

// Une table d'objets : au moins une entrée, chaque objet dans ITEM_REGISTRY,
// chaque poids fini >= 0, au moins un poids > 0 (jamais une table sans
// issue — même exigence que validateWeatherStates).
function validateItemsTable(items, describe, fail) {
  if (typeof items !== "object" || items === null || Array.isArray(items)) {
    fail(`${describe} doit être un objet { objet: poids }.`);
  }
  const entries = Object.entries(items);
  if (entries.length === 0) {
    fail(`${describe} est vide.`);
  }
  let hasPositiveWeight = false;
  for (const [item, weight] of entries) {
    if (!ITEM_REGISTRY[item]) {
      fail(`${describe} : objet "${item}" absent de ITEM_REGISTRY.`);
    }
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) {
      fail(`${describe} : poids invalide pour "${item}" (${JSON.stringify(weight)}).`);
    }
    if (weight > 0) hasPositiveWeight = true;
  }
  if (!hasPositiveWeight) {
    fail(`${describe} : aucun poids positif.`);
  }
}

// Auto-validation des tables STANDARD au chargement du module (voir
// l'appel plus bas) — EXPORTÉE pour être testable contre une table
// fabriquée (core/movement.check.js), jamais la vraie.
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

// Valide UNE distribution déclarée par une source — `fail` fourni par
// l'appelant (core/level.js), même patron que parseVariables. EXACTEMENT une
// des deux formes : { table } (nom présent dans SPAWN_TABLES) ou { items }
// (table inline, validée comme une table standard).
export function validateDistribution(distribution, describe, fail) {
  if (typeof distribution !== "object" || distribution === null || Array.isArray(distribution)) {
    fail(`${describe} doit être un objet { table } ou { items }.`);
  }
  const { table, items } = distribution;
  if ((table === undefined) === (items === undefined)) {
    fail(`${describe} doit déclarer SOIT table SOIT items, jamais les deux ni aucun.`);
  }
  if (table !== undefined) {
    if (typeof table !== "string" || !SPAWN_TABLES[table]) {
      fail(`${describe} : table "${JSON.stringify(table)}" absente de SPAWN_TABLES.`);
    }
    return;
  }
  validateItemsTable(items, `${describe}.items`, fail);
}

// Table effective d'une distribution déjà validée — relue à chaque appel
// (voir header : jamais figée).
export function resolveDistribution(distribution) {
  return distribution.table !== undefined ? SPAWN_TABLES[distribution.table] : distribution.items;
}

// Tire UN objet dans la distribution, via le PRNG seedé passé en paramètre
// (un tirage consommé, rngState renvoyé pour enchaîner).
export function drawItem(distribution, rngState) {
  const picked = pickTransition(resolveDistribution(distribution), rngState);
  return { item: picked.target, rngState: picked.rngState };
}
