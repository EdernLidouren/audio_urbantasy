// Constantes du calendrier de jeu + facteur d'accélération temporelle.
// Donnée pure, ZÉRO import — même patron que config/tuning-values.js : le
// core (core/time.js) la lit directement, jamais une logique ni un
// registre de contenu.
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
};
