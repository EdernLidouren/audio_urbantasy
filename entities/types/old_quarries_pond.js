// Archétype "old_quarries_pond" — mare de pluie au fond d'une zone
// d'excavation des anciennes carrières (scenes/old-quarries.json, au
// milieu du segment shallow_water du recto). Observable, infranchissable :
// trop profonde pour être traversée. Donnée pure : aucun import.
export default {
  nameKey: "entity.old_quarries_pond.name",
  descriptionKey: "entity.old_quarries_pond.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/pond_1_beacon", loop: true },
  },
  blocksMovement: true,
  observable: true,
  interactable: false,
};
