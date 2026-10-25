// Archétype "highway_traffic" — une voie de circulation, flux continu de
// véhicules. Décor sonore pur : beacon continu, non interactif, jamais
// bloquant (traverser la route n'a pas encore de règle de jeu). Une source
// PONCTUELLE pour un bruit étendu : la route se rend comme les autres
// entités, par pan et volume selon la distance.
export default {
  nameKey: "entity.highway_traffic.name",
  descriptionKey: "entity.highway_traffic.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/highway_traffic_1_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
