// Archétype "sound_emitter" — ÉMETTEUR INVISIBLE : une position et un
// script, rien d'autre. Ni observable ni interactable (donc jamais annoncé
// à l'approche, voir view/occupancy.js/occupiedEntities), aucun rôle
// de son propre : ses sons se déclarent PAR INSTANCE, jamais ici — comme
// un comportement. Deux usages :
//   - des `triggers` (voir doc/scripting.md/"Triggers") : un playSound
//     déclenché ainsi est diégétique, positionné sur l'émetteur, soumis à
//     la même chaîne que n'importe quelle balise (distance, pan, occlusion
//     de face, réverb de la scène). Clients : les cloches du puits des
//     contrepoids et de son côté miroir (bell_emitter_1_r dans
//     scenes/clock-tower-weight-shaft.json, bell_emitter_1 dans
//     scenes/clock-tower-weight-shaft-mirror-side.json) ;
//   - une `sounds.beacon` continue, posée au même x qu'une autre entité
//     pour SUPERPOSER deux balises continues sans dupliquer un objet qu'on
//     pourrait annoncer ou décrire deux fois. Client : le souffle du puits
//     sous le chevalement des anciennes carrières (mine_shaft_emitter_1_r
//     et _v dans scenes/old-quarries.json).
// nameKey requis par le format, jamais lu à l'oreille.
export default {
  nameKey: "entity.sound_emitter.name",
  blocksMovement: false,
  observable: false,
  interactable: false,
  highlight: false,
};
