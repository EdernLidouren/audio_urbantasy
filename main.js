// Point d'entrée : câblage minimal pour l'instant (le tick du core viendra
// plus tard). Au chargement : focus la zone de jeu pour que les touches y
// arrivent, branche le routeur d'entrée, puis ouvre le menu principal.

import { openMenu } from "./view/menu.js";
import { initInput } from "./view/input.js";
import { createMainMenu } from "./view/menus/main-menu.js";
import { runMovementChecks } from "./core/movement.check.js";

// Un import n'expose rien au scope global : on l'attache explicitement à
// window pour pouvoir appeler runMovementChecks() depuis la console. Un
// script type="module" s'exécute après le parsing du DOM (comme s'il avait
// "defer"), donc le DOM est déjà prêt ici.
window.runMovementChecks = runMovementChecks;
console.log("Vérifs dispo : tape runMovementChecks()");

const gameZone = document.getElementById("game");

initInput(gameZone);
gameZone.focus();
openMenu(createMainMenu());
