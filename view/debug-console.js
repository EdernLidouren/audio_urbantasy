// LA CONSOLE DE DEBUG : les fonctions que le jeu expose sur `window` pour la
// console du navigateur. Les vérifications (runChecks), la bascule du mode debug
// (toggleDebug), et les accès des tests en jeu (tools/test-kit.js) : ceux-là ne
// répondent qu'en MODE DEBUG (config/debug.js), et ne rendent jamais que des
// COPIES de l'état, pour que la console ne touche pas au jeu. L'état lui-même
// reste à main.js, qui prête ses accesseurs (installDebugConsole).

import { isDebugEnabled } from "../config/debug.js";

// Le refus d'un accès réservé au mode debug, dit en console.
function debugOff(name) {
  console.log(`${name}: mode debug désactivé (toggleDebug() ou Ctrl+D).`);
}

// `getSession()` : la partie en cours (null hors partie) ; `getCityScreen()` :
// l'écran de ville en cours (null hors partie) ; `toggleDebug()` : la bascule du
// mode debug, la même que Ctrl+D (main.js) ; `startMarblesGame(seed, state)` et
// `getMarblesGame()` : la partie de billes.
export function installDebugConsole({ getSession, getCityScreen, toggleDebug, startMarblesGame, getMarblesGame }) {
  // runChecks() (voir core/checks/index.js : runChecks("spawn") pour un seul
  // domaine). Les vérifications, et les outils qu'elles testent, ne se chargent
  // qu'à l'appel (import dynamique) : jamais au démarrage du jeu, dont elles
  // feraient plus du tiers du code chargé. Rend une promesse du résultat.
  window.runChecks = async (...args) => (await import("../core/checks/index.js")).runChecks(...args);
  console.log("Vérifs dispo : tape runChecks()");

  // Mode DEBUG : PAS de menu — bascule depuis la console OU par Ctrl+D en jeu,
  // deux chemins, UNE seule fonction.
  window.toggleDebug = toggleDebug;
  console.log("Mode debug : tape toggleDebug() ou Ctrl+D en jeu");

  // Logge player.x pendant qu'on tient une touche de déplacement.
  window.debugPlayerX = () => {
    const session = getSession();
    if (!session) {
      console.log("debugPlayerX: aucune session en cours (hors ville).");
      return;
    }
    console.log(session.player.x);
  };

  // Les actions de debug de l'écran de ville en cours (view/city-screen.js/
  // debugActions), ou null hors partie. Une fonction, relue à chaque appel : une
  // nouvelle partie remplace l'écran.
  window.debugActions = () => {
    if (!isDebugEnabled()) {
      debugOff("debugActions");
      return null;
    }
    return getSession() && getCityScreen() ? getCityScreen().debugActions : null;
  };

  // Une COPIE de la partie en cours (positions, présence, variables...), pour
  // inspecter l'état pendant un test sans passer par une sauvegarde. L'état est
  // sérialisable par contrat, structuredClone suffit.
  window.debugSession = () => {
    if (!isDebugEnabled()) {
      debugOff("debugSession");
      return undefined;
    }
    if (!getSession()) {
      console.log("debugSession: aucune session en cours (hors ville).");
      return undefined;
    }
    return structuredClone(getSession());
  };

  // Une partie de billes à graine imposée, ou sur un état construit (`state`, un
  // état de marbles/core/marbles.js : voir tools/test-kit.js/startMarbles) ; et une
  // COPIE de la partie de billes en cours.
  window.debugStartMarbles = (seed, state = null) => {
    if (!isDebugEnabled()) {
      debugOff("debugStartMarbles");
      return;
    }
    startMarblesGame(seed, state === null ? null : structuredClone(state));
  };
  window.debugMarbles = () => {
    if (!isDebugEnabled()) {
      debugOff("debugMarbles");
      return undefined;
    }
    return structuredClone(getMarblesGame());
  };
}
