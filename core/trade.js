// VENTE et ACHAT (transactions du point de vente, voir view/menus/
// shop-menu.js pour les menus) — pur, headless. Vente : le prix vient de
// `value` sur l'objet (core/items.js/ITEM_REGISTRY), pleine valeur, aucune
// marge ; un objet sans `value` (ou 0) n'est pas vendable. Achat : catalogue
// du point de vente (core/catalog.js — articles, prix, stock FINI rechargé
// au cycle de collecte), fonds vérifiés, stock clampé. Achat à un
// PRÉSENTOIR (core/display.js) : l'article du jour, un exemplaire, objet ou
// amélioration. Compose addItem/removeItem (core/bag.js), giveImprovement
// (core/improvements.js) et addMoney (core/money.js) : aucune seconde
// logique de sac, d'amélioration ni d'argent.

import { ITEM_REGISTRY, itemValue } from "./items.js";
import { addItem, removeItem } from "./bag.js";
import { addMoney } from "./money.js";
import { hasImprovement, giveImprovement } from "./improvements.js";
import { resolveFace, updateActiveFace } from "./state.js";
import { spawnCycleAt } from "./spawn.js";
import { resolveCatalog, articlePrice, restockShopEntity } from "./catalog.js";
import { offeredArticle } from "./display.js";

// Prix de vente unitaire d'un type d'objet — 0 si non vendable (absent du
// registre, sans `value`, ou `value` non entier positif).
export function sellValueOf(type) {
  return itemValue(type);
}

export function isSellable(type) {
  return sellValueOf(type) > 0;
}

// Quantité TOTALE d'un type dans le sac — somme des entrées (un empilable
// n'en a qu'une, un non-empilable une par exemplaire, voir core/bag.js).
export function ownedQuantity(bag, type) {
  return bag.reduce((total, entry) => (entry.type === type ? total + (entry.quantity ?? 1) : total), 0);
}

// Effet d'ÉTAT de la vente : retire les quantités du sac ET crédite
// session.money du total, dans le MÊME nouvel état (jamais l'un sans
// l'autre). Défensif : quantité CLAMPÉE au possédé, type non vendable
// ignoré — jamais un sac négatif ni un crédit sans retrait. Rien à vendre
// (tout ignoré/vide) -> RÉFÉRENCE INCHANGÉE.
export function sellItems(session, sales) {
  let next = session;
  let total = 0;
  for (const { type, quantity } of sales) {
    if (!isSellable(type) || !Number.isInteger(quantity) || quantity <= 0) continue;
    const count = Math.min(quantity, ownedQuantity(next.bag, type));
    // Un retrait PAR EXEMPLAIRE : removeItem(type, n) ne décrémente n que
    // pour un empilable (un non-empilable retire une entrée par appel).
    for (let i = 0; i < count; i++) next = removeItem(next, type, 1);
    total += sellValueOf(type) * count;
  }
  if (total === 0) return session;
  return addMoney(next, total);
}

// --- Achat ---

// Entité de la FACE ACTIVE qui porte le champ `field` ("shop", "display"),
// avec sa position pour la remplacer ensuite — null sinon.
function findMerchant(session, entityId, field) {
  const world = session.worlds[session.activeWorldId];
  const face = resolveFace(world, session.player.side);
  const index = face.entities.findIndex((e) => e.id === entityId);
  const entity = face.entities[index];
  return entity && entity[field] ? { world, face, index, entity } : null;
}

const findShop = (session, entityId) => findMerchant(session, entityId, "shop");

function replaceMerchant(session, found, entity) {
  const entities = found.face.entities.map((e, i) => (i === found.index ? entity : e));
  return updateActiveFace(session, { entities });
}

// Articles en rayon d'un point de vente, dans l'ordre du catalogue :
// [{ type, price, stock }] — `stock` : état COURANT (entity.shopStock), 0
// si jamais rechargé (voir restockShopIfDue) ou épuisé. Lu par la vue pour
// construire le menu d'achat.
export function shopArticles(entity) {
  const stockState = entity.shopStock ?? {};
  // Un catalogue enregistré dans un monde sauvegardé peut citer un objet
  // retiré du registre depuis : il est simplement ignoré, jamais proposé.
  return Object.entries(resolveCatalog(entity.shop.catalog))
    .filter(([type]) => Object.hasOwn(ITEM_REGISTRY, type))
    .map(([type, article]) => ({
    type,
    price: articlePrice(type, article),
    stock: stockState[type] ?? 0,
  }));
}

