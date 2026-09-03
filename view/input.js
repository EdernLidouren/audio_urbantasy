// Spécifique-jeu : quelles touches signifient quoi pour Templeton — les
// TABLES DE BINDINGS (voir lib/input.js pour le moteur générique qui les
// résout). Ce fichier est la SEULE source de ces associations touche(s) ->
// action ; un futur écran de remappage n'aurait qu'à reconstruire ces
// objets (structure prête, aucune interface de remappage construite ici,
// voir CLAUDE.md/YAGNI).

import { isActionActive, checkBindingsForCollisions } from "../lib/input.js";

// Mouvement — CONTINU (voir isActionActive) : plusieurs touches physiques
// pour une même action (flèches + ZQSD). mods:[] exige l'ABSENCE de tout
// modificateur — c'est cette exigence qui empêche Ctrl+D de déclencher
// "moveRight" (voir le bug historique documenté dans lib/input.js).
export const MOVE_BINDINGS = {
  moveLeft: { keys: ["ArrowLeft", "q", "a"], mods: [] },
  moveRight: { keys: ["ArrowRight", "d"], mods: [] },
};
checkBindingsForCollisions(MOVE_BINDINGS, "view/input.js MOVE_BINDINGS");

// Toutes les touches de mouvement, à plat — fournies telles quelles à
// lib/input.js/initInput (preventDefaultKeys, voir main.js) : lib/input.js
// ignore tout de leur SENS, il sait seulement qu'il doit supprimer leur
// comportement par défaut (défilement de page) à chaque appui, répétitions
// OS incluses.
export const MOVE_KEYS = [...MOVE_BINDINGS.moveLeft.keys, ...MOVE_BINDINGS.moveRight.keys];

// Le piège de focus Tab (navigation native du navigateur sortant le focus de
// #game) N'EST PLUS géré ici : lib/input.js neutralise Tab/Maj+Tab de façon
// INCONDITIONNELLE et générique, en tête de son propre traitement (voir
// ALWAYS_NEUTRALIZED_BINDINGS, lib/input.js) — rien à fournir depuis ce
// fichier pour ça.

