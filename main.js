// Point d'entrée : câblage minimal pour l'instant (le tick du core viendra
// plus tard). Au chargement : focus la zone de jeu pour que les touches y
// arrivent, branche le routeur d'entrée, puis ouvre le menu principal.

import { openMenu } from "./view/menu.js";
import { initInput } from "./view/input.js";
import { createMainMenu } from "./view/menus/main-menu.js";

const gameZone = document.getElementById("game");

initInput(gameZone);
gameZone.focus();
openMenu(createMainMenu());
