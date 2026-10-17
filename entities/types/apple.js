// Archétype "apple" — l'objet "pomme" du sac (voir entities/model.md/"Sac
// d'objets", core/items.js/ITEM_REGISTRY.apple) : un PRESET DÉDIÉ (comme
// money.js/crate.js), pas le générique entities/types/item.js — une pomme a
// SON PROPRE son (fruit_beacon), ce que le type générique ne permet pas de
// surcharger par instance (sounds n'a pas de cascade d'instance,
// contrairement aux paramètres numériques résolus par resolveTuning — voir
// entities/model.md, "Résolution en cascade").
//
// nameKey/descriptionKey/action réutilisent DIRECTEMENT les mêmes clés que
// core/items.js/ITEM_REGISTRY.apple.label/descriptionKey : une instance de
// scène minimale ({ type: "apple", x }) suffit donc, sans jamais répéter
// nameKey/descriptionKey/action — le nom annoncé au ramassage correspond
// déjà à celui du sac par construction, pas seulement par convention.
export default {
  nameKey: "item.apple.name",
  descriptionKey: "item.apple.description",
  sounds: {
    beacon: { path: "assets/sounds/items/fruit_beacon", loop: true },
    // Son de RAMASSAGE (rôle `pickup`, voir doc/entity-model.md/"Son de
    // ramassage") : DÉCLARÉ par archétype, jamais imposé — un objet sans ce
    // rôle se ramasse en silence. Même pool que la balise : la pomme sonne
    // pareil qu'on la repère ou qu'on la prenne.
    pickup: { path: "assets/sounds/items/fruit_beacon" },
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
  // Surlignage audio de proximité (voir entities/model.md) : une pomme se
  // repère nettement une fois à portée.
  highlight: true,
  action: { kind: "pickup", item: "apple", count: 1 },
};
