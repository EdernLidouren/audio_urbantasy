// VENTE (transaction du point de vente, voir view/menus/shop-menu.js pour
// le menu) — pur, headless. Le prix vient de `value` sur l'objet
// (core/items.js/ITEM_REGISTRY) : pleine valeur pour l'instant, aucune
// marge — la marge marchand arrivera avec l'ACHAT, pas ici. Un objet sans
// `value` (ou 0) n'est pas vendable. Compose removeItem (core/bag.js) et
// addMoney (core/money.js) : aucune seconde logique de sac ni d'argent.

import { ITEM_REGISTRY } from "./items.js";
import { removeItem } from "./bag.js";
import { addMoney } from "./money.js";

// Prix de vente unitaire d'un type d'objet — 0 si non vendable (absent du
// registre, sans `value`, ou `value` non entier positif).
export function sellValueOf(type) {
  const value = ITEM_REGISTRY[type] && ITEM_REGISTRY[type].value;
  return Number.isInteger(value) && value > 0 ? value : 0;
}

export function isSellable(type) {
  return sellValueOf(type) > 0;
}

// Quantité TOTALE d'un type dans le sac — somme des entrées (un empilable
// n'en a qu'une, un non-empilable une par exemplaire, voir core/bag.js).
export function ownedQuantity(bag, type) {
  return bag.reduce((total, entry) => (entry.type === type ? total + (entry.quantity ?? 1) : total), 0);
}

// Montant d'une vente : Σ prix unitaire × quantité — `sales` : [{ type,
// quantity }]. Les types non vendables comptent 0.
export function sellTotal(sales) {
  return sales.reduce((total, { type, quantity }) => total + sellValueOf(type) * quantity, 0);
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
