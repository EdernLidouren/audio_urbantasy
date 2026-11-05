// Archétype "unseen_force_field" — le champ de force tel qu'il agit HORS
// perception : on ne l'entend pas, on ne peut ni l'observer ni le cibler, mais
// on s'y heurte. Une entité absente ne bloque pas : sans cette doublure,
// couper sa perception suffirait à franchir un champ de force, puis à la
// rallumer de l'autre côté. Présence déclarée par instance (hors perception,
// et tant que le champ perçu tient), au MÊME x que lui : le joueur arrêté par
// l'un se trouve ainsi au même endroit devant l'autre (voir
// core/physics/overlap.js, qui n'écarte pas une entité dormante). Un archétype
// plutôt qu'un sound_emitter, parce que le son de collision n'existe qu'à ce
// niveau (voir core/entity-parse.js/ARCHETYPE_FIELDS). Nom requis par le format,
// jamais lu à l'oreille : celui du champ.
export default {
  nameKey: "entity.force_field.name",
  collisionSound: "assets/sounds/effects/force_field_collision",
  blocksMovement: true,
  observable: false,
  interactable: false,
  highlight: false,
};
