// Horloge de partie. SOURCE DE VÉRITÉ UNIQUE : session.time, un nombre de
// MINUTES DE JEU écoulées depuis l'origine (jour 1, mois 1, à
// TIME_CONFIG.startHour:00 — voir INITIAL_TIME). Rien d'autre n'est
// stocké : minute/heure/jour/mois/saison/année sont TOUTES dérivées ici,
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

const { minutesPerHour, hoursPerDay, daysPerMonth, monthsPerYear, monthsPerSeason, startHour } = TIME_CONFIG;

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
