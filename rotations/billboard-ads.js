// Série "billboard_ads" — les réclames du panneau publicitaire motorisé
// (entities/types/motorised_billboard.js). Donnée pure, aucun import (voir
// core/rotation.js pour la logique). Chaque id nomme une réclame ; son texte
// vit sous rotation.billboard_ads.<id> (rotations.json), écrit par chaque
// langue à sa façon. L'ordre n'a pas d'importance : le panneau pioche dans
// un ordre mélangé.
export default {
  entries: ["arpulse", "gremlins", "macarons", "arthur_rambo", "wargrumes", "public_restrooms"],
};
