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
// (config/marbles-values.js/MARBLE_TALLIES). « Vitesse +2 par chiquenaude ce tour » :
// speed({ base: 0, step: 2, source: tally("flicksThisTurn"), max: 6 }).
export const tally = (id) => ({ type: id });
