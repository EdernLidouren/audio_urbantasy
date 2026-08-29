// Horloge de partie. SOURCE DE VÉRITÉ UNIQUE : session.time, un nombre de
// MINUTES DE JEU écoulées depuis l'origine (jour 1, mois 1, à
// TIME_CONFIG.startHour:00 — voir INITIAL_TIME). Rien d'autre n'est
// stocké : minute/heure/jour/mois/semaine/saison/année sont TOUTES dérivées ici,
// par division entière sur ce seul compteur — jamais une seconde exposée
// (granularité = la minute de jeu, voir CLAUDE.md).
//
// Calendrier SIMPLIFIÉ (voir config/time-values.js) : 12 mois égaux de 30
// jours, 4 saisons de 3 mois, pas de bissextile — un calendrier DE JEU,
// pas une reconstitution du grégorien.
//
// advanceTime NE LIT JAMAIS L'HORLOGE RÉELLE : le delta (déjà converti en
// minutes de jeu) est mesuré au BORD et injecté tel quel (voir
// lib/loop.js, view/city-screen.js) — même delta injecté -> même compteur
// résultant, le déterminisme du core (CLAUDE.md) s'étend donc au temps.
// Rien ne CONSOMME encore ce compteur ailleurs dans le jeu (pas de
// jour/nuit, pas d'événements) : voir core/time.md pour la portée exacte
// et les chantiers réservés.

import { TIME_CONFIG } from "../config/time-values.js";

const { minutesPerHour, hoursPerDay, daysPerMonth, monthsPerYear, monthsPerSeason, startHour, weekdayOrigin } =
  TIME_CONFIG;

const MINUTES_PER_DAY = minutesPerHour * hoursPerDay;
const MINUTES_PER_MONTH = MINUTES_PER_DAY * daysPerMonth;
const MINUTES_PER_YEAR = MINUTES_PER_MONTH * monthsPerYear;

// Compteur de départ d'une partie neuve : jour 1, mois 1 (donc saison 0,
// voir SEASON_KEYS), à startHour:00. Seul appelant : core/state.js/
// createInitialState.
export const INITIAL_TIME = startHour * minutesPerHour;

// Clés i18n des saisons, dans l'ORDRE où elles reviennent — l'index est
// EXACTEMENT la valeur renvoyée par seasonOfYear ci-dessous. La première
// (index 0) est aussi la saison de départ d'une partie neuve (INITIAL_TIME
// tombe toujours en mois 1, donc saison 0).
export const SEASON_KEYS = ["time.season.spring", "time.season.summer", "time.season.autumn", "time.season.winter"];

// Clés i18n des mois grégoriens, dans l'ORDRE de monthOfYear ci-dessous
// (index 0 = mois 1). Les mois GARDENT leurs noms grégoriens même si le
// calendrier de jeu simplifié les fait tous durer 30 jours — cohérent avec
// le choix assumé de ce calendrier (voir header), pas une reconstitution
// du grégorien, juste ses NOMS.
export const MONTH_KEYS = [
  "month.1",
  "month.2",
  "month.3",
  "month.4",
  "month.5",
  "month.6",
  "month.7",
  "month.8",
  "month.9",
  "month.10",
  "month.11",
  "month.12",
];

// Clés i18n des jours de semaine, dans l'ORDRE de weekdayOf ci-dessous
// (index 0 = premier jour du cycle, voir weekdayOrigin).
export const WEEKDAY_KEYS = ["weekday.0", "weekday.1", "weekday.2", "weekday.3", "weekday.4", "weekday.5", "weekday.6"];

// Minutes de jeu écoulées, tronquées à la minute entière — seul endroit où
// la fraction de session.time (accumulée par advanceTime, voir plus bas)
// est ignorée : chaque dérivation en a besoin, jamais exposée telle quelle.
function wholeMinutes(time) {
  return Math.floor(time);
}

// Minute affichée dans l'heure courante (0-59).
export function minuteOfHour(time) {
  return wholeMinutes(time) % minutesPerHour;
}