// Rechargement PARESSEUX d'un point de vente de la FACE ACTIVE si un cycle
// est passé depuis son dernier stock (ou s'il n'a jamais été rechargé) —
// appelé à l'activation du comptoir (voir view/action-handlers.js), pendant du
// garnissage au chargement (core/spawn.js). Rien de dû, ou id non marchand
// -> RÉFÉRENCE INCHANGÉE.
export function restockShopIfDue(session, entityId) {
  const found = findShop(session, entityId);
  if (!found) return session;
  const cycle = spawnCycleAt(session.time);
  if (found.entity.shopCycle === cycle) return session;
  return replaceMerchant(session, found, restockShopEntity(found.entity, cycle));
}

// Effet d'ÉTAT de l'achat : DÉBITE session.money, AJOUTE les articles au sac,
// DÉCRÉMENTE le stock du point de vente — dans le MÊME nouvel état. Défensif
// : quantité CLAMPÉE au stock, article hors catalogue ou quantité <= 0
// ignorés ; FONDS revérifiés ici (jamais un débit au-delà de l'argent
// possédé, même si la vue a déjà filtré) ; rien d'achetable ou fonds
// insuffisants -> RÉFÉRENCE INCHANGÉE. Pas de limite de sac à respecter
// (voir core/bag.js, aucune capacité).
export function buyItems(session, entityId, purchases) {
  const found = findShop(session, entityId);
  if (!found) return session;
  const articles = Object.fromEntries(shopArticles(found.entity).map((a) => [a.type, a]));

  const clamped = [];
  let total = 0;
  for (const { type, quantity } of purchases) {
    const article = articles[type];
    if (!article || !Number.isInteger(quantity) || quantity <= 0) continue;
    const count = Math.min(quantity, article.stock);
    if (count === 0) continue;
    clamped.push({ type, count });
    total += article.price * count;
  }
  if (total === 0 || total > session.money) return session;

  const stock = { ...(found.entity.shopStock ?? {}) };
  let next = session;
  for (const { type, count } of clamped) {
    next = addItem(next, type, count);
    stock[type] = (stock[type] ?? 0) - count;
  }
  next = replaceMerchant(next, found, { ...found.entity, shopStock: stock });
  return addMoney(next, -total);
}

// --- Achat à un présentoir (core/display.js) ---

// Effet d'ÉTAT de l'achat de l'article exposé par un présentoir de la FACE
// ACTIVE : DÉBITE son prix, DONNE l'article (objet -> sac via addItem, qui
// le note acquis ; amélioration -> giveImprovement) et VIDE le présentoir
// (`offer: null`, jusqu'au prochain garnissage) — dans le MÊME nouvel état.
// Rend { session, status } ; tout refus laisse la RÉFÉRENCE INCHANGÉE :
//   - "bought" : achat fait ;
//   - "empty" : présentoir vide (vendu, tirage "rien", jamais garni) ;
//   - "alreadyOwned" : l'amélioration exposée est déjà possédée (obtenue
//     ailleurs depuis le garnissage du jour) — lue sur l'état RÉEL, jamais
//     via le court-circuit debug de la condition hasImprovement ;
//   - "insufficientFunds" : prix au-delà de l'argent possédé, jamais de
//     débit partiel ;
//   - null : l'id n'est pas un présentoir de la face active.
export function buyOfferedArticle(session, entityId) {
  const found = findMerchant(session, entityId, "display");
  if (!found) return { session, status: null };
  const article = offeredArticle(found.entity);
  if (!article) return { session, status: "empty" };
  if (article.improvement !== undefined && hasImprovement(session.improvements, article.improvement)) {
    return { session, status: "alreadyOwned" };
  }
  if (article.price > session.money) return { session, status: "insufficientFunds" };

  let next =
    article.item !== undefined
      ? addItem(session, article.item, 1)
      : { ...session, improvements: giveImprovement(session.improvements, article.improvement) };
  next = replaceMerchant(next, found, { ...found.entity, offer: null });
  return { session: addMoney(next, -article.price), status: "bought" };
}
