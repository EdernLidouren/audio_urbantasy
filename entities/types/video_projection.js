// Archétype "video_projection" — l'image projetée par un vidéoprojecteur.
// Observable, jamais interactif : un beacon continu, rien d'autre.
export default {
  nameKey: "entity.video_projection.name",
  descriptionKey: "entity.video_projection.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/video_projection_1_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
};
