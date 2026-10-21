// Menu DEBUG du temps (Shift+T, MODE DEBUG UNIQUEMENT — voir config/debug.js,
// view/city-screen.js/onKeyDown), analogue à view/menus/debug-weather-menu.js
// pour session.time : force une avance de temps précise pour observer les
// enchaînements (transition de phase jour/nuit, crossfade, météo, routine
// PNJ) sans attendre, ou règle une vitesse d'écoulement temporaire pour les
// regarder défiler plutôt que les sauter.
//
// FORÇAGE PROPRE : toute entrée calcule un delta en MINUTES puis appelle
// advanceTimeEffect (fourni par l'appelant, voir view/city-screen.js) — le
// SEUL point d'écriture du temps (core/time.js/advanceTime) reste donc
// inchangé, composé exactement comme onFrame (advanceTime PUIS
// advanceWeather) : ce menu ne court-circuite AUCUNE réaction, il se contente
// de déclencher la même avance qu'un écoulement réel du même nombre de
// minutes aurait produite. Les réactions qui dépendent d'un TICK (présence
// conditionnelle, routine PNJ, crossfade jour/nuit) ne se rejouent, elles,
// qu'au tick SUIVANT — automatique dès la fermeture du menu (chaque entrée
// ferme le menu après action, voir plus bas), puisque la ville n'est plus au
// sommet de la pile pendant que ce menu est ouvert (aucun tick, donc le jeu
// GÈLE bien pendant la navigation) et reprend son tick normal juste après.
//
// Toujours des deltas POSITIFS (le temps ne recule jamais, voir
// minutesToNextOccurrence ci-dessous) — ni cette fonction ni advanceTime ne
// valident ce point séparément, c'est une garantie PAR CONSTRUCTION de
// chaque calcul de delta ici.
//
// Écran-menu STANDARD (lib/menu.js), même patron que debug-weather-menu.js :
// chaque activation FERME le menu (retour immédiat au jeu, pour ENTENDRE le
// résultat — comportement uniforme, y compris pour la vitesse, dont
// l'intérêt est justement d'observer le jeu tourner en direct, pas de rester
// dans le menu).

import { t } from "../../data/i18n/index.js";
import { pushScreen, popScreen } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { TIME_CONFIG } from "../../config/time-values.js";

const MINUTES_PER_DAY = TIME_CONFIG.hoursPerDay * TIME_CONFIG.minutesPerHour;
const MINUTES_PER_MONTH = MINUTES_PER_DAY * TIME_CONFIG.daysPerMonth;
const MINUTES_PER_SEASON = MINUTES_PER_MONTH * TIME_CONFIG.monthsPerSeason;

// Minutes à ajouter à `time` pour atteindre la PROCHAINE occurrence future
// (STRICTEMENT, jamais l'instant présent) d'un instant qui revient tous les
// `period` minutes depuis l'origine du temps (time=0), décalée de `offset`
// minutes — ex. "prochain 8h" : period=MINUTES_PER_DAY, offset=8×60 ;
// "prochaine saison" : period=MINUTES_PER_SEASON, offset=0 (les saisons
// s'alignent déjà sur l'origine, voir core/time.js/seasonOfYear, aucun
// décalage à corriger). Déjà PILE sur l'instant visé -> avance un cycle
// ENTIER jusqu'à la PROCHAINE occurrence, jamais un delta nul : "prochaine"
// exclut "maintenant" — ex. "aller à 20h" depuis 21h avance à 20h LE
// LENDEMAIN (jamais de recul, jamais un delta de -1h) ; depuis 15h, avance à
// 20h LE JOUR MÊME. TOUJOURS strictement positif quel que soit `time` — la
// seule garantie de non-recul de ce fichier repose entièrement sur cette
// formule.
function minutesToNextOccurrence(time, period, offset = 0) {
  const cyclePosition = (((time - offset) % period) + period) % period;
  return period - cyclePosition;
}

export function openTimeDebugMenu(getSession, advanceTimeEffect, setTimeScaleEffect) {
  // Lu UNE FOIS à l'ouverture : le temps est GELÉ tant que ce menu reste au
  // sommet de la pile (aucun tick ville tant qu'il y est, voir header), donc
  // session.time ne peut pas changer sous nos pieds pendant la navigation —
  // recalculer à chaque entrée n'apporterait rien.
  const time = getSession().time;
  const goToHour = (hour) => minutesToNextOccurrence(time, MINUTES_PER_DAY, hour * TIME_CONFIG.minutesPerHour);

  function advanceEntry(labelKey, minutes) {
    return {
      label: labelKey,
      onActivate: () => {
        advanceTimeEffect(minutes);
        popScreen();
      },
    };
  }

  function speedEntry(labelKey, scale) {
    return {
      label: labelKey,
      onActivate: () => {
        setTimeScaleEffect(scale);
        popScreen();
      },
    };
  }

  const entries = [
    // a) Avancer d'une durée fixe.
    advanceEntry("time.debug.advance15Min", 15),
    advanceEntry("time.debug.advance1Hour", TIME_CONFIG.minutesPerHour),
    advanceEntry("time.debug.advance6Hours", 6 * TIME_CONFIG.minutesPerHour),
    advanceEntry("time.debug.advance1Day", MINUTES_PER_DAY),
    // b) Régler une heure clé — "prochaine occurrence", voir header.
    advanceEntry("time.debug.goToMidnight", goToHour(0)),
    advanceEntry("time.debug.goTo8", goToHour(8)),
    advanceEntry("time.debug.goToNoon", goToHour(12)),
    advanceEntry("time.debug.goTo20", goToHour(20)),
    // c) Vitesse temporaire — voir config/time-values.js/setTimeScale ;
    // `null` restaure la valeur normale (resetTimeScale, voir
    // view/debug-effects.js/changeTimeScale). Multiplicateurs choisis
    // pour rendre une transition (crossfade jour/nuit) audible en quelques
    // secondes réelles plutôt qu'en minutes.
    speedEntry("time.debug.speedNormal", null),
    speedEntry("time.debug.speedFast", TIME_CONFIG.timeScale * 10),
    speedEntry("time.debug.speedVeryFast", TIME_CONFIG.timeScale * 40),
    // d) Prochaine transition de phase jour/nuit — MÊME formule que "aller à
    // Xh" ci-dessus, appliquée aux seuils déclarés (voir
    // config/time-values.js/dayStartHour/nightStartHour, core/time.js/
    // phaseAt) plutôt qu'une heure en dur : reste correct si ces seuils
    // changent un jour.
    advanceEntry("time.debug.nextDay", minutesToNextOccurrence(time, MINUTES_PER_DAY, TIME_CONFIG.dayStartHour * TIME_CONFIG.minutesPerHour)),
    advanceEntry(
      "time.debug.nextNight",
      minutesToNextOccurrence(time, MINUTES_PER_DAY, TIME_CONFIG.nightStartHour * TIME_CONFIG.minutesPerHour)
    ),
    // e) Calendrier.
    advanceEntry("time.debug.advance1Week", 7 * MINUTES_PER_DAY),
    advanceEntry("time.debug.nextSeason", minutesToNextOccurrence(time, MINUTES_PER_SEASON, 0)),
  ];

  pushScreen(makeMenuScreen({ title: "time.debug.title", closable: true, entries }, t));
}
