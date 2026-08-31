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

import { t } from "../../data/i18n/index.js";
import { pushScreen, popScreen, composeHook } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { createOptionsMenu } from "./options-menu.js";
import { openCityMapMenu } from "./city-map-menu.js";
import { saveGame } from "../save-storage.js";

// scene : fournit pauseBeacons()/resumeBeacons() (voir
// view/audio/city-scene.js), pour dégager le canal audio positionné pendant
// que CE menu est ouvert, sans toucher au contexte audio global — transmis
// AUSSI à la carte de la ville (voir plus bas), qui gère sa PROPRE
// pause/reprise : elle REMPLACE ce menu (popScreen() avant de l'ouvrir,
// jamais un empilement), donc rien à partager entre les deux. getSession :
// partie courante, TOUJOURS non nulle ici (ce menu n'existe qu'ouvert
// depuis une scène d'exploration active) — utilisée directement pour
// "Sauvegarder" ci-dessous (seul point d'accès à la sauvegarde manuelle,
// voir save-menu.js pour les réglages/import-export) et transmise à
// Options pour ce qui en a besoin (Sauvegarde > import/export de partie).
// travelViaCityMap(levelId, spawnX) : effet de sélection sur la carte de
// la ville (voir view/city-screen.js) — transmis tel quel à
// view/menus/city-map-menu.js, ce fichier ignore tout de son
// fonctionnement (destroy/travelToWorld/recreate), il ne fait que router.
export function openPauseMenu(scene, getSession, travelViaCityMap) {
  const menu = {
    title: "menu.pause.title",
    closable: true, // Échap referme le menu : identique à "Retour au jeu"
    entries: [
      {
        // Accès rapide à la sauvegarde manuelle, sans détour par Options.
        // saveGame() joue déjà son propre son de confirmation (voir
        // view/save-storage.js, aucune annonce parlée) : fermer le menu
        // juste après ne risque donc d'écraser aucune confirmation.
        label: "save.now",
        onActivate: () => {
          saveGame(getSession());
          popScreen();
        },
      },
      {
        label: "menu.pause.city_map",
        // Ferme la pause AVANT d'ouvrir la carte — jamais un empilement :
        // la carte la REMPLACE, ne se pousse pas par-dessus (contrairement
        // à Options ci-dessous, qui reste un vrai sous-menu). Sinon
        // sélectionner une zone ne referme QUE la carte (voir
        // view/menus/city-map-menu.js/selectCurrent, un seul popScreen)
        // et laisse la pause visible en dessous, jeu toujours figé.
        onActivate: () => {
          popScreen();
          openCityMapMenu(scene, getSession, travelViaCityMap);
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
