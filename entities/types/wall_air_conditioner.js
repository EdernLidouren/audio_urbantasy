// Archétype "wall_air_conditioner" — climatiseur mural de façade. Décor
// sonore pur : beacon continu, rien à y faire (non interactif), jamais
// bloquant (accroché au mur, au-dessus du passage).
export default {
  nameKey: "entity.wall_air_conditioner.name",
  descriptionKey: "entity.wall_air_conditioner.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/wall_air_conditioner_1_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
