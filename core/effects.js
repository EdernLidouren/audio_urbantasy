// Vocabulaire des effets d'ACTION (déclenchés à l'ACTIVATION, voir
// core/script-parse.js/parseActionEffect, core/scripting.md/"Effets d'action") —
// SEULE source de vérité sur la NATURE de chaque type d'effet. TROIS
// natures, jamais mélangées :
//   - ÉTAT (STATE_EFFECT_TYPES) : mute l'état, jamais de rendu.
//     core/variables.js/applyActionEffects les applique — un type qu'il ne
//     reconnaît pas (donc RENDU ou MIXTE) traverse SANS EFFET, jamais une
//     erreur (voir son propre commentaire).
//   - RENDU (RENDER_EFFECT_TYPES) : joue/annonce, ne mute JAMAIS l'état, ne
//     connaît JAMAIS le core. view/interaction.js/runEffects les exécute
//     directement (aucun appel au core).
//   - MIXTE (MIXED_EFFECT_TYPES) : mute l'état ET orchestre du rendu
//     (aujourd'hui : "teleport" — voir "Effets d'action"/`"teleport"` de
//     core/scripting.md). Contrairement au RENDU pur, la VUE délègue le
//     calcul du nouvel état à des fonctions du CORE déjà existantes
//     (core/state.js/travelToWorld, placePlayer) — jamais une seconde copie
//     de cette logique — puis orchestre SEULE le séquençage (sas, fondu,
//     rafraîchissement de la scène). `applyActionEffects` les ignore, EXACTE-
//     MENT comme un effet de rendu : seul un gestionnaire dédié côté vue
//     (voir view/interaction.js/runEffects) les reconnaît.
// L'humain lit une liste d'effets comme UN SEUL script ("effects":
// [setVariable, giveImprovement, playSound, teleport, ...]) ; le système la
// ROUTE par nature.
// Frontière STRICTE, jamais mélangée : ajouter un effet demain = choisir SA
// nature (une seule des trois listes) + son cas dans
// core/script-parse.js/parseActionEffect (validation de forme) + son exécution
// côté core (core/variables.js, ÉTAT seulement) ou vue (view/interaction.js,
// RENDU et MIXTE).

export const STATE_EFFECT_TYPES = [
  "setVariable",
  "toggleVariable",
  "addVariable",
  "giveImprovement",
  "removeImprovement",
];
export const RENDER_EFFECT_TYPES = ["playSound", "announce"];
export const MIXED_EFFECT_TYPES = ["teleport"];
export const ACTION_EFFECT_TYPES = [...STATE_EFFECT_TYPES, ...RENDER_EFFECT_TYPES, ...MIXED_EFFECT_TYPES];

export function isStateEffect(effect) {
  return STATE_EFFECT_TYPES.includes(effect.type);
}

export function isRenderEffect(effect) {
  return RENDER_EFFECT_TYPES.includes(effect.type);
}
