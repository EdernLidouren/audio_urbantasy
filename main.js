// Point d'entrée : câblage core <-> vue. Au chargement : focus la zone de
// jeu pour que les touches y arrivent, branche le routeur d'entrée, ouvre le
// menu principal, puis charge le niveau et démarre la boucle à pas fixe.

import { openMenu } from "./view/menu.js";
import { initInput, getMoveIntent } from "./view/input.js";
import { createMainMenu } from "./view/menus/main-menu.js";
import { runMovementChecks } from "./core/movement.check.js";
import { startLoop } from "./view/loop.js";
import { loadLevel } from "./level/load.js";
import registry from "./entities/types.js";
import { createInitialState } from "./core/state.js";
import { tick } from "./core/actions.js";
import { reduce } from "./core/reduce.js";

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

// État courant du core, mis à jour à chaque tick de la boucle. Vaut null
// tant que le niveau n'est pas chargé.
let state = null;

// Vérif console : logge player.x pendant qu'on tient une touche de
// déplacement. Rendu audio/annonce non requis à ce stade.
window.debugPlayerX = () => {
  if (!state) {
    console.log("debugPlayerX: état non initialisé (niveau pas encore chargé).");
    return;
  }
  console.log(state.player.x);
};

loadLevel("./level/demo.json", registry)
  .then((level) => {
    state = createInitialState(level);
    startLoop(() => {
      state = reduce(state, tick(getMoveIntent()));
    });
  })
  .catch((error) => {
    console.error(error.message);
  });
