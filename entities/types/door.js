// Archétype "door" — voir entities/model.md pour le vocabulaire du modèle
// d'entité (sounds, cascade) et entities/types/index.js pour le registre
// complet. Donnée pure : aucun import, importable par le core comme par la
// vue.

// PAS de cascade `action` ici (contrairement à d'autres archétypes) : une
// porte n'a plus rien de commun à l'échelle du TYPE — sa cible (`teleport.
// target`, voir core/scripting.md/"Effets d'action") varie par INSTANCE,
// chaque porte doit donc déclarer SA PROPRE `action` complète (voir
// level/demo.json et consorts). La porte n'est PLUS un cas spécial du core
// ni de la vue : juste une entité `interactable` ordinaire dont l'action
// déclenche un effet "teleport" comme n'importe quel autre contenu.
export default {
  label: "entity.door",
  descriptionKey: "entity.door.description",
  sounds: {
    beacon: { path: "assets/sounds/entities/door_beacon_1.mp3", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
};
