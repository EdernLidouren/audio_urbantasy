// Archétype "sacrystal" (« sacristal » en français) — une entrée du bestiaire
// (collections/supernatural.js) qui ne se rencontre qu'UNE fois. SURNATUREL, et
// présent tant que le joueur ne l'a pas observé : Espace (la description) ou
// Entrée (la même description, puis l'effet "markObserved") le découvrent, et
// cette découverte le fait disparaître partout où il serait placé, en fondu
// léger (presenceExitFadeMs). Pas de champ d'état propre : le fait "observé"
// suffit, et la sauvegarde le garde déjà.
export default {
  nameKey: "entity.sacrystal.name",
  descriptionKey: "entity.sacrystal.description",
  sounds: {
    beacon: { path: "assets/sounds/entities/sacrystal_1_beacon", loop: true },
  },
  presenceExitFadeMs: 500,
  presence: [
    {
      when: {
        type: "allOf",
        conditions: [{ type: "perceptionActive" }, { type: "not", condition: { type: "hasObserved", id: "sacrystal" } }],
      },
      present: true,
    },
  ],
  blocksMovement: false,
  observable: true,
  interactable: true,
  highlight: true,
  action: {
    kind: "applyEffects",
    effects: [{ type: "announce", key: "entity.sacrystal.description" }, { type: "markObserved" }],
  },
};
