// Archétype "passage" — point de PASSAGE entre les deux FACES (recto/verso)
// d'une même scène (voir CLAUDE.md/"RECTO/VERSO", core/scripting.md, action
// "switchSide" ; entities/model.md). Générique par nature (une ruelle, une
// porte dérobée, un trou dans la palissade...) : label/description restent
// des défauts génériques, `action.arrivalX` (point d'arrivée sur l'AUTRE
// face) est TOUJOURS fourni par l'instance de niveau, jamais par ce défaut
// — il dépend entièrement de la géométrie du lieu qui l'instancie.
//
// beacon : réutilise door_beacon (aucun son dédié encore) — même principe
// que d'autres archétypes sans asset propre (voir decor.js) : un point de
// passage doit rester LOCALISABLE au clavier/à l'oreille, comme une porte.
export default {
  nameKey: "entity.passage.name",
  descriptionKey: "entity.passage.description",
  sounds: {
    beacon: { path: "assets/sounds/entities/door_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
};
