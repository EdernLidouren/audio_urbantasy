// Descripteur de contenu du joueur. Le joueur suit le même modèle de sons
// que les entités (voir entities/model.md), mais reste l'AUDITEUR : il
// n'entre jamais dans level.entities, aucune voix positionnée n'est créée
// pour lui. Sa position vient de session.player.x, pas d'une instance de
// niveau — il n'a donc ni id, ni type, ni x ici, seulement ses sons.
//
// movement : le bruit de pas. loop:false ("ponctuel" au sens du modèle) car
// c'est city-scene.js qui le rejoue à la cadence de marche (STEP_DISTANCE) —
// ce n'est pas une boucle Web Audio native, même si la marche elle-même est
// continue. path pointe sur le pool "shoes_walk" (variété à chaque pas,
// voir resolveAsset) — remplace l'ancien concrete_walk_1.mp3 unique,
// supprimé de assets/ lors de l'ajout des pools shoes_walk/sand_walk : ce
// pool est désormais le repli "son propre" du joueur (voir
// entities/model.md, "Surfaces de sol et son de pas") si gait/naturalWalk
// ne résolvent rien — ce qui n'arrive plus tant que gait ci-dessous est
// présent, mais reste le filet si on le retire.
//
// gait:"shoes" — TEMPORAIRE (test des pools shoes_walk/sand_walk fraîchement
// ajoutés, voir level/demo.json qui sépare sa scène en concrete/sand) : sur
// sol NEUTRE, force le pas du joueur sur shoes_walk (cran gait, le premier
// testé) ; sur sol SPÉCIAL (sable), le sol domine et ce gait est ignoré,
// shoes_walk ne joue PAS. Retire ce champ une fois l'écoute terminée — le
// joueur retombera alors sur movement.path ci-dessus (identique à l'oreille
// sur sol neutre, puisque les deux pointent déjà sur shoes_walk).
export default {
  gait: "shoes",
  sounds: {
    movement: { path: "assets/sounds/footsteps/shoes_walk", loop: false },
  },
};
