// BALISES EN PAUSE derrière un écran (menu de pause, inventaire, boutique,
// carte, menu de choix d'interaction...) : seules les balises continues du
// monde se taisent, jamais la musique ni les ambiances.
//
// La vue du monde est relue à CHAQUE entrée et sortie (`getWorldView`, voir
// view/world-travel.js/current), jamais gardée depuis l'ouverture : un
// import de partie fait sous un menu remplace la vue, et la reprise doit
// viser la nouvelle. Aucune vue (attente d'un voyage) : rien à faire.
// Pause à chaque onEnter, y compris au retour d'un sous-menu : sans effet
// sur des balises déjà en pause.

import { composeHook } from "../lib/screens.js";

// Compose la pause/reprise sur les hooks de `screen` (voir composeHook :
// le comportement de base d'abord, jamais écrasé) et rend l'écran.
export function withPausedBeacons(screen, getWorldView) {
  screen.onEnter = composeHook(screen.onEnter, () => getWorldView()?.pauseBeacons());
  screen.onExit = composeHook(screen.onExit, () => getWorldView()?.resumeBeacons());
  return screen;
}