// Raccourcis de la ville — APPUI (voir view/city-screen.js/onKeyDown, qui
// résout cette table via lib/input.js/resolveAction). "debugSpawn" reste
// bindée inconditionnellement ; c'est la CONSOMMATION (city-screen.js) qui
// l'ignore hors mode debug, comme avant. "announcePosition" (touche "x")
// n'est PLUS réservée au debug : DISPONIBLE en jeu normal comme
// announceTime/announceMoney — seule la PRÉCISION de ce qu'elle annonce
// varie avec isDebugEnabled(), côté consommation (voir announcePlayerX).
//
// "openEquipment" partage la touche "q" avec "moveLeft" (MOVE_BINDINGS
// ci-dessus) — PAS une ambiguïté : les deux canaux sont INDÉPENDANTS
// (continu vs appui, voir lib/input.js), et le mouvement n'est de toute
// façon consommé QUE par city-screen.js/onTick, qui cesse d'être appelé dès
// que l'écran d'inventaire passe au sommet de la pile (seul le sommet
// tique, voir CLAUDE.md) — presser "q" ouvre donc l'équipement SANS jamais
// faire bouger le joueur, même si la touche reste techniquement "tenue"
// pendant que l'écran est ouvert.
export const CITY_BINDINGS = {
  pauseMenu: { keys: ["Escape"], mods: [] },
  // Retour arrière : miroir de lib/menu.js/MENU_BINDINGS.backspace (annonce
  // "titre. entrée courante" dans un menu) — ici, annonce le nom de la
  // scène (voir view/city-screen.js/announceSceneName), l'équivalent le
  // plus proche pour un écran qui n'est pas un menu.
  announceSceneName: { keys: ["Backspace"], mods: [] },
  announceTime: { keys: ["t"], mods: [] },
  announceMoney: { keys: ["g"], mods: [] },
  openInventory: { keys: ["i"], mods: [] },
  openEquipment: { keys: ["q"], mods: [] },
  announcePosition: { keys: ["x"], mods: [] },
  // "w" (weather) : consultation pure de la météo courante (voir
  // core/weather.js) — outil de VÉRIFICATION, comme announceTime ("t") :
  // aucune action, juste une lecture d'état annoncée.
  announceWeather: { keys: ["w"], mods: [] },
  // Shift+W, MODE DEBUG UNIQUEMENT (voir config/debug.js,
  // view/city-screen.js/onKeyDown) : ouvre le menu de forçage météo (voir
  // view/menus/debug-weather-menu.js). Modificateur EXACT (mods:["shift"])
  // -> canal INDÉPENDANT de "announceWeather" ci-dessus (mods:[]), aucune
  // collision malgré la même touche "w" (voir lib/input.js).
  openWeatherDebugMenu: { keys: ["w"], mods: ["shift"] },
  // Shift+T, MODE DEBUG UNIQUEMENT (voir config/debug.js,
  // view/city-screen.js/onKeyDown) : ouvre le menu de forçage du temps (voir
  // view/menus/debug-time-menu.js). Même raisonnement que
  // openWeatherDebugMenu ci-dessus : mods:["shift"] est un canal INDÉPENDANT
  // de "announceTime" (mods:[]), aucune collision malgré la même touche "t".
  openTimeDebugMenu: { keys: ["t"], mods: ["shift"] },
  // "p" (perception) : bascule la PERCEPTION SURNATURELLE (voir
  // core/state.js/togglePerception, view/city-screen.js/togglePerceptionEffect)
  // — COOLDOWN anti-spam entièrement côté consommation (city-screen.js),
  // ce binding ne fait que router l'appui, comme tout le reste de cette
  // table.
  togglePerception: { keys: ["p"], mods: [] },
  debugSpawn: { keys: ["e"], mods: [] },
  interactDescribe: { keys: [" "], mods: [] },
  interactActivate: { keys: ["Enter"], mods: [] },
};
checkBindingsForCollisions(CITY_BINDINGS, "view/input.js CITY_BINDINGS");

// Bindings GLOBAUX — indépendants de la pile d'écrans, voir
// lib/input.js/onGlobalPress (câblé depuis main.js) : disponibles quel que
// soit l'écran actif (menu, pause, ville...), exactement comme l'ancien
// écouteur Alt+D dédié qu'ils remplacent. Ctrl plutôt qu'Alt : RÈGLE DE
// CONCEPTION du projet (voir lib/input.js/header) — aucun binding de jeu,
// dans AUCUNE table (celles-ci comme MOVE_BINDINGS/CITY_BINDINGS ci-dessus),
// n'utilise Alt. Alt seul déplace le focus navigateur vers sa barre de menus
// sur certains navigateurs (Firefox notamment), gênant même avec
// preventDefault sur la combinaison ; Alt reste réservé à l'utilisateur/au
// navigateur/au lecteur d'écran, jamais au jeu — seuls Ctrl et Shift servent
// de modificateurs ici.
export const GLOBAL_BINDINGS = {
  toggleDebug: { keys: ["d"], mods: ["ctrl"] },
};
checkBindingsForCollisions(GLOBAL_BINDINGS, "view/input.js GLOBAL_BINDINGS");

// -1 (gauche), 0 (immobile), +1 (droite). Gauche+droite tenues ensemble
// s'annulent. Réévalué à chaque appel (voir lib/input.js/isActionActive) :
// un modificateur pressé/relâché en cours de maintien change le résultat
// au tick suivant, sans code dédié ici.
export function getMoveIntent() {
  const left = isActionActive(MOVE_BINDINGS, "moveLeft");
  const right = isActionActive(MOVE_BINDINGS, "moveRight");

  if (left === right) return 0;
  return left ? -1 : 1;
}
