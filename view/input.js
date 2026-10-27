// Spécifique-jeu : quelles touches signifient quoi pour Templeton — les
// TABLES DE BINDINGS (voir lib/input.js pour le moteur générique qui les
// résout). Ce fichier est la SEULE source de ces associations touche(s) ->
// action ; un futur écran de remappage n'aurait qu'à reconstruire ces
// objets (structure prête, aucune interface de remappage construite ici :
// pas d'abstraction avant le besoin).

import { isActionActive, defineBindings } from "../lib/input.js";

// Mouvement — CONTINU (voir isActionActive) : plusieurs touches physiques
// pour une même action (flèches + ZQSD). mods:[] exige l'ABSENCE de tout
// modificateur — c'est cette exigence qui empêche Ctrl+D de déclencher
// "moveRight" (voir la RÈGLE D'ARBITRAGE des modificateurs, en-tête de
// lib/input.js).
const MOVE_BINDINGS = defineBindings("move", {
  moveLeft: { keys: ["ArrowLeft", "q", "a"], mods: [] },
  moveRight: { keys: ["ArrowRight", "d"], mods: [] },
});

// Toutes les touches de mouvement, à plat — fournies telles quelles à
// lib/input.js/initInput (preventDefaultKeys, voir main.js) : lib/input.js
// ignore tout de leur SENS, il sait seulement qu'il doit supprimer leur
// comportement par défaut (défilement de page) à chaque appui, répétitions
// OS incluses.
export const MOVE_KEYS = [...MOVE_BINDINGS.moveLeft.keys, ...MOVE_BINDINGS.moveRight.keys];

// Le piège de focus Tab (navigation native du navigateur sortant le focus de
// #game) n'a rien à faire ici : lib/input.js neutralise Tab/Maj+Tab de façon
// INCONDITIONNELLE et générique, en tête de son propre traitement (voir
// ALWAYS_NEUTRALIZED_BINDINGS, lib/input.js) — rien à fournir depuis ce
// fichier pour ça.

