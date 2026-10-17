// Archétype "sound_emitter" — ÉMETTEUR INVISIBLE : une position et un
// script, rien d'autre. Ni observable ni interactable (donc jamais annoncé
// à l'approche, voir view/audio/city-scene.js/occupiedEntities), aucun rôle
// de son propre : ses sons viennent de ses `triggers` (voir
// doc/scripting.md/"Triggers"), déclarés PAR INSTANCE, jamais ici — comme
// un comportement. Un playSound déclenché ainsi est diégétique, positionné
// sur l'émetteur, soumis à la même chaîne que n'importe quelle balise
// (distance, pan, occlusion de face, réverb de la scène). Clients : les cloches
// du puits des contrepoids et de son espace miroir (bell_emitter_r dans
// scenes/clock-tower-weight-shaft.json et
// scenes/clock-tower-weight-shaft-mirror-space.json). nameKey requis par le
// format, jamais lu à l'oreille.
export default {
  nameKey: "entity.sound_emitter.name",
  blocksMovement: false,
  observable: false,
  interactable: false,
  highlight: false,
};
