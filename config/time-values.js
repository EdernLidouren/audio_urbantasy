// Constantes du calendrier de jeu + facteur d'accélération temporelle.
// Donnée pure, ZÉRO import — même patron que config/tuning-values.js : le
// core (core/time.js) la lit directement, jamais une logique ni un
// registre de contenu. Exception UNIQUE, en bas de fichier : timeScale
// porte un point d'écriture contrôlé (setTimeScale/resetTimeScale), pour le
// menu debug du temps — le core ne les appelle jamais, il ne fait que lire
// TIME_CONFIG comme le reste.
//
// Calendrier SIMPLIFIÉ, pas une reconstitution du grégorien : 12 mois de
// longueur ÉGALE (30 jours), 4 saisons de 3 mois, pas de bissextile —
// choisi pour que toute dérivation (core/time.js) reste une division
// entière, jamais une table de longueurs de mois irrégulière ni une règle
// bissextile à maintenir.
export const TIME_CONFIG = {
  minutesPerHour: 60,
  hoursPerDay: 24,
  daysPerMonth: 30,
  monthsPerYear: 12,
  monthsPerSeason: 3, // 12 mois / 4 saisons

  // Heure de départ d'une partie neuve (toujours jour 1, mois 1 — le
  // calendrier commence toujours là, voir core/time.js/INITIAL_TIME).
  startHour: 8,

  // Minutes de jeu par seconde réelle. 60 -> 1 s réelle = 1 min de jeu ->
  // une journée de jeu (24 h) dure 24 minutes réelles. Modifiable ici sans
  // toucher à la logique qui la consomme (voir view/city-screen.js).
  timeScale: 60,

  // Plages jour/nuit (voir core/time.js/phaseAt) : jour = [dayStartHour,
  // nightStartHour), nuit le reste (traverse minuit sans cas particulier —
  // toute heure hors [dayStartHour, nightStartHour) est nuit). Un seul
  // palier de chaque côté pour l'instant (pas d'aube/crépuscule) — extensible
  // plus tard à d'autres phases sans changer cette table, juste sa lecture.
  dayStartHour: 8,
  nightStartHour: 20,

  // Jour de semaine du jour 1 d'une partie neuve — index dans
  // weekday.0..weekday.6 (i18n/*.js, voir core/time.js/weekdayOf). 0 = le
  // premier de WEEKDAY_KEYS (lundi en fr). Choix ARBITRAIRE (aucun
  // calendrier réel à faire correspondre) : fixé ici pour que weekdayOf
  // reste une dérivation PURE du compteur, jamais une valeur stockée à
  // part.
  weekdayOrigin: 0,
};

// Valeur de RÉFÉRENCE de timeScale, capturée une fois à l'import — permet à
// resetTimeScale ci-dessous de restaurer EXACTEMENT la valeur normale, et à
// tout appelant (menu debug du temps, voir view/menus/debug-time-menu.js) de
// calculer un multiplicateur à annoncer, sans dupliquer "60" en dur ailleurs.
export const DEFAULT_TIME_SCALE = TIME_CONFIG.timeScale;

// Ajuste TEMPORAIREMENT timeScale — SEUL point d'écriture de ce champ hors
// configuration initiale (l'unique exception à "donnée pure" du header),
// réservé au menu debug du temps (Shift+T, MODE DEBUG UNIQUEMENT) : accélère
// l'écoulement pour OBSERVER une transition (crossfade jour/nuit, météo) au
// lieu de la sauter avec advanceTime. Relu à CHAQUE frame par
// view/game-clock.js/onFrame : un changement ici prend donc effet
// IMMÉDIATEMENT, aucun code de synchro. `value` non positif ignoré — ce
// réglage ne doit jamais figer ou inverser l'écoulement, seulement son
// rythme.
export function setTimeScale(value) {
  if (typeof value !== "number" || !(value > 0)) return;
  TIME_CONFIG.timeScale = value;
}

// Restaure la valeur normale — voir setTimeScale ci-dessus.
export function resetTimeScale() {
  TIME_CONFIG.timeScale = DEFAULT_TIME_SCALE;
}
