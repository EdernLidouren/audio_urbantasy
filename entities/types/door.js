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
  observable: true,
  interactable: true,
  // action:{kind:"transit"} — la porte rejoint l'aiguillage d'actions par
  // kind (voir view/interaction.js/ACTION_HANDLERS) : entrée déclenche la
  // transition vers `target` (voir plus bas dans le niveau qui l'instancie)
  // via le même mécanisme que tout autre kind, plus de court-circuit
  // `entity.type === "door"` dans la vue.
  action: { kind: "transit" },
};
