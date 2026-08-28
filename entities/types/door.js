// Archétype "door" — voir entities/model.md pour le vocabulaire du modèle
// d'entité (sounds, cascade) et entities/types/index.js pour le registre
// complet. Donnée pure : aucun import, importable par le core comme par la
// vue.

export default {
  label: "entity.door",
  descriptionKey: "entity.door.description",
  sounds: {
    beacon: { path: "assets/sounds/entities/door_beacon_1.mp3", loop: true },
  },
  blocksMovement: false,
  // observable : a une description. interactable : entrée déclenche la
  // transition (voir view/interaction.js) — ANCIEN enterable:true, renommé
  // (système d'interaction niveau 0, voir entities/model.md).
  observable: true,
  interactable: true,
};
