// Archétype "neon" — enseigne lumineuse PRÉSENTE UNIQUEMENT LA NUIT (voir
// core/presence.js) : cas de test du système de présence conditionnelle. Le
// jour, aucune règle ne correspond -> DORMANTE (silencieuse, non
// examinable, jamais bloquante — voir core/presence.js/isPresent). La nuit,
// PRÉSENTE : bourdonnement continu (beacon "neon_beacon", pool via
// resolveAsset). Donnée pure : aucun import.
//
// enterSound/exitSound (voir core/presence.js, view/audio/oneshots.js) :
// rôles PONCTUELS et POSITIONNÉS, distincts du beacon — joués UNE FOIS sur
// une bascule de présence OBSERVÉE (jamais à l'entrée en scène si le néon
// est déjà présent/dormant, voir core/reduce.js/stepEntities). Même pool
// "electrical_flickering" pour les deux : le grésillement d'un néon sonne
// pareil qu'il s'allume ou s'éteigne, seul le CONTEXTE (beacon qui démarre
// ou qui s'arrête juste après) distingue les deux à l'oreille.
//
// Réservé pour plus tard (non requis ici, même principe que la présence) :
// une DESCRIPTION conditionnelle (ex. "éteinte" le jour vs "bourdonne" la
// nuit) pourrait s'ajouter via une règle -> texte, symétrique à `presence`
// — pas câblé, `descriptionKey` reste unique.
export default {
  nameKey: "entity.neon.name",
  descriptionKey: "entity.neon.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/neon_beacon", loop: true },
    enterSound: { path: "assets/sounds/effects/electrical_flickering" },
    exitSound: { path: "assets/sounds/effects/electrical_flickering" },
  },
  blocksMovement: false,
  observable: true,
  interactable: false,
  // 20h..6h : passage par minuit géré par core/presence.js/evaluateCondition
  // (timeRange). Une seule règle suffit — le jour n'est simplement couvert
  // par aucune, donc dormant par défaut (voir core/presence.js/isPresent).
  // Cascade jusqu'à l'instance (core/entity-parse.js) : une scène pourrait donner
  // d'autres horaires à un néon précis si besoin un jour.
  presence: [{ when: { type: "timeRange", from: 20, to: 6 }, present: true }],
};
