// Archétype "cliff_foot" — pied de la falaise qui longe la ville, posé au
// bout d'une scène (scenes/old-quarries.json, en x 50 sur les deux faces).
// Observable, infranchissable : le joueur bute contre la roche et entend
// la même collision que contre un rocher (voir entities/types/rock.js).
// Donnée pure : aucun import.
export default {
  nameKey: "entity.cliff_foot.name",
  descriptionKey: "entity.cliff_foot.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/big_rock_1_beacon", loop: true },
  },
  collisionSound: "assets/sounds/effects/big_rock_collision",
  blocksMovement: true,
  observable: true,
  interactable: false,
};
