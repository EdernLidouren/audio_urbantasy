// CATALOGUES de point de vente (voir core/catalog.js, core/trade.js/buyItems,
// view/menus/shop-menu.js). Donnée pure, ZÉRO import, même patron que
// config/spawn-values.js : le moteur ne fait que LIRE.
//
// Un catalogue = { <objet du sac (core/items.js/ITEM_REGISTRY)>: { stock,
// price? } } — `stock` : quantité en rayon PAR CYCLE quotidien (rechargée à
// cette valeur au cycle de collecte, voir core/spawn.js) ; `price` optionnel :
// prix d'achat unitaire, défaut = `value` de l'objet (pleine valeur, aucune
// marge pour l'instant). Un point de vente RÉFÉRENCE un catalogue par son
// nom ({ table: "general" }) ou déclare le sien inline ({ items: { ... } }).
//
// Validés au chargement (core/catalog.js/validateShopCatalogs) : objet
// connu, stock entier >= 0, prix résolvable > 0.

export const SHOP_CATALOGS = {
  general: {
    apple: { stock: 5 },
    coin: { stock: 20 },
    sneakers: { stock: 1 },
    leather_boots: { stock: 1 },
  },
};
