// Collection "electronics" — composants électroniques. Donnée pure, aucun
// import (voir core/collections.js pour la logique, doc/collections.md).
// L'ordre des entrées est l'ordre d'affichage, fixe. Chaque entrée référence
// un objet du sac (core/items.js/ITEM_REGISTRY) ; ses textes de collection
// vivent sous collection.electronics.entry.<objet>.* (collections.json).
export default {
  // Son joué à chaque nouvelle découverte de cette collection. Provisoire.
  discoverySound: "assets/sounds/effects/reward",
  entries: [{ item: "resistor" }, { item: "capacitor" }, { item: "transistor" }],
};
