// Archétype "coin" — l'objet "pièce" du SAC (voir core/items.js/
// ITEM_REGISTRY.coin) : preset DÉDIÉ comme apple.js, pas le générique
// item.js — une pièce a SON propre son (coin_beacon). DISTINCT de money.js
// (une somme au sol créditée directement dans session.money) : ici c'est un
// objet EMPILABLE du sac, ramassable/posable comme une pomme.
//
// nameKey/descriptionKey/action réutilisent les clés de ITEM_REGISTRY.coin :
// une instance minimale ({ type: "coin", x }) suffit.
export default {
  nameKey: "item.coin.name",
  descriptionKey: "item.coin.description",
  sounds: {
    beacon: { path: "assets/sounds/items/coin_beacon", loop: true },
    // Son de RAMASSAGE (rôle `pickup`, voir doc/entity-model.md/"Son de
    // ramassage") : même pool que la balise.
    pickup: { path: "assets/sounds/items/coin_beacon" },
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
  highlight: true,
  action: { kind: "pickup", item: "coin", count: 1 },
};
