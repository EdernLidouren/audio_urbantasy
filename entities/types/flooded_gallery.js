// Archétype "flooded_gallery" — tronçon de galerie noyé des souterrains :
// un obstacle qui coupe le chemin, là où le joueur n'a plus pied. Observable,
// infranchissable, et aucune action : contrairement au gros rocher
// (entities/types/large_boulder.js), rien ne le fait céder ; il faut passer par
// une autre galerie. Sa balise, de l'eau qui court, le signale de loin. Donnée
// pure : aucun import.
export default {
  nameKey: "entity.flooded_gallery.name",
  descriptionKey: "entity.flooded_gallery.description",
  sounds: {
    beacon: { path: "assets/sounds/decor/water_stream_1_beacon", loop: true },
  },
  collisionSound: "assets/sounds/effects/water_collision",
  blocksMovement: true,
  observable: true,
  interactable: false,
};
