// Menu DEBUG météo (Shift+W, MODE DEBUG UNIQUEMENT — voir config/debug.js,
// view/city-screen.js/onKeyDown) : force une météo précise ou provoque la
// transition suivante, pour observer les enchaînements sans attendre le
// hasard — indispensable avant de brancher les effets météo (ambiance,
// spawns), qui viendront lire session.weather.state.
//
// Écran-menu STANDARD (lib/menu.js) : une simple liste d'actions, aucun
// besoin de la grille 2D custom de view/menus/city-map-menu.js. Entrées
// "Forcer : <état>" GÉNÉRÉES depuis config/weather-values.js/WEATHER_STATES
// — un état ajouté à la table apparaît ici automatiquement, rien à coder à
// la main.
//
// forceWeather(targetState) / triggerTransition() : effets fournis par
// l'appelant (voir view/city-screen.js) — ce module ignore tout de
// setSession, même principe que openPauseMenu/openCityMapMenu. Chaque
// activation FERME le menu (retour immédiat au jeu pour entendre le
// résultat) — comportement uniforme pour les deux types d'entrée, par
// cohérence.

import { t } from "../../data/i18n/index.js";
import { pushScreen, popScreen } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { WEATHER_STATES } from "../../config/weather-values.js";

export function openWeatherDebugMenu(forceWeather, triggerTransition) {
  const entries = [
    {
      label: "weather.debug.triggerTransition",
      onActivate: () => {
        triggerTransition();
        popScreen();
      },
    },
    // Une entrée par état déclaré, DANS L'ORDRE de la table (voir header) —
    // labelParams interpole le nom d'état déjà résolu (t(`weather.state.
    // ${state}`)), jamais une clé imbriquée dans le gabarit lui-même.
    ...Object.keys(WEATHER_STATES).map((state) => ({
      label: "weather.debug.force",
      labelParams: { state: t(`weather.state.${state}`) },
      onActivate: () => {
        forceWeather(state);
        popScreen();
      },
    })),
  ];

  pushScreen(makeMenuScreen({ title: "weather.debug.title", closable: true, entries }, t));
}
