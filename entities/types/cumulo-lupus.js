// Archétype "cumuloLupus" — un loup de brume, errant. VOCAL SEUL, aucun
// beacon (comme hound.js) — on ne le localise pas, on l'entend passer.
// Aucun `behavior` par défaut ici, volontairement (voir dog.js) : se
// déclare à l'INSTANCE (level/*.json). Donnée pure : aucun import.
//
// Présence conditionnée par la MÉTÉO (core/presence.js/"weather",
// core/scripting.md) : présent SEULEMENT sous la brume — sert de cas de
// test pour cette condition (voir view/menus/debug-weather-menu.js,
// Shift+W, pour la forcer). Idéalement composée AUSSI avec
// "perceptionActive" (loup surnaturel visible uniquement perception
// active ET brume) — l'évaluateur actuel ne supporte qu'UNE condition par
// règle (pas de ET entre deux types), donc repli sur la condition météo
// SEULE pour l'instant, comme prévu par la demande d'origine. Un futur
// condition composite (`allOf`) pourrait réintroduire le ET sans retoucher
// cette entité.
export default {
  label: "entity.cumulo_lupus",
  descriptionKey: "entity.cumulo_lupus.description",
  sounds: {
    vocal: { path: "assets/sounds/entities/spectral_wolf_vocal", loop: false, pitchVariation: 0.15 },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
  presence: [{ when: { type: "weather", state: "fog" }, present: true }],
};