// Raccourcis de la ville — APPUI (voir view/city-screen.js/onKeyDown, qui
// résout cette table via lib/input.js/resolveAction). Les raccourcis de
// debug restent bindés inconditionnellement ; c'est la CONSOMMATION
// (city-screen.js, KEY_ACTIONS `debugOnly`) qui les ignore hors mode debug.
// "announcePosition"
// (touche "x") est DISPONIBLE en jeu normal comme announceTime/announceMoney
// — seule la PRÉCISION de ce qu'elle annonce varie avec isDebugEnabled(),
// côté consommation (voir view/status-announcements.js/announcePlayerX).
//
// "openEquipment" partage la touche "q" avec "moveLeft" (MOVE_BINDINGS
// ci-dessus) — PAS une ambiguïté : les deux canaux sont INDÉPENDANTS
// (continu vs appui, voir lib/input.js), et le mouvement n'est de toute
// façon consommé QUE par city-screen.js/onTick, qui cesse d'être appelé dès
// que l'écran d'inventaire passe au sommet de la pile (seul le sommet
// tique, voir lib/screens.js) — presser "q" ouvre donc l'équipement SANS jamais
// faire bouger le joueur, même si la touche reste techniquement "tenue"
// pendant que l'écran est ouvert.
export const CITY_BINDINGS = defineBindings("city", {
  pauseMenu: { keys: ["Escape"], mods: [] },
  // Shift+S : sauvegarde rapide, la même que "Sauvegarder" du menu pause,
  // sans l'ouvrir. Une touche tenue ne sauvegarde qu'une fois : lib/input.js
  // ignore l'auto-répétition pour toute pression ponctuelle.
  quickSave: { keys: ["s"], mods: ["shift"] },
  // Retour arrière : miroir de lib/menu.js/MENU_BINDINGS.backspace (annonce
  // "titre. entrée courante" dans un menu) — ici, annonce le nom de la
  // scène (voir view/status-announcements.js/announceSceneName), l'équivalent le
  // plus proche pour un écran qui n'est pas un menu.
  announceSceneName: { keys: ["Backspace"], mods: [] },
  announceTime: { keys: ["t"], mods: [] },
  announceMoney: { keys: ["g"], mods: [] },
  openInventory: { keys: ["i"], mods: [] },
  openEquipment: { keys: ["q"], mods: [] },
  // "m" : même écran à onglets, ouvert sur l'onglet Améliorations (voir
  // view/menus/inventory-menu.js/openImprovementsMenu). Canal distinct de
  // Shift+M (openTeleportDebugMenu, mods exacts).
  openImprovements: { keys: ["m"], mods: [] },
  // "c" : même écran à onglets, ouvert sur l'onglet Collections (voir
  // view/menus/inventory-menu.js/openCollectionsMenu). Canal distinct de
  // Shift+C (openCollectionsDebugMenu, mods exacts).
  openCollections: { keys: ["c"], mods: [] },
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
  // Shift+M, MODE DEBUG UNIQUEMENT : menu de téléportation vers n'importe
  // quelle scène du registre (voir view/menus/debug-teleport-menu.js).
  openTeleportDebugMenu: { keys: ["m"], mods: ["shift"] },
  // Shift+L (log), MODE DEBUG UNIQUEMENT : journal des avertissements (voir
  // view/menus/debug-warnings-menu.js).
  openWarningsDebugMenu: { keys: ["l"], mods: ["shift"] },
  // Shift+C, MODE DEBUG UNIQUEMENT : tout révéler / tout réinitialiser dans
  // les collections (voir view/menus/debug-collections-menu.js).
  openCollectionsDebugMenu: { keys: ["c"], mods: ["shift"] },
  // "p" (perception) : bascule la PERCEPTION SURNATURELLE (voir
  // core/state.js/togglePerception, view/perception-toggle.js/toggle)
  // — COOLDOWN anti-spam entièrement côté consommation (perception-toggle.js),
  // ce binding ne fait que router l'appui, comme tout le reste de cette
  // table.
  togglePerception: { keys: ["p"], mods: [] },
  // "e" (émote) : menu des émotes connues (voir view/emotes.js). Sans
  // aucune émote connue, la touche ne fait rien, comme la perception.
  openEmotes: { keys: ["e"], mods: [] },
  interactDescribe: { keys: [" "], mods: [] },
  interactActivate: { keys: ["Enter"], mods: [] },
});

// Bindings GLOBAUX — indépendants de la pile d'écrans, voir
// lib/input.js/onGlobalPress (câblé depuis main.js) : disponibles quel que
// soit l'écran actif (menu, pause, ville...). Ctrl plutôt qu'Alt : RÈGLE DE
// CONCEPTION du projet (voir lib/input.js/header) — aucun binding de jeu,
// dans AUCUNE table (celles-ci comme MOVE_BINDINGS/CITY_BINDINGS ci-dessus),
// n'utilise Alt. Alt seul déplace le focus navigateur vers sa barre de menus
// sur certains navigateurs (Firefox notamment), gênant même avec
// preventDefault sur la combinaison ; Alt reste réservé à l'utilisateur/au
// navigateur/au lecteur d'écran, jamais au jeu — seuls Ctrl et Shift servent
// de modificateurs ici.
export const GLOBAL_BINDINGS = defineBindings("global", {
  toggleDebug: { keys: ["d"], mods: ["ctrl"] },
  // Aide des touches (lib/help.js), contextuelle : ce que propose l'écran
  // actif. F1, la touche d'aide usuelle (son comportement navigateur est
  // neutralisé, comme tout binding global) ; Maj+H en secours si un
  // navigateur ou une configuration la prend malgré tout. Globales : jamais
  // utilisables par un écran.
  openHelp: { keys: ["F1"], mods: [] },
  openHelpAlt: { keys: ["h"], mods: ["shift"] },
});

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
