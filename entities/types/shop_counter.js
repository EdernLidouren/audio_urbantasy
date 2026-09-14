// Archétype "shop_counter" — POINT DE VENTE (voir doc/entity-model.md/
// "Vente et achat", view/menus/shop-menu.js) : un comptoir qu'on active pour
// ouvrir un menu d'actions ("Vendre", "Acheter"). Action `{ kind: "shop" }`
// (voir view/interaction.js/ACTION_HANDLERS) : le core ne fait que la
// transporter. `shop.catalog` (cascade instance -> type, comme
// `container.distribution`) : catalogue standard "general" par défaut, une
// instance peut en référencer un autre ou déclarer le sien inline. Beacon :
// coin_push_beacon (tiroir-caisse).
export default {
  nameKey: "entity.shop_counter.name",
  descriptionKey: "entity.shop_counter.description",
  sounds: {
    beacon: { path: "assets/sounds/items/coin_push_beacon", loop: true },
  },
  shop: { catalog: { table: "general" } },
  blocksMovement: false,
  observable: true,
  interactable: true,
  highlight: true,
  action: { kind: "shop" },
};
