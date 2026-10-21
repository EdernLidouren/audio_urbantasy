// CATALOGUE d'un point de vente (couche "quoi est en rayon" de l'achat, voir
// doc/entity-model.md/"Vente et achat") — pur, headless. Même modèle qu'une
// distribution de collecte (core/distribution.js) : RÉFÉRENCE à un catalogue
// standard ({ table: "<nom>" }, config/shop-values.js/SHOP_CATALOGS) ou
// catalogue INLINE ({ items: { <objet>: { stock, price? } } }), résolu à
// chaque lecture (jamais figé dans l'état). L'ÉTAT de stock courant, lui,
// vit sur l'entité (entity.shopStock / shopCycle, voir restockShopEntity).
//
// Module SÉPARÉ de core/trade.js pour que core/entity-parse.js et
// core/save.js (validation) et core/spawn.js (rechargement au cycle)
// l'importent sans tirer la transaction — jamais d'import circulaire.

import { SHOP_CATALOGS } from "../config/shop-values.js";
import { ITEM_REGISTRY, itemValue } from "./items.js";

// Prix d'achat unitaire d'un article : `price` déclaré, sinon `value` de
// l'objet (pleine valeur). 0 si aucun des deux n'est un entier positif.
export function articlePrice(type, article) {
  if (Number.isInteger(article.price) && article.price > 0) return article.price;
  return itemValue(type);
}

function validateCatalogTable(items, describe, fail) {
  if (typeof items !== "object" || items === null || Array.isArray(items)) {
    fail(`${describe} doit être un objet { objet: { stock, price? } }.`);
  }
  const entries = Object.entries(items);
  if (entries.length === 0) {
    fail(`${describe} est vide.`);
  }
  for (const [type, article] of entries) {
    if (!ITEM_REGISTRY[type]) {
      fail(`${describe} : objet "${type}" absent de ITEM_REGISTRY.`);
    }
    if (typeof article !== "object" || article === null || !Number.isInteger(article.stock) || article.stock < 0) {
      fail(`${describe} : article "${type}" — stock doit être un entier >= 0.`);
    }
    if (article.price !== undefined && (!Number.isInteger(article.price) || article.price <= 0)) {
      fail(`${describe} : article "${type}" — price doit être un entier > 0 si présent.`);
    }
    if (articlePrice(type, article) === 0) {
      fail(`${describe} : article "${type}" sans prix résolvable (ni price, ni value sur l'objet).`);
    }
  }
}

// Auto-validation des catalogues STANDARD au chargement (voir l'appel plus
// bas) — EXPORTÉE pour être testable contre une table fabriquée.
export function validateShopCatalogs(catalogs) {
  const fail = (message) => {
    throw new Error(`shop-values: ${message}`);
  };
  if (typeof catalogs !== "object" || catalogs === null || Object.keys(catalogs).length === 0) {
    fail("aucun catalogue.");
  }
  for (const [name, items] of Object.entries(catalogs)) {
    validateCatalogTable(items, `catalogue "${name}"`, fail);
  }
}

validateShopCatalogs(SHOP_CATALOGS);

// Valide UN catalogue déclaré par un point de vente — `fail` fourni par
// l'appelant (core/entity-parse.js/parseShop, ou core/save.js à la
// relecture). EXACTEMENT une des deux formes.
export function validateCatalog(catalog, describe, fail) {
  if (typeof catalog !== "object" || catalog === null || Array.isArray(catalog)) {
    fail(`${describe} doit être un objet { table } ou { items }.`);
  }
  const { table, items } = catalog;
  if ((table === undefined) === (items === undefined)) {
    fail(`${describe} doit déclarer SOIT table SOIT items, jamais les deux ni aucun.`);
  }
  if (table !== undefined) {
    if (typeof table !== "string" || !SHOP_CATALOGS[table]) {
      fail(`${describe} : catalogue ${JSON.stringify(table)} absent de SHOP_CATALOGS.`);
    }
    return;
  }
  validateCatalogTable(items, `${describe}.items`, fail);
}

// Articles d'un catalogue. `null` (neutralisé à la relecture d'une
// sauvegarde, voir core/save.js/repairContentReferences) : aucun article.
export function resolveCatalog(catalog) {
  if (catalog === null) return {};
  return catalog.table !== undefined ? SHOP_CATALOGS[catalog.table] : catalog.items;
}

// Stock PLEIN d'un catalogue : { <objet>: stock } — l'état de départ d'un
// cycle.
export function fullStockOf(catalog) {
  const stock = {};
  for (const [type, article] of Object.entries(resolveCatalog(catalog))) {
    stock[type] = article.stock;
  }
  return stock;
}

// Recharge le rayon d'un point de vente pour le cycle donné : stock plein
// (valeur de table, jamais un cumul avec l'invendu), cycle mémorisé —
// appelé par core/spawn.js au garnissage (chargement du monde) ET
// paresseusement à l'ouverture du comptoir (core/trade.js/restockShopIfDue),
// même asymétrie assumée qu'un conteneur (contenu caché, rien ne "poppe").
export function restockShopEntity(entity, cycle) {
  return { ...entity, shopStock: fullStockOf(entity.shop.catalog), shopCycle: cycle };
}
