// Formes courtes des clauses d'effet des billes (marbles/types/) : une table qui se
// lit mieux, et qui reste de la donnée une fois évaluée. Aucun import, aucune
// logique : la forme d'une clause est décrite dans marbles/types/index.js, sa
// validation et son sens dans core/marbles-effects.js.

// Ajoute `amount` à la Vitesse.
export const speed = (amount) => ({ action: "speed", amount });

// Ajoute `amount` à la Masse.
export const mass = (amount) => ({ action: "mass", amount });

// Pioche `amount` billes.
export const draw = (amount) => ({ action: "draw", amount });

// Polissage : retire `amount` d'usure, à la bille elle-même ou à celle de `target`.
export const polish = (amount, target) => ({ action: "polish", amount, ...(target === undefined ? {} : { target }) });

// Fêlure : ajoute `amount` d'usure, à la bille elle-même ou à celle de `target`.
export const crack = (amount, target) => ({ action: "crack", amount, ...(target === undefined ? {} : { target }) });

// Source d'un montant calculé : les tours passés en main par la bille elle-même.
// Un montant calculé s'écrit { base, step, source, max? } (core/marbles-effects.js) :
// speed({ base: 0, step: 1, source: turnsInHand(), max: 5 }).
export const turnsInHand = () => ({ type: "turnsInHand" });

// Source d'un montant calculé : les billes actives de calibre `size` (SMALL, MEDIUM,
// LARGE, config/marbles-values.js). « Vitesse +1 par minibille active » :
// speed({ base: 0, step: 1, source: activeSize(SMALL) }).
export const activeSize = (size) => ({ type: "activeSize", size });

// Source d'un montant calculé : une VALEUR DE PARTIE, par son identifiant
// (core/marbles-counters.js), dans une portée, "turn" (ce tour) ou "game" (cette
// partie). « Vitesse +2 par chiquenaude ce tour » :
// speed({ base: 0, step: 2, source: tally("flick", "turn"), max: 6 }).
export const tally = (id, scope) => ({ type: "tally", tally: id, scope });

// La première bille de la main, cible d'Empocher (core/marbles-effects.js/
// FIRST_IN_HAND).
export const FIRST_IN_HAND = "firstInHand";

// Une CIBLE AU CHOIX du joueur (core/marbles-effects.js, en-tête) : `zones`, où il
// choisit ("hand", "triangle") ; `count`, combien (1 par défaut) ; `upTo`, « jusqu'à
// N », moins permis ; `pick`, ce qui se vise sur le triangle ("marble", une bille
// active, par défaut). « Polissage 1 à une bille active au choix » :
// polish(1, choice({ zones: ["triangle"] })).
export const choice = ({ zones, count = 1, upTo = false, pick = "marble" }) => ({ type: "choice", zones, pick, count, ...(upTo ? { upTo: true } : {}) });

// Une cible « TOUTES LES BILLES ACTIVES » (core/marbles-effects.js, en-tête), qui
// passent tous les filtres donnés : allActive(), allActive(sizeIs(SMALL)).
export const allActive = (...filters) => ({ type: "all", ...(filters.length === 0 ? {} : { filters }) });

// Filtre de cible : le calibre (SMALL, MEDIUM, LARGE, config/marbles-values.js).
export const sizeIs = (size) => ({ type: "size", size });

// Éjecter : chasse du triangle la bille elle-même (sans cible, sur le triangle
// seulement), celle d'un emplacement, des billes au choix (choice) ou toutes les
// billes actives filtrées (allActive). Sans montant.
export const eject = (target) => ({ action: "eject", ...(target === undefined ? {} : { target }) });

// Empocher : envoie au pot la bille elle-même (sans cible), celle d'un emplacement,
// la première de la main (FIRST_IN_HAND), ou une bille au choix (choice). Sans
// montant.
export const pocket = (target) => ({ action: "pocket", ...(target === undefined ? {} : { target }) });
