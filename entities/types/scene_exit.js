// Archétype "scene_exit" — SORTIE de scène sans objet concret : on quitte la
// scène par un bord (plein air, bout de rue) pour en rejoindre une autre, là
// où il n'y a ni porte, ni échelle, ni rien qui sonne. Voir
// doc/entity-model.md/"Sorties de scène" et entities/types/index.js pour le
// registre complet. Donnée pure : aucun import.
//
// Fonctionne comme une porte (entities/types/door.js) : PAS d'action
// ici, la destination (`teleport.target`) varie par INSTANCE, chaque sortie
// déclare sa propre `action` complète. Entre deux scènes MAJEURES, l'action
// porte `"confirm": true` : le joueur confirme avant de partir (voir
// doc/scripting.md/"Confirmation d'une action").
//
// Balise : un son SYNTHÉTIQUE (extradiégétique), faute d'objet réel à faire
// entendre, comme le passage intérieur — il ne sert qu'à repérer la sortie à
// l'oreille. Nom et description : famille i18n `scene_exit.*` (voir
// doc/i18n.md), un défaut générique ici, surchargé par chaque instance
// (ex. "vers la rue commerçante").
export default {
  nameKey: "scene_exit.default.name",
  descriptionKey: "scene_exit.default.description",
  sounds: {
    beacon: { path: "assets/sounds/doors/scene_exit_1_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: true,
  // Surlignage audio de proximité (voir doc/entity-model.md) : une sortie se
  // repère nettement une fois à portée, comme une porte.
  highlight: true,
};
