// AMÉLIORATIONS — donnée pure (aucun import), le registre des améliorations. Lu
// par le core (core/improvements.js : validation au chargement, possession) et
// par la vue (onglet des améliorations). Ajouter une amélioration : une entrée
// ici.
//
// `order` (entier >= 1, UNIQUE) : position d'affichage dans l'onglet
// Améliorations (view/menus/inventory-menu.js) et numéro annoncé au joueur.
// Déclaré, jamais dérivé de l'ordre d'insertion de cet objet : réarranger
// le registre ne doit pas renuméroter les pouvoirs. Validé à l'import de
// core/improvements.js (validateImprovementRegistry).
export const IMPROVEMENT_REGISTRY = {
  flashlight: { order: 1, nameKey: "improvement.flashlight.name", descriptionKey: "improvement.flashlight.description" },
  // Sans effet direct pour l'instant : les veines et filons deviendront
  // exploitables avec lui. En vente au bazar après la lampe-torche
  // (config/shop-values.js).
  mining_kit: { order: 2, nameKey: "improvement.mining_kit.name", descriptionKey: "improvement.mining_kit.description" },
  supernatural_perception: {
    order: 3,
    nameKey: "improvement.supernatural_perception.name",
    descriptionKey: "improvement.supernatural_perception.description",
  },
  mirror_pass: { order: 4, nameKey: "improvement.mirror_pass.name", descriptionKey: "improvement.mirror_pass.description" },
  master_key: { order: 5, nameKey: "improvement.master_key.name", descriptionKey: "improvement.master_key.description" },
  skeleton_key: { order: 6, nameKey: "improvement.skeleton_key.name", descriptionKey: "improvement.skeleton_key.description" },
  // Révèle les cases "hors plan" de la carte de la ville (voir
  // map/city-map.js/onMapWhen). Obtenue en ramassant le vieux cadastre.
  old_plans: { order: 7, nameKey: "improvement.old_plans.name", descriptionKey: "improvement.old_plans.description" },
};