// Heure affichée dans le jour courant (0-23).
export function hourOfDay(time) {
  return Math.floor(wholeMinutes(time) / minutesPerHour) % hoursPerDay;
}

// Jour dans le mois courant, 1-indexé (1 à daysPerMonth).
export function dayOfMonth(time) {
  return (Math.floor(wholeMinutes(time) / MINUTES_PER_DAY) % daysPerMonth) + 1;
}

// Mois dans l'année courante, 1-indexé (1 à monthsPerYear).
export function monthOfYear(time) {
  return (Math.floor(wholeMinutes(time) / MINUTES_PER_MONTH) % monthsPerYear) + 1;
}

// Saison courante : index dans SEASON_KEYS, dérivé du mois — jamais
// stockée séparément, un mois appartient TOUJOURS à exactement une saison
// (monthsPerSeason mois consécutifs par saison).
export function seasonOfYear(time) {
  return Math.floor((monthOfYear(time) - 1) / monthsPerSeason);
}

// Année de partie, 1-indexée (année 1 dès la création, voir INITIAL_TIME).
export function yearNumber(time) {
  return Math.floor(wholeMinutes(time) / MINUTES_PER_YEAR) + 1;
}

// Jour de semaine, dérivation PURE — index dans WEEKDAY_KEYS (0-6). Jours
// ÉCOULÉS depuis l'origine (partie entière du compteur / MINUTES_PER_DAY —
// le jour 1 vaut 0 jour écoulé), MODULO 7, décalé par weekdayOrigin
// (config/time-values.js : jour de semaine du jour 1). PAS un découpage en
// 52 semaines calées sur l'année : un cycle de 7 qui tourne en continu sur
// le compteur unique, jamais réaligné aux frontières de mois/année.
// Conséquence ASSUMÉE : l'année de jeu fait 360 jours, non multiple de 7 —
// le jour de semaine du jour 1 dérive donc d'une année sur l'autre (année 2
// ne commence pas forcément le même jour de semaine que l'année 1). Sans
// conséquence tant qu'aucun gameplay ne se cale sur un jour de semaine
// précis ; ne pas chercher à corriger, ce n'est pas un bug.
export function weekdayOf(time) {
  const daysElapsed = Math.floor(wholeMinutes(time) / MINUTES_PER_DAY);
  return (daysElapsed + weekdayOrigin) % 7;
}

// Phase jour/nuit courante, dérivée de l'heure — comme les autres
// dérivations ci-dessus, jamais stockée séparément. Un seul palier de
// chaque côté (voir config/time-values.js/dayStartHour, nightStartHour) :
// PAS de troisième état (aube/crépuscule) pour l'instant — la valeur de
// retour est un TYPE FERMÉ à deux cas ("day" | "night"), volontairement,
// pour que tout consommateur (ex. view/audio/city-scene.js) exhaustif sur
// ces deux cas n'ait rien à changer le jour où une phase intermédiaire
// s'ajoutera ; ce jour-là, étendre cette fonction ET ses appelants,
// jamais glisser un troisième cas en silence dans l'un des deux existants.
export function phaseAt(time) {
  const hour = hourOfDay(time);
  return hour >= TIME_CONFIG.dayStartHour && hour < TIME_CONFIG.nightStartHour ? "day" : "night";
}

// SEUL point d'avancement du compteur — pur, ne lit jamais l'horloge
// réelle : `minutes` (déjà en MINUTES DE JEU, converties au bord depuis un
// delta réel, voir view/city-screen.js) s'ajoute tel quel à session.time.
// Fractionnaire accepté et CONSERVÉ (pas arrondi ici) : un frame réel de
// quelques dizaines de ms ne vaut souvent qu'une fraction de minute de jeu
// — arrondir à chaque appel perdrait ce résidu et ferait dériver l'horloge
// sur la durée ; seules les fonctions de dérivation ci-dessus tronquent,
// jamais le compteur lui-même.
export function advanceTime(session, minutes) {
  return { ...session, time: session.time + minutes };
}
