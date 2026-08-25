// Menu en jeu ("pause"), ouvert depuis une scène d'exploration (ville) via
// Échap — jamais depuis un sous-menu déjà ouvert par-dessus (interaction,
// désambiguïsation...) : seul le sommet de la pile reçoit le clavier (voir
// lib/screens.js), donc si un sous-menu est déjà actif c'est LUI qui
// intercepte Échap, jamais la scène en dessous. Câblé depuis
// view/city-screen.js.
//
// Comme le menu de désambiguïsation (view/interaction.js), il COMPOSE son
// cycle de vie avec la pause/reprise des balises de la scène plutôt que
// d'écraser onEnter/onExit — voir composeHook (lib/screens.js).

import { t } from "../../i18n/index.js";
import { pushScreen, popScreen, composeHook } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { createOptionsMenu } from "./options-menu.js";
import { saveGame } from "../save-storage.js";

// scene : fournit pauseBeacons()/resumeBeacons() (voir
// view/audio/city-scene.js), pour dégager le canal audio positionné pendant
// que ce menu est ouvert, sans toucher au contexte audio global. getSession
// : partie courante, TOUJOURS non nulle ici (ce menu n'existe qu'ouvert
// depuis une scène d'exploration active) — passée à Options -> Sauvegarde
// pour l'accès "Sauvegarder" complet (voir save-menu.js).
export function openPauseMenu(scene, getSession) {
  const menu = {
    title: "menu.pause.title",
    closable: true, // Échap referme le menu : identique à "Retour au jeu"
    entries: [
      {
        // Accès rapide à la sauvegarde manuelle, sans détour par Options.
        // saveGame() joue déjà le son + l'annonce de confirmation (voir
        // view/save-storage.js) : on ferme le menu APRÈS, jamais de
        // ré-annonce entre les deux qui écraserait la confirmation.
        label: "save.now",
        onActivate: () => {
          saveGame(getSession());
          popScreen();
        },
      },
      {
        label: "menu.pause.options",
        onActivate: () => pushScreen(makeMenuScreen(createOptionsMenu(getSession), t)),
      },
      {
        label: "menu.pause.main_menu",
        onActivate: () => {
          popScreen(); // ferme ce menu pause
          // Quitte la ville : city-screen.onExit détruit la scène et vide la
          // session — révèle le menu principal en dessous, qui se réannonce.
          popScreen();
        },
      },
      {
        // Aucune action propre : identique à Échap, juste popScreen().
        label: "menu.pause.resume",
        onActivate: () => popScreen(),
      },
    ],
  };

  const screen = makeMenuScreen(menu, t);
  screen.onEnter = composeHook(screen.onEnter, () => scene.pauseBeacons());
  screen.onExit = composeHook(screen.onExit, () => scene.resumeBeacons());

  pushScreen(screen);
}
