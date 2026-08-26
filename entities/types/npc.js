// Archétype "npc" — voir entities/types/index.js pour le registre complet et
// entities/model.md pour le vocabulaire du modèle d'entité. Donnée pure :
// aucun import.
//
// "Un passant" : beacon (LOCALISATION, continu, signal "tic tic") + vocal
// (EXPRESSION, sifflement occasionnel, défauts globaux — aucune surcharge
// d'intervalle ici, contrairement à dog.js). Son de sifflement PROVISOIRE
// (placeholder générique, aucun asset "sifflement" dédié pour l'instant —
// même logique que box_of_nails_beacon réutilisé ailleurs).

export default {
  label: "entity.npc",
  descriptionKey: "entity.npc.description",
  sounds: {
    beacon: { path: "assets/sounds/entities/npc_beacon_1.mp3", loop: true },
    vocal: { path: "assets/sounds/entities/box_of_nails_beacon_1.mp3", loop: false },
  },
  blocksMovement: false,
  enterable: false,
};
