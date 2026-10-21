// Descripteur de contenu du joueur. Le joueur suit le même modèle de sons
// que les entités (voir doc/entity-model.md), mais reste l'AUDITEUR : il
// n'entre jamais dans scene.entities, aucune voix positionnée n'est créée
// pour lui. Sa position vient de session.player.x, pas d'une instance de
// scène — il n'a donc ni id, ni type, ni x ici, seulement ses sons.
//
// movement : le bruit de pas. loop:false ("ponctuel" au sens du modèle) car
// c'est view/audio/footsteps.js qui le rejoue à la cadence de marche (STEP_DISTANCE) —
// ce n'est pas une boucle Web Audio native, même si la marche elle-même est
// continue. path pointe sur le pool "shoes_walk" — repli "son propre" du
// joueur (voir doc/entity-model.md, "Surfaces de sol et son de pas"),
// STRUCTURELLEMENT nécessaire mais jamais atteint en pratique :
// le gait dérivé (voir plus bas) résout TOUJOURS un pool réel
// (barefoot/shoes/boots existent tous), le filet ne servirait que si l'un
// de ces trois pools venait à manquer.
//
// GAIT : jamais stocké ici, ni nulle part sur le joueur — DÉRIVÉ de
// l'équipement à CHAQUE pas (voir core/equipment.js/gaitOf,
// view/audio/footsteps.js/playFootstep) : le slot "feet" (session.equipment)
// porte-t-il un objet avec un gait (core/items.js/ITEM_REGISTRY) ? oui -> ce
// gait ; slot vide -> "barefoot" (pieds nus, défaut). Équiper/déséquiper
// change donc le pas SUIVANT automatiquement, sans notification ni code de
// synchro — c'est tout l'intérêt de dériver plutôt que de stocker. Sur sol
// SPÉCIAL (ex. sable), le sol domine de toute façon et ce gait est ignoré
// (voir doc/entity-model.md, "Surfaces de sol et son de pas").
export default {
  sounds: {
    movement: { path: "assets/sounds/footsteps/gaits/shoes_walk", loop: false },
  },
};
