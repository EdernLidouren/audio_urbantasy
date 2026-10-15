// Archétype "office_water_cooler" — fontaine à eau de bureau. Mobilier
// observable, jamais interactif : un beacon continu, rien d'autre.
export default {
  nameKey: "entity.office_water_cooler.name",
  descriptionKey: "entity.office_water_cooler.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/office_water_cooler_1_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
