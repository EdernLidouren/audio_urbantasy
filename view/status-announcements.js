// ANNONCES D'ÉTAT, à la demande (touches de l'écran de ville) : une simple
// lecture de la partie, sans aucun effet. Les gabarits i18n décident seuls
// de l'ordre et de la ponctuation.

import { announce } from "../lib/announce.js";
import { t } from "../data/i18n/index.js";
import { getActiveWorld, isTwoSided } from "../core/state.js";
import { minuteOfHour, hourOfDay, dayOfMonth, monthOfYear, seasonOfYear, yearNumber, SEASON_KEYS, MONTH_KEYS } from "../core/time.js";
import { isDebugEnabled } from "../config/debug.js";

// Deux chiffres pour une lecture d'horloge stable ("09 h 05", jamais "9 h 5").
function pad2(n) {
  return String(n).padStart(2, "0");
}

// Heure et date (touche "t", et après un saut de temps de debug). Mois et
// saison sont traduits avant d'être insérés dans le gabarit.
export function announceGameTime(session) {
  const { time } = session;
  announce(
    t("time.announce", {
      hour: pad2(hourOfDay(time)),
      minute: pad2(minuteOfHour(time)),
      day: dayOfMonth(time),
      month: t(MONTH_KEYS[monthOfYear(time) - 1]),
      season: t(SEASON_KEYS[seasonOfYear(time)]),
      year: yearNumber(time),
    })
  );
}

// Nom de la scène active (touche Retour arrière, et à chaque arrivée dans un
// monde) : la même annonce dans tous les cas.
export function announceSceneName(session) {
  announce(t(getActiveWorld(session).titleKey), { assertive: true });
}

// Argent (touche "g").
export function announceMoney(session) {
  announce(t("money.announce", { amount: session.money }));
}

// Météo (touche "w", et après un forçage de debug).
export function announceWeather(session) {
  announce(t("weather.announce", { state: t(`weather.state.${session.weather.state}`) }));
}

// Position (touche "x") : entier arrondi en jeu normal ; deux décimales en
// debug (la position accumule du bruit flottant, inutile à l'oreille).
// La face n'est annoncée que pour un monde à deux faces.
export function announcePlayerX(session) {
  const world = session.worlds[session.activeWorldId];
  const x = isDebugEnabled() ? session.player.x.toFixed(2) : Math.round(session.player.x);
  if (isTwoSided(world)) {
    announce(t("position.announceWithSide", { x, length: world.length, side: t(`side.${session.player.side}`) }));
    return;
  }
  announce(t("position.announce", { x, length: world.length }));
}
