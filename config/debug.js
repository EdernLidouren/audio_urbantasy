// Mode DEBUG minimal : un drapeau global, désactivé par défaut, qui EXPOSE
// les outils de debug de l'écran de jeu — touches et menus réservés à ce
// mode (table des touches : view/input.js ; effets : view/debug-effects.js
// et view/menus/debug-*.js). Un seul drapeau à lire pour tous les outils,
// jamais un par outil. Activable depuis la console (window.toggleDebug, voir
// main.js, même patron que window.runChecks) OU par la combinaison
// Ctrl+D en jeu (même fonction, deux chemins — voir main.js) : PAS de menu,
// PAS de préférence persistée — un mode debug ne doit jamais survivre à une
// sauvegarde ni à un rechargement de page, contrairement à
// config/preferences.js.
let debugEnabled = false;

export function isDebugEnabled() {
  return debugEnabled;
}

export function setDebugEnabled(value) {
  debugEnabled = Boolean(value);
}
