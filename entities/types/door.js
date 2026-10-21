// Archétype "door" — voir doc/entity-model.md pour le vocabulaire du modèle
// d'entité (sounds, cascade) et entities/types/index.js pour le registre
// complet. Donnée pure : aucun import, importable par le core comme par la
// vue.

// PAS de cascade `action` ici (contrairement à d'autres archétypes) : une
// porte n'a rien de commun à l'échelle du TYPE — sa cible (`teleport.
// target`, voir doc/scripting.md/"Effets d'action") varie par INSTANCE,
// chaque porte doit donc déclarer SA PROPRE `action` complète (voir
// scenes/demo.json et consorts). La porte n'est PAS un cas spécial du core
// ni de la vue : juste une entité `interactable` ordinaire dont l'action
// déclenche un effet "teleport" comme n'importe quel autre contenu.
//
// CONVENTION SONORE des portes : beacon `<famille>_close`, et l'action joue
// `<famille>_open` par un effet playSound placé AVANT son teleport (son de
// départ, voir doc/scripting.md/"playSound") — s'il existe. Famille par
// défaut : door_1 (ci-dessous) ; une instance en change en surchargeant
// `sounds.beacon.path` ET le playSound de son action (door_2 pour l'hôtel
// de ville, metal_door_1 pour le clocher). Les échelles, de type door, ont
// leur propre beacon et pas de son d'ouverture.
export default {
  nameKey: "door.default.name",
  descriptionKey: "door.default.description",
  sounds: {
    beacon: { path: "assets/sounds/doors/door_1_close", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
  // Surlignage audio de proximité (voir doc/entity-model.md, "Surlignage
  // audio de proximité") : une porte se repère nettement une fois à portée.
  highlight: true,
};
