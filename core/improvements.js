// Registre des AMÉLIORATIONS (improvements) — capacités que le joueur
// possède ou non, données pures, structuré comme core/tags.js/TAG_REGISTRY :
// SOURCE DE VÉRITÉ des improvements existantes, valide give/remove/has à
// l'instar de hasEquipmentTag/tag (voir core/level.js/validateCondition,
// parseActionEffect). Ajouter une improvement = une entrée ici, jamais une
// chaîne en dur ailleurs — alimentera un futur onglet de menu (PAS construit
// ici, interface ultérieure).
//
// FLAG SIMPLE pour l'instant (possédée ou non) : un état interne riche (une
// improvement qui porterait ses propres variables) viendrait s'ajouter SI un
// cas concret le réclame — ne PAS le construire par anticipation (voir
// CLAUDE.md, "pas d'abstraction prématurée").
export const IMPROVEMENT_REGISTRY = {
  supernatural_perception: {
    labelKey: "improvement.supernatural_perception",
    descriptionKey: "improvement.supernatural_perception.description",
  },
  flashlight: { labelKey: "improvement.flashlight", descriptionKey: "improvement.flashlight.description" },
  mirror_pass: { labelKey: "improvement.mirror_pass", descriptionKey: "improvement.mirror_pass.description" },
  master_key: { labelKey: "improvement.master_key", descriptionKey: "improvement.master_key.description" },
  skeleton_key: { labelKey: "improvement.skeleton_key", descriptionKey: "improvement.skeleton_key.description" },
};

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
// validation vit au CHARGEMENT, voir core/level.js) — ces primitives restent
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
