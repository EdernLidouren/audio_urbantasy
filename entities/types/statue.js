// Archétype "statue" — voir entities/types/index.js pour le registre complet
// et doc/entity-model.md pour le vocabulaire du modèle d'entité. Donnée pure :
// aucun import.
//
// Générique par nature (comme door.js) : nameKey/descriptionKey restent des
// défauts minimaux, chaque statue PARTICULIÈRE (ex. l'instance
// shellter_statue_1_r de scenes/town-square.json) les surcharge à l'instance
// avec son propre nom/sa propre description — même
// patron que door.default.name/description pour door.js.
export default {
  nameKey: "entity.default_statue.name",
  descriptionKey: "entity.default_statue.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/stone_slab_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
