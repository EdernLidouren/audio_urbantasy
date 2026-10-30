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
// connu, stock entier >= 0, prix résolvable > 0. Les articles et tables de
// PRÉSENTOIR (plus bas) le sont par core/display.js.

export const SHOP_CATALOGS = {
  general: {
    apple: { stock: 5 },
    coin: { stock: 20 },
    sneakers: { stock: 1 },
    leather_boots: { stock: 1 },
  },
};

// ARTICLES DE PRÉSENTOIR (voir core/display.js) : ce qu'un présentoir du
// magasin peut exposer, un exemplaire à la fois. UNE des deux natures :
//   - { item: <objet de ITEM_REGISTRY>, price? } : l'objet va au sac ;
//     `price` optionnel, défaut = `value` de l'objet ;
//   - { improvement: <id de IMPROVEMENT_REGISTRY>, price } : l'amélioration
//     est acquise ; `price` OBLIGATOIRE (une amélioration n'a pas de valeur).
// Nom et description viennent du registre visé, jamais d'ici. Deux articles
// ne visent jamais le même objet ni la même amélioration (validé à l'import).
// `sound` optionnel : pool de la balise de l'article sur son présentoir ;
// défaut = `sound` de l'objet visé, sinon la balise de repli du présentoir
// (entities/types/shop_display.js).
// Prix PROVISOIRES, à doser avec la boucle de jeu.
export const DISPLAY_ARTICLES = {
  flashlight: { improvement: "flashlight", price: 200, sound: "assets/sounds/items/flashlight_1_beacon" },
  sneakers: { item: "sneakers" },
  leather_boots: { item: "leather_boots" },
  combat_boots: { item: "combat_boots" },
  high_heels: { item: "high_heels" },
};

// TABLES DE PRÉSENTOIR : { <article de DISPLAY_ARTICLES>: <poids> } — poids
// RELATIFS, un nombre ou un niveau de rareté (config/spawn-values.js/
// RARITY_LEVELS), comme une table de collecte ; la clé réservée `nothing`
// laisse le présentoir vide ce jour-là. Un présentoir en référence une par
// son nom ({ table: "improvements" }) ou déclare la sienne inline
// ({ articles: { ... } }).
export const DISPLAY_TABLES = {
  // Premier présentoir du bazar : les améliorations. La lampe torche, seule
  // pour l'instant, sort tant qu'elle n'est pas achetée.
  improvements: { flashlight: 1 },
  equipment: { sneakers: "common", leather_boots: "uncommon", high_heels: "uncommon", combat_boots: "rare" },
};
