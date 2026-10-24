// Archétype "automatic_sliding_door" — porte automatique coulissante, de la
// famille des portes (voir entities/types/door.js, textes sous `door.*`).
// Donnée pure : aucun import.
//
// PAS DE BALISE, contrairement à une porte ordinaire : elle se fait entendre
// par ses SONS DE PROXIMITÉ (voir view/audio/proximity-sounds.js,
// doc/entity-model.md/"Sons de proximité"). Elle s'ouvre quand le joueur
// entre dans sa zone d'interaction, et se referme un instant après qu'il en
// est sorti (proximityHoldMs). Purement sonore : Entrée la franchit quel que
// soit son état.
//
// Comme une porte : pas d'action ici, la destination varie par instance ;
// et pas de son d'ouverture dans l'action, la porte est déjà ouverte quand
// on est assez près pour la franchir.
export default {
  nameKey: "door.automatic_sliding.name",
  descriptionKey: "door.automatic_sliding.description",
  sounds: {
    approachSound: { path: "assets/sounds/doors/automatic_sliding_door_1_open" },
    leaveSound: { path: "assets/sounds/doors/automatic_sliding_door_1_close" },
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
  // Surlignage audio de proximité, comme une porte (voir doc/entity-model.md).
  highlight: true,
};
