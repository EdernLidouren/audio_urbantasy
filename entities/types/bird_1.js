// Archétype "bird" — voir entities/types/index.js pour le registre complet
// et entities/model.md pour le vocabulaire du modèle d'entité (dont
// isFlying). Donnée pure : aucun import.
//
// "Oiseau décor" : VOCAL SEUL, aucun beacon — même choix que hound.js (voir
// entities/model.md, "beacon vs vocal") : pas besoin de le localiser en
// continu, seulement de l'entendre chanter par intermittence — le vocal
// lui-même sert de seul repère sonore. Pool DÉDIÉ bird_1_vocal (7 fichiers,
// assets/manifest.json) — PLUS le placeholder dog_medium_vocal d'origine.
// Interval/variation SURCHARGÉS (plus espacé, fourchette plus large que le
// défaut global vocalInterval/vocalIntervalVariation) : un oiseau chante par
// à-coups largement espacés, jamais un signal régulier/prévisible.
//
// isFlying:true — chaîne de filtres "hauteur suggérée" (voir
// config/tuning-values.js/flyingHighpassHz et consorts, view/audio/
// city-scene.js) : AUCUN axe Y, juste ce marqueur qui fait passer le vocal
// ci-dessous par un passe-haut + une réverb plus généreuse + une légère
// atténuation de volume, pour que "bird" sonne plus fin/aérien.
export default {
  nameKey: "entity.bird.name",
  descriptionKey: "entity.bird.description",
  isFlying: true,
  sounds: {
    vocal: {
      path: "assets/sounds/entities/bird_1_vocal",
      loop: false,
      vocalInterval: 7500,
      vocalIntervalVariation: 3000,
    },
  },
  blocksMovement: false,
  observable: false,
  interactable: false,
};
