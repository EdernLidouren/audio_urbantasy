// Petites fonctions numériques pures, partagées par le core, lib/ et la
// vue. Aucune connaissance du jeu.

// Borne `value` dans [min, max].
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
