// Archétype "cumuloLupus" — un loup de brume, errant. VOCAL SEUL, aucun
// beacon (comme hound.js) — on ne le localise pas, on l'entend passer.
// Aucun `behavior` par défaut ici, volontairement (voir dog.js) : se
// déclare à l'INSTANCE (scenes/*.json). Donnée pure : aucun import.
//
// Présence conditionnée par l'ET de DEUX conditions (core/presence.js/
// "allOf") : perception surnaturelle ACTIVE ET météo BRUMEUSE — un loup
// surnaturel, visible SEULEMENT si les deux tiennent à la fois (perception
// seule ou brume seule ne suffisent pas). Entité SURNATURELLE comme
// ghost.js (même statut "flag surnaturel" — dormante/non examinable/jamais
// bloquante hors perception, JAMAIS soumise au filtre d'étouffement des
// entités mondaines, voir view/audio/city-scene.js/isPerceptionGated, qui
// détecte la condition "perceptionActive" MÊME imbriquée dans un "allOf",
// voir son commentaire), avec une exigence météo EN PLUS. Testable via le
// menu debug météo (Shift+W) pour forcer la brume, combiné à la touche de
// perception ("p").
export default {
  nameKey: "entity.cumulo_lupus.name",
  descriptionKey: "entity.cumulo_lupus.description",
  sounds: {
    vocal: {
      path: "assets/sounds/entities/spectral_wolf_vocal",
      loop: false,
      pitchVariation: 0.15,
      vocalInterval: 5000,
      vocalIntervalVariation: 1500,
      // Léger renfort : les fichiers sortent un peu bas par rapport au reste
      // de la scène (voir config/tuning-values.js/vocalGain, défaut 1).
      vocalGain: 1.5,
    }
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
  presence: [
    {
      when: { type: "allOf", conditions: [{ type: "perceptionActive" }, { type: "weather", state: "fog" }] },
      present: true,
    },
  ],
};
