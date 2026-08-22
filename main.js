// Point d'entrée : câblage core <-> vue. Au chargement : focus la zone de
// jeu, branche le clavier, pousse le menu principal comme premier écran,
// démarre la boucle à pas fixe (qui tick uniquement l'écran actif au sommet
// de la pile), puis charge le niveau en tâche de fond.

import { pushScreen, tickActive } from "./lib/screens.js";
import { initInput } from "./view/input.js";
import { createMainMenu } from "./view/menus/main-menu.js";
import { makeMenuScreen } from "./view/menu.js";
import { makeCityScreen } from "./view/city-screen.js";
import { runMovementChecks } from "./core/movement.check.js";
import { startLoop } from "./lib/loop.js";
import { loadLevel } from "./level/load.js";
import registry from "./entities/types.js";
import { createInitialState } from "./core/state.js";

// Un import n'expose rien au scope global : on l'attache explicitement à
// window pour pouvoir appeler runMovementChecks() depuis la console. Un
// script type="module" s'exécute après le parsing du DOM (comme s'il avait
// "defer"), donc le DOM est déjà prêt ici.
window.runMovementChecks = runMovementChecks;
console.log("Vérifs dispo : tape runMovementChecks()");

const gameZone = document.getElementById("game");

initInput(gameZone);
gameZone.focus();

// Niveau chargé en tâche de fond ; enterCity() le lit au moment de
// l'activation (cas limite improbable : niveau pas encore chargé -> no-op).
let level = null;

// Session de la partie en cours (sortie de createInitialState). null hors
// ville : la ville (view/city-screen.js) est une simple vue dessus, elle
// n'en détient pas de copie propre.
let session = null;

function getSession() {
  return session;
}
function setSession(next) {
  session = next;
}

function enterCity() {
  if (!level) return;
  session = createInitialState(level);
  pushScreen(makeCityScreen(getSession, setSession));
}

// Vérif console : logge player.x pendant qu'on tient une touche de
// déplacement. Rendu audio/annonce non requis à ce stade.
window.debugPlayerX = () => {
  if (!session) {
    console.log("debugPlayerX: aucune session en cours (hors ville).");
    return;
  }
  console.log(session.player.x);
};

pushScreen(makeMenuScreen(createMainMenu(enterCity)));
startLoop(tickActive);

loadLevel("./level/demo.json", registry)
  .then((loadedLevel) => {
    level = loadedLevel;
  })
  .catch((error) => {
    console.error(error.message);
  });
