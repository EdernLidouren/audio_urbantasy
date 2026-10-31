// Archétype "main_headframe" — chevalement du puits d'extraction principal
// des anciennes carrières (scenes/old-quarries.json), de la famille des
// portes (voir entities/types/door.js, textes sous `door.*`) : il mènera un
// jour au fond du puits. Donnée pure : aucun import.
//
// Comme une porte : pas d'action ici, la destination varie par instance.
// Celle des anciennes carrières vérifie deux choses avant de descendre :
// le groupe électrogène allumé (variable de scène, il est sur l'autre
// face), puis la lampe-torche — un refus annoncé pour chacune.
//
// Balise : la grande structure métallique qui grince au vent. L'instance de
// la scène lui superpose le souffle du puits par un émetteur invisible
// placé au même x (voir entities/types/sound_emitter.js).
export default {
  nameKey: "door.main_headframe.name",
  descriptionKey: "door.main_headframe.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/large_metal_structure_1_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
  // Surlignage audio de proximité, comme une porte (voir doc/entity-model.md).
  highlight: true,
};
