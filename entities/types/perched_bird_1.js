// Archétype "perched_bird_1" — oiseau POSÉ, farouche. Voir
// entities/types/index.js pour le registre complet et doc/entity-model.md
// pour le vocabulaire du modèle d'entité. Donnée pure : aucun import.
//
// Le pendant au sol de bird_1 (même voix, pool bird_1_vocal) : là où
// l'oiseau en vol (isFlying) passe au-dessus du joueur sans s'en soucier,
// celui-ci s'ENVOLE quand on s'approche (`startle`, voir core/startle.js,
// doc/entity-model.md/"Entités farouches") — à startleRange, plus loin que
// la portée d'interaction : on l'entend partir avant d'avoir pu l'observer.
// Il revient quand on recharge la scène, comme un oiseau dérangé qui
// reprend sa place.
//
// Pas d'isFlying (il est posé : aucun passe-haut), pas de balise, pas de
// pas. VOCAL SEUL, plus serré qu'un oiseau en vol (un oiseau posé pépie
// sans cesse), avec une variation de hauteur marquée pour que les cris ne
// sonnent jamais deux fois pareil. L'envol est son exitSound, joué par la
// vue sur sa bascule de dormance (voir doc/entity-model.md/"Sons de
// transition") ; le pool en a plusieurs variantes.
//
// Observable et interactable : Entrée l'effraie aussi (effet "startle"),
// pour une instance assez confiante pour se laisser approcher (startle
// plus court que interactRange). Comme pour le chien, l'errance (très
// lente) se déclare à l'instance.
export default {
  nameKey: "entity.perched_bird.name",
  descriptionKey: "entity.perched_bird.description",
  sounds: {
    vocal: {
      path: "assets/sounds/entities/bird_1_vocal",
      loop: false,
      vocalInterval: 2500,
      vocalIntervalVariation: 1200,
      pitchVariation: 0.12,
    },
    exitSound: { path: "assets/sounds/entities/bird_taking_off_fly" },
  },
  startle: {},
  action: { kind: "applyEffects", effects: [{ type: "startle" }] },
  blocksMovement: false,
  observable: true,
  interactable: true,
};
