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

// Raccourcis de la ville — APPUI (voir view/city-screen.js/onKeyDown, qui
// résout cette table via lib/input.js/resolveAction). "debugPosition"/
// "debugSpawn" restent bindés inconditionnellement ; c'est la CONSOMMATION
// (city-screen.js) qui les ignore hors mode debug, comme avant.
export const CITY_BINDINGS = {
  pauseMenu: { keys: ["Escape"], mods: [] },
  announceTime: { keys: ["t"], mods: [] },
  announceMoney: { keys: ["g"], mods: [] },
  openInventory: { keys: ["i"], mods: [] },
  debugPosition: { keys: ["x"], mods: [] },
  debugSpawn: { keys: ["e"], mods: [] },
  interactDescribe: { keys: [" "], mods: [] },
  interactActivate: { keys: ["Enter"], mods: [] },
};
checkBindingsForCollisions(CITY_BINDINGS, "view/input.js CITY_BINDINGS");

// Bindings GLOBAUX — indépendants de la pile d'écrans, voir
// lib/input.js/onGlobalPress (câblé depuis main.js) : disponibles quel que
// soit l'écran actif (menu, pause, ville...), exactement comme l'ancien
// écouteur Alt+D dédié qu'ils remplacent. Ctrl plutôt qu'Alt (choix
// délibéré) : Alt seul déplace le focus navigateur vers sa barre de menus
// sur certains navigateurs (Firefox notamment), gênant même avec
// preventDefault sur la combinaison — Ctrl n'a pas ce défaut.
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
