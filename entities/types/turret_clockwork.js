// Archétype "turret_clockwork" — la minuterie d'un clocher (voir
// level/clock-tower-main.json). Observable, jamais interactive ; sa
// description est DYNAMIQUE (gabarit {hour}/{minute}, voir
// doc/scripting.md/"Descriptions dynamiques"). Porte le TRIGGER HORAIRE de
// la cloche (voir core/triggers.js) : c'est la minuterie qui commande la
// sonnerie, l'archétype le déclare donc lui-même — contrairement au clocher
// de la place (level/town-square.json), dont le trigger vit sur l'instance
// pour ne pas doubler la cloche sur son miroir. Gain élevé : la cloche
// sature à 1 près de la minuterie (bornage, voir lib/audio.js).
export default {
  nameKey: "entity.turret_clockwork.name",
  descriptionKey: "entity.turret_clockwork.description",
  sounds: {
    beacon: { path: "assets/sounds/furniture/clock_3_beacon", loop: true },
  },
  triggers: [{ on: "hour", effects: [{ type: "playSound", path: "assets/sounds/effects/clock_tower_bell", gain: 3, reverbSend: 0.9 }] }],
  blocksMovement: false,
  observable: true,
  interactable: false,
};
