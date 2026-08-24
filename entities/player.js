// Descripteur de contenu du joueur. Le joueur suit le même modèle de sons
// que les entités (voir entities/model.md), mais reste l'AUDITEUR : il
// n'entre jamais dans level.entities, aucune voix positionnée n'est créée
// pour lui. Sa position vient de session.player.x, pas d'une instance de
// niveau — il n'a donc ni id, ni type, ni x ici, seulement ses sons.
//
// movement : le bruit de pas. loop:false ("ponctuel" au sens du modèle) car
// c'est city-scene.js qui le rejoue à la cadence de marche (STEP_DISTANCE) —
// ce n'est pas une boucle Web Audio native, même si la marche elle-même est
// continue.

export default {
  sounds: {
    movement: { path: "assets/sounds/footstep_concrete_walk_1.mp3", loop: false },
  },
};
