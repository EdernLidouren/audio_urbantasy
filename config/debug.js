// Mode DEBUG minimal : un drapeau global, désactivé par défaut, qui EXPOSE
// les touches de debug (aujourd'hui : "e", crée une entité éphémère de test
// — voir view/city-screen.js). Infra volontairement minimale — d'autres
// outils de debug s'y grefferont plus tard, un seul drapeau à lire, jamais
// un par outil. Activable depuis la console (window.toggleDebug, voir
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
