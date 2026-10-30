// Archétype "shop_display" — PRÉSENTOIR du magasin (voir doc/entity-model.md/
// "Présentoirs", core/display.js) : un emplacement FIXE qui expose chaque jour
// un article tiré dans sa table, jusqu'à ce qu'il soit acheté. Action
// `{ kind: "buy" }` (voir view/action-execution.js) : confirmation, puis
// achat. `display.distribution` est déclaré PAR INSTANCE (un présentoir
// d'améliorations, un d'équipement...) : l'archétype n'en impose aucun, et
// une instance qui l'oublie échoue au chargement (l'action "buy" l'exige).
//
// Garni, le présentoir se présente sous le NOM de son article
// (core/display.js/presentedLabelKey) et sonne sa balise (le son de
// l'article, voir config/shop-values.js/DISPLAY_ARTICLES). Vide, il ne sonne
// RIEN — un magasin aux présentoirs vendus ne doit pas bourdonner de meubles —
// et garde le nom et la description ci-dessous. La balise déclarée ici n'est
// qu'un REPLI, pour un article garni sans son à lui (pool générique des
// objets au sol, comme entities/types/item.js).
export default {
  nameKey: "entity.shop_display.name",
  descriptionKey: "entity.shop_display.description",
  sounds: {
    beacon: { path: "assets/sounds/items/box_of_nails_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
  // Surlignage audio de proximité : un article se repère nettement une
  // fois à portée, comme un objet au sol.
  highlight: true,
  action: { kind: "buy" },
};
