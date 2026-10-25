// Archétype "highway_traffic" — une voie de circulation, flux continu de
// véhicules. Décor sonore pur : beacon continu, non interactif, jamais
// bloquant (traverser la route n'a pas encore de règle de jeu). Une source
// PONCTUELLE pour un bruit étendu : la route se rend comme les autres
// entités, par pan et volume selon la distance.
//
// Gain x2 sur le son (beaconGain) : les deux boucles de trafic sont mixées
// bas et déjà au plafond de leur fichier, impossible à remonter sans les
// abîmer. Posé sur le descripteur, il suit l'instance qui ne change que le
// chemin (cascade par fusion) : highway_traffic_2_beacon en profite aussi.
export default {
  nameKey: "entity.highway_traffic.name",
  descriptionKey: "entity.highway_traffic.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/highway_traffic_1_beacon", loop: true, beaconGain: 2 },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
