// Archétype "ghost" — entité SURNATURELLE, cas de test de la PERCEPTION
// SURNATURELLE (voir core/presence.js/"perceptionActive",
// view/audio/city-scene.js) : même rôle que neon.js pour la présence
// conditionnelle "timeRange" — rien de plus qu'une entité normale dont la
// présence est conditionnée par cette condition. Perception INACTIVE :
// aucune règle ne correspond -> DORMANTE (silencieuse, non examinable,
// jamais bloquante — voir core/presence.js/isPresent). Perception ACTIVE :
// PRÉSENTE, pleine et claire (JAMAIS soumise au filtre d'étouffement des
// entités mondaines, voir view/audio/city-scene.js/isPerceptionGated) —
// murmure continu (beacon "neon_beacon", pool via resolveAsset, réutilisé
// EN PLACEHOLDER : le seul bourdonnement continu du jeu qui ne soit PAS le
// filler générique "box_of_nails_beacon" partagé par la moitié du registre
// — voir entities/types/neon.js pour son usage d'origine — en attendant un
// asset "spectral" dédié). Donnée pure : aucun import.
export default {
  nameKey: "entity.ghost.name",
  descriptionKey: "entity.ghost.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/neon_beacon", loop: true },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
  presence: [{ when: { type: "perceptionActive" }, present: true }],
};
