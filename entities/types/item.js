// Archétype "item" — un objet du monde RAMASSABLE VERS LE SAC (voir
// entities/model.md/"Sac d'objets"), par opposition à "money" (vers
// session.money) : action { kind: "pickup", item: <type>, count: <n> },
// <type> référence une entrée de core/items.js/ITEM_REGISTRY.
//
// Preset GÉNÉRIQUE, PAS un objet précis — contrairement à "money" (un seul
// type d'argent, un seul label pertinent), CE type recouvre N objets
// différents (pomme, clé...) : chaque INSTANCE de niveau doit donc fournir
// SON PROPRE nameKey/descriptionKey/action (label/description/action.item
// génériques n'auraient aucun sens ici). Convention : donner à l'instance
// le MÊME nameKey que ITEM_REGISTRY[type].label, pour que le nom annoncé au
// ramassage ("Ramassé : <objet>", voir view/interaction.js) corresponde à
// celui affiché dans le sac — jamais une contrainte structurelle, juste la
// pratique attendue du contenu.
export default {
  label: "entity.item",
  descriptionKey: "entity.item.description",
  // Pool réutilisé (déjà utilisé par money.js/npc.js/crate.js, voir leurs
  // commentaires) : aucun son "objet" dédié pour l'instant.
  sounds: {
    beacon: { path: "assets/sounds/entities/box_of_nails_beacon_1.mp3", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
};
