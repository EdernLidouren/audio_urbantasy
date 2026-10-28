// Archétype "ghosten" (« dixparu » en français) — l'esprit libéré par le
// néon défectueux qui éclate (defective_neon_1_v, scenes/main-street.json).
// Ghost + ten : le néon est l'élément 10 ; « dix » se prononce « diss »,
// comme dans « disparu ». Donnée pure : aucun import.
//
// SURNATUREL : présent seulement en perception surnaturelle, comme
// ghost.js — perception inactive, il est là mais dormant, et son entrée
// (enterSound "ghostly_apparition") se joue quand la perception l'admet.
// Pas de balise : seul son vocal le localise, de loin en loin. Pas de son
// de pas non plus (aucun rôle movement) : il erre sans bruit.
//
// Il n'est jamais déclaré dans une scène : il NAÎT de l'effet "spawn" du
// néon, éphémère (voir doc/entity-model.md/"Entités éphémères") — il
// disparaît quand le joueur quitte la scène ou recharge sa partie. Son
// comportement (une errance) vient du `spec` de cet effet, comme pour une
// instance ; son allure lente, d'ici (`speed`).
export default {
  nameKey: "entity.ghosten.name",
  descriptionKey: "entity.ghosten.description",
  sounds: {
    vocal: {
      path: "assets/sounds/entities/ghosten_vocal",
      vocalInterval: 12000,
      vocalIntervalVariation: 2000,
      pitchVariation: 0.2,
    },
    enterSound: { path: "assets/sounds/effects/ghostly_apparition" },
  },
  speed: 0.4,
  blocksMovement: false,
  observable: true,
  interactable: false,
  presence: [{ when: { type: "perceptionActive" }, present: true }],
};
