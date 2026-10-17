// Registre des AMÉLIORATIONS (improvements) — capacités que le joueur
// possède ou non, données pures, structuré comme core/tags.js/TAG_REGISTRY :
// SOURCE DE VÉRITÉ des improvements existantes, valide give/remove/has à
// l'instar de hasEquipmentTag/tag (voir core/scene.js/validateCondition,
// parseActionEffect). Ajouter une improvement = une entrée ici, jamais une
// chaîne en dur ailleurs — affichée dans l'onglet Améliorations du menu
// global (view/menus/inventory-menu.js).
//
// FLAG SIMPLE pour l'instant (possédée ou non) : un état interne riche (une
// improvement qui porterait ses propres variables) viendrait s'ajouter SI un
// cas concret le réclame — ne PAS le construire par anticipation (voir
// CLAUDE.md, "pas d'abstraction prématurée").
// `order` (entier >= 1, UNIQUE) : position d'affichage dans l'onglet
// Améliorations (view/menus/inventory-menu.js) et numéro annoncé au joueur.
// Déclaré, jamais dérivé de l'ordre d'insertion de cet objet : réarranger
// le registre ne doit pas renuméroter les pouvoirs. Validé à l'import
// (validateImprovementRegistry plus bas).
export const IMPROVEMENT_REGISTRY = {
  supernatural_perception: {
    order: 1,
    labelKey: "improvement.supernatural_perception.name",
    descriptionKey: "improvement.supernatural_perception.description",
  },
  flashlight: { order: 2, labelKey: "improvement.flashlight.name", descriptionKey: "improvement.flashlight.description" },
  mirror_pass: { order: 3, labelKey: "improvement.mirror_pass.name", descriptionKey: "improvement.mirror_pass.description" },
  master_key: { order: 4, labelKey: "improvement.master_key.name", descriptionKey: "improvement.master_key.description" },
  skeleton_key: { order: 5, labelKey: "improvement.skeleton_key.name", descriptionKey: "improvement.skeleton_key.description" },
};

// Ordres présents, entiers >= 1 et uniques — sinon une erreur claire à
// l'import, jamais un onglet mal numéroté en silence. Exportée pour les
// checks terminal (core/movement.check.js).
export function validateImprovementRegistry(registry) {
  const seen = new Map();
  for (const [id, props] of Object.entries(registry)) {
    if (!Number.isInteger(props.order) || props.order < 1) {
      throw new Error(`IMPROVEMENT_REGISTRY : "${id}".order doit être un entier >= 1 (reçu : ${JSON.stringify(props.order)}).`);
    }
    if (seen.has(props.order)) {
      throw new Error(`IMPROVEMENT_REGISTRY : order ${props.order} partagé par "${seen.get(props.order)}" et "${id}".`);
    }
    seen.set(props.order, id);
  }
}
validateImprovementRegistry(IMPROVEMENT_REGISTRY);

// Ids du registre triés par `order` — l'ordre d'affichage de l'onglet.
export function orderedImprovementIds(registry = IMPROVEMENT_REGISTRY) {
  return Object.keys(registry).sort((a, b) => registry[a].order - registry[b].order);
}

export function improvementProps(id) {
  return IMPROVEMENT_REGISTRY[id];
}

// STOCKAGE — session.improvements : { [id]: true }, SPARSE (une improvement
// NON possédée n'a PAS de clé, jamais `false`) — cercle PARTIE, PERSISTANT
// (voir core/state.js/createInitialState, core/save.js/migrateSave).
//
// Trois primitives PURES, même patron que core/equipment.js/equipItem (mais
// plus simples : pas de second sac à synchroniser) — opèrent sur le SAC
// (`improvements`) directement, jamais sur la session entière ; l'appelant
// (core/variables.js/applyActionEffects) le splice lui-même dans
// session.improvements. `id` inconnu du registre : jamais vérifié ICI (la
// validation vit au CHARGEMENT, voir core/scene.js) — ces primitives restent
// de simples opérations d'ensemble, comme setVariable l'est pour une
// variable.
export function hasImprovement(improvements, id) {
  return Boolean(improvements && improvements[id]);
}

export function giveImprovement(improvements, id) {
  if (hasImprovement(improvements, id)) return improvements;
  return { ...improvements, [id]: true };
}

export function removeImprovement(improvements, id) {
  if (!hasImprovement(improvements, id)) return improvements;
  const next = { ...improvements };
  delete next[id];
  return next;
}
