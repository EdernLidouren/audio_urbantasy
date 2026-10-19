// Archétype "old_survey_map" — vieux cadastre, COLLECTIBLE PERSISTANT unique
// (voir scenes/town-square-town-hall-storeroom.json) : action "loot" OBJET
// UNIQUE (ni argent ni éparpillement, voir doc/scripting.md/"loot") dont la
// substance est l'amélioration "old_plans", qui révèle les cases "hors plan"
// de la carte de la ville (map/city-map.js/onMapWhen). Présent tant qu'il
// n'est pas consommé, jamais ensuite.
//
// Sons : beacon de livre/papier en boucle ; ramassage "reveal", joué à la
// prise du cadastre (après les effets de l'action, donc après son annonce).
export default {
  nameKey: "entity.old_survey_map.name",
  descriptionKey: "entity.old_survey_map.description",
  sounds: {
    beacon: { path: "assets/sounds/items/book_1_beacon", loop: true },
    pickup: { path: "assets/sounds/effects/reveal" },
  },
  action: {
    kind: "loot",
    effects: [
      { type: "giveImprovement", id: "old_plans" },
      { type: "announce", key: "entity.old_survey_map.taken" },
    ],
  },
  presence: [{ when: { type: "not", condition: { type: "consumed" } }, present: true }],
  blocksMovement: false,
  observable: true,
  interactable: true,
};
