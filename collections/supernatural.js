// Collection "supernatural" — les entités surnaturelles, le bestiaire. Donnée
// pure, aucun import (voir core/collections.js pour la logique,
// doc/collections.md). Chaque entrée est un TYPE d'entité
// (entities/types/), découvert la première fois que le joueur l'observe
// (Espace) : il faut l'approcher, perception surnaturelle active. Son nom et
// sa description viennent de son type ; sa fiche (texte encyclopédique,
// lieux de rencontre) vit sous collection.supernatural.entry.<type>.*
// (collections.json).
export default {
  // Son d'interface joué à chaque nouvelle découverte de cette collection.
  discoverySound: "assets/sounds/ui/supernatural_reward",
  entries: [{ entity: "ghosten" }, { entity: "cumuloLupus" }, { entity: "miravi" }],
};
