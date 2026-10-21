// Vérifications du core — domaine « time ». Horloge de partie (core/time.js).
// Lancées par core/checks/index.js/runChecks (voir ce fichier). Pur : aucun
// DOM, aucun fetch ; chaque scène est construite en dur via un objet littéral
// passé à parseScene.

import { parseScene } from "../scene.js";
import { createInitialState } from "../state.js";
import { tick } from "../actions.js";
import { reduce } from "../reduce.js";
import {
  INITIAL_TIME,
  SEASON_KEYS,
  MONTH_KEYS,
  WEEKDAY_KEYS,
  advanceTime,
  minuteOfHour,
  hourOfDay,
  dayOfMonth,
  monthOfYear,
  seasonOfYear,
  yearNumber,
  weekdayOf,
  phaseAt,
} from "../time.js";
import { TIME_CONFIG } from "../../config/time-values.js";
import { NO_COMPANIONS, EMPTY_REGISTRY } from "./helpers.js";

export default function checkTime(run) {
  // --- Horloge de partie (core/time.js) ---
  // Compteur unique + dérivations pures. RIEN d'autre ne consomme le temps
  // ici (pas de jour/nuit, pas d'événements) — ce sont de futurs chantiers,
  // voir core/time.md. advanceTime ne lit jamais l'horloge réelle : chaque
  // scénario ci-dessous injecte un delta EXPLICITE, jamais mesuré.

  const timeScene = parseScene(
    { id: "movement-check-time", titleKey: "scene.demo.name", length: 10, playerStart: 0, entities: [] },
    EMPTY_REGISTRY
  );

  // Origine : jour 1, mois 1 (saison 0), année 1, à l'heure de départ
  // configurée (config/time-values.js/startHour) — jamais minuit.
  let timeState = createInitialState(timeScene, undefined, NO_COMPANIONS);
  run("horloge : session.time démarre à INITIAL_TIME", INITIAL_TIME, timeState.time);
  run("horloge : heure de départ = startHour configuré", TIME_CONFIG.startHour, hourOfDay(timeState.time));
  run("horloge : minute de départ = 0", 0, minuteOfHour(timeState.time));
  run("horloge : jour de départ = 1", 1, dayOfMonth(timeState.time));
  run("horloge : mois de départ = 1", 1, monthOfYear(timeState.time));
  run("horloge : saison de départ = 0 (printemps)", 0, seasonOfYear(timeState.time));
  run("horloge : année de départ = 1", 1, yearNumber(timeState.time));
  run("horloge : SEASON_KEYS couvre les 4 saisons", 4, SEASON_KEYS.length);

  // Pureté : n'affecte QUE .time, jamais mutée sur place (référence
  // d'entrée intacte), et déterministe (même delta -> même résultat).
  const beforeAdvance = timeState;
  const afterAdvance = advanceTime(timeState, 30);
  run("horloge : advanceTime ne mute jamais l'état d'entrée", INITIAL_TIME, beforeAdvance.time);
  run("horloge : advanceTime avance le compteur du delta exact", INITIAL_TIME + 30, afterAdvance.time);
  run(
    "horloge : advanceTime déterministe (même delta -> même résultat)",
    advanceTime(timeState, 30).time,
    advanceTime(timeState, 30).time
  );
  run.same(
    "horloge : advanceTime ne touche à rien d'autre que .time",
    { ...beforeAdvance, time: null },
    { ...afterAdvance, time: null }
  );

  // Aucune horloge implicite dans le core : de nombreux TICK ne font JAMAIS
  // avancer .time — seul advanceTime() le fait (voir CLAUDE.md, "le core
  // n'a ni horloge ni clavier").
  let noClockState = createInitialState(timeScene, undefined, NO_COMPANIONS);
  for (let i = 0; i < 500; i++) noClockState = reduce(noClockState, tick(1));
  run("horloge : reduce()/TICK ne fait jamais avancer le temps", INITIAL_TIME, noClockState.time);

  // Roulement minute -> heure (23 -> 0 avant 60).
  const oneHour = TIME_CONFIG.minutesPerHour;
  const beforeMinuteRoll = advanceTime(timeState, oneHour - minuteOfHour(timeState.time) - 1); // xx:59
  const afterMinuteRoll = advanceTime(beforeMinuteRoll, 1); // xx+1:00
  run("horloge : juste avant le roulement, minute = 59", 59, minuteOfHour(beforeMinuteRoll.time));
  run("horloge : après le roulement, minute retombe à 0", 0, minuteOfHour(afterMinuteRoll.time));
  run(
    "horloge : après le roulement, l'heure a avancé de 1",
    (hourOfDay(beforeMinuteRoll.time) + 1) % TIME_CONFIG.hoursPerDay,
    hourOfDay(afterMinuteRoll.time)
  );

  // Roulement jour -> mois -> minuit : depuis l'origine, avancer jusqu'à
  // 23:59 du dernier jour du mois puis +1 minute doit faire rouler jour ET
  // mois ensemble (jour 1 du mois suivant, minuit).
  const minutesToMonthEnd =
    TIME_CONFIG.daysPerMonth * TIME_CONFIG.hoursPerDay * TIME_CONFIG.minutesPerHour - INITIAL_TIME - 1;
  const monthEndState = advanceTime(timeState, minutesToMonthEnd); // dernier jour du mois, 23:59
  run("horloge : dernier jour du mois avant minuit", TIME_CONFIG.daysPerMonth, dayOfMonth(monthEndState.time));
  run("horloge : heure juste avant minuit", TIME_CONFIG.hoursPerDay - 1, hourOfDay(monthEndState.time));
  const nextMonthState = advanceTime(monthEndState, 1); // minuit, mois suivant
  run("horloge : après minuit, jour retombe à 1", 1, dayOfMonth(nextMonthState.time));
  run("horloge : après minuit du dernier jour, mois avance", 2, monthOfYear(nextMonthState.time));
  run("horloge : après minuit, heure retombe à 0", 0, hourOfDay(nextMonthState.time));

  // Roulement mois -> année -> saison : mois 12 -> mois 1, année +1, saison
  // retombe à 0 (printemps).
  const minutesToYearEnd =
    TIME_CONFIG.monthsPerYear * TIME_CONFIG.daysPerMonth * TIME_CONFIG.hoursPerDay * TIME_CONFIG.minutesPerHour -
    INITIAL_TIME -
    1;
  const yearEndState = advanceTime(timeState, minutesToYearEnd); // dernier jour du dernier mois, 23:59
  run("horloge : dernier mois de l'année avant le roulement", TIME_CONFIG.monthsPerYear, monthOfYear(yearEndState.time));
  run("horloge : année avant le roulement = 1", 1, yearNumber(yearEndState.time));
  const nextYearState = advanceTime(yearEndState, 1);
  run("horloge : après le roulement, mois retombe à 1", 1, monthOfYear(nextYearState.time));
  run("horloge : après le roulement, année avance", 2, yearNumber(nextYearState.time));
  run("horloge : après le roulement, saison retombe à 0 (printemps)", 0, seasonOfYear(nextYearState.time));

  // Saisons : chaque bloc de monthsPerSeason mois partage la même saison,
  // la suivante commence au mois suivant — vérifié sur les 12 mois de
  // l'année, pas seulement aux bornes déjà couvertes ci-dessus.
  const seasonsByMonth = [];
  for (let m = 1; m <= TIME_CONFIG.monthsPerYear; m++) {
    const minutesToMonth = (m - 1) * TIME_CONFIG.daysPerMonth * TIME_CONFIG.hoursPerDay * TIME_CONFIG.minutesPerHour - INITIAL_TIME;
    seasonsByMonth.push(seasonOfYear(advanceTime(timeState, minutesToMonth).time));
  }
  run.same(
    "horloge : les 12 mois se répartissent en 4 saisons de 3 mois consécutifs",
    [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3],
    seasonsByMonth
  );

  // Jour de semaine (weekdayOf) : dérivation PURE, jours écoulés modulo 7,
  // décalée par weekdayOrigin (config/time-values.js). MONTH_KEYS/
  // WEEKDAY_KEYS : couverture de taille, comme SEASON_KEYS ci-dessus.
  run("horloge : MONTH_KEYS couvre les 12 mois", 12, MONTH_KEYS.length);
  run("horloge : WEEKDAY_KEYS couvre les 7 jours", 7, WEEKDAY_KEYS.length);
  run("horloge : jour de semaine de départ = weekdayOrigin (jour 1)", TIME_CONFIG.weekdayOrigin, weekdayOf(timeState.time));

  const oneDayMinutes = TIME_CONFIG.hoursPerDay * TIME_CONFIG.minutesPerHour;
  // Rester dans le MÊME jour (avant minuit) ne fait jamais avancer le jour
  // de semaine — seul le FRANCHISSEMENT de minuit le fait (voir plus bas).
  const sameDayLater = advanceTime(timeState, oneDayMinutes - INITIAL_TIME - 1); // 23:59 du jour 1
  run("horloge : jour de semaine inchangé tant qu'on reste dans le même jour", weekdayOf(timeState.time), weekdayOf(sameDayLater.time));
  const nextDayState = advanceTime(sameDayLater, 1); // minuit, jour 2
  run(
    "horloge : le jour de semaine avance de 1 (modulo 7) au passage de minuit",
    (weekdayOf(timeState.time) + 1) % 7,
    weekdayOf(nextDayState.time)
  );

  // Cycle complet de 7 jours : lundi -> ... -> dimanche -> lundi, jamais un
  // découpage en semaines calées sur le mois/l'année (voir le commentaire de
  // weekdayOf) — vérifié en avançant 7 jours pleins depuis l'origine.
  const sevenDaysLater = advanceTime(timeState, 7 * oneDayMinutes);
  run("horloge : après 7 jours pleins, le jour de semaine boucle exactement", weekdayOf(timeState.time), weekdayOf(sevenDaysLater.time));
  const weekdaysOverTenDays = [];
  for (let d = 0; d < 10; d++) weekdaysOverTenDays.push(weekdayOf(advanceTime(timeState, d * oneDayMinutes).time));
  run.same(
    "horloge : séquence de jours de semaine sur 10 jours, cycle de 7 respecté",
    [0, 1, 2, 3, 4, 5, 6, 0, 1, 2].map((offset) => (offset + TIME_CONFIG.weekdayOrigin) % 7),
    weekdaysOverTenDays
  );

  // Granularité minute : un delta fractionnaire (< 1 minute) s'accumule
  // dans .time (jamais arrondi par advanceTime lui-même, voir son
  // commentaire) mais reste invisible tant qu'il ne franchit pas la minute
  // entière — les dérivations ne montrent jamais de fraction.
  const fractionalState = advanceTime(timeState, 0.4);
  run("horloge : un delta fractionnaire est conservé dans .time", INITIAL_TIME + 0.4, fractionalState.time);
  run(
    "horloge : mais reste invisible dans les dérivations (granularité = la minute)",
    minuteOfHour(timeState.time),
    minuteOfHour(fractionalState.time)
  );
  const fractionalCrossing = advanceTime(fractionalState, 0.7); // 0.4 + 0.7 = 1.1 -> franchit la minute
  run("horloge : la somme de fractions franchit bien la minute au bon moment", minuteOfHour(timeState.time) + 1, minuteOfHour(fractionalCrossing.time));

  // Persistance : session.time survit à un aller-retour JSON avec sa valeur
  // EXACTE (déjà couvert génériquement par l'audit de sérialisabilité plus
  // bas, vérifié ici explicitement et lisiblement pour ce champ précis).
  const timeRoundTrip = JSON.parse(JSON.stringify(afterAdvance));
  run("horloge : session.time survit à un aller-retour JSON", afterAdvance.time, timeRoundTrip.time);

  // Phase jour/nuit (voir core/time.js/phaseAt) : dérivée de l'heure, un
  // seul palier de chaque côté — vérifié aux bornes précises (dayStartHour/
  // nightStartHour, config/time-values.js), pas seulement à l'origine.
  const { dayStartHour, nightStartHour } = TIME_CONFIG;
  run("horloge : phase à l'origine (INITIAL_TIME, 8h) = jour", "day", phaseAt(INITIAL_TIME));
  run("horloge : phase juste avant dayStartHour = nuit", "night", phaseAt(dayStartHour * TIME_CONFIG.minutesPerHour - 1));
  run("horloge : phase à dayStartHour pile = jour", "day", phaseAt(dayStartHour * TIME_CONFIG.minutesPerHour));
  run(
    "horloge : phase juste avant nightStartHour = jour",
    "day",
    phaseAt(nightStartHour * TIME_CONFIG.minutesPerHour - 1)
  );
  run("horloge : phase à nightStartHour pile = nuit", "night", phaseAt(nightStartHour * TIME_CONFIG.minutesPerHour));
  run("horloge : phase à minuit = nuit", "night", phaseAt(0));

  // Lien réservé (pas exploité) avec lastVisited : voir travelToWorld
  // ci-dessus ("lastVisited écrit au rangement de A") et core/time.md.
}
