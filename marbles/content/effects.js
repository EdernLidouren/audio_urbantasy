// Formes courtes des clauses d'effet des billes (marbles/content/types/) : une table qui se
// lit mieux, et qui reste de la donnée une fois évaluée. Aucun import, aucune
// logique : la forme d'une clause est décrite dans marbles/content/types/index.js, sa
// validation et son sens dans marbles/core/effects.js.

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
// Un montant calculé s'écrit { base, step, source, max? } (marbles/core/effects.js) :
// speed({ base: 0, step: 1, source: turnsInHand(), max: 5 }).
export const turnsInHand = () => ({ type: "turnsInHand" });

// Source d'un montant calculé : les billes actives de calibre `size` (SMALL, MEDIUM,
// LARGE, marbles/config/values.js). « Vitesse +1 par minibille active » :
// speed({ base: 0, step: 1, source: activeSize(SMALL) }).
export const activeSize = (size) => ({ type: "activeSize", size });

// Source d'un montant calculé : une VALEUR DE PARTIE, par son identifiant
// (marbles/core/counters.js), dans une portée, "turn" (ce tour) ou "game" (cette
// partie). « Vitesse +2 par chiquenaude ce tour » :
// speed({ base: 0, step: 2, source: tally("flick", "turn"), max: 6 }).
export const tally = (id, scope) => ({ type: "tally", tally: id, scope });

// Le nombre de billes d'une zone de la partie, source d'un montant calculé
// (marbles/core/effects.js/GAME_ZONES) : zoneCount("hand"), « par bille en main ».
export const zoneCount = (zone) => ({ type: "zoneCount", zone });

// L'état d'une zone de la partie, une condition (`when`) : zoneIs("triangle",
// "full"), « si le triangle est plein » ; états "empty", "full", "single".
export const zoneIs = (zone, state) => ({ type: "zone", zone, state });

// La première bille de la main, cible d'Empocher et de Défausser
// (marbles/core/effects.js/FIRST_IN_HAND).
export const FIRST_IN_HAND = "firstInHand";

// La dernière bille arrivée à la défausse, cible de Ramasser
// (marbles/core/effects.js/LAST_DISCARDED).
export const LAST_DISCARDED = "lastDiscarded";

// Les CIBLES RELATIVES (marbles/core/effects.js) : l'emplacement suivant, ou
// précédent, de celui d'où la bille agit. Partout où une action accepte un
// emplacement, et dans le `slot` des conditions qui lisent un emplacement :
// speed(2, NEXT_SLOT)… { ...speed(2), target: NEXT_SLOT }.
export const NEXT_SLOT = "nextSlot";
export const PREVIOUS_SLOT = "previousSlot";

// Les `count` prochaines billes du sac, cible de Défausser (marbles/core/effects.js/
// isBag) : nextInBag(1), « la prochaine bille du sac ».
export const nextInBag = (count) => ({ type: "bag", count });

// Une CIBLE AU CHOIX du joueur (marbles/core/effects.js, en-tête) : `zones`, où il
// choisit ("hand", "triangle", "discard") ; `count`, combien (1 par défaut) ; `mode`,
// TOUJOURS donné, "optional" (facultatif : N au plus, aucun permis) ou "required"
// (obligatoire : exactement N) ; `pick`, ce qui se vise sur le triangle ("marble", une
// bille active, par défaut). « Vous pouvez polir une bille active » :
// polish(1, choice({ zones: ["triangle"], mode: "optional" })).
export const choice = ({ zones, count = 1, mode, pick = "marble" }) => ({ type: "choice", zones, pick, count, mode });

// Une cible « TOUTES LES BILLES ACTIVES » (marbles/core/effects.js, en-tête), qui
// passent tous les filtres donnés : allActive(), allActive(sizeIs(SMALL)).
export const allActive = (...filters) => ({ type: "all", ...(filters.length === 0 ? {} : { filters }) });

// Filtre de cible : le calibre (SMALL, MEDIUM, LARGE, marbles/config/values.js).
export const sizeIs = (size) => ({ type: "size", size });

// Éjecter : chasse du triangle la bille elle-même (sans cible, sur le triangle
// seulement), celle d'un emplacement, des billes au choix (choice) ou toutes les
// billes actives filtrées (allActive). Sans montant.
export const eject = (target) => ({ action: "eject", ...(target === undefined ? {} : { target }) });

// Empocher : envoie au pot la bille elle-même (sans cible), celle d'un emplacement,
// la première de la main (FIRST_IN_HAND), ou une bille au choix (choice). Sans
// montant.
export const pocket = (target) => ({ action: "pocket", ...(target === undefined ? {} : { target }) });

// Défausser : envoie à la défausse la bille elle-même (sans cible), celle d'un
// emplacement, la première de la main (FIRST_IN_HAND), des billes au choix
// (choice), toutes les billes actives filtrées (allActive) ou les prochaines billes
// du sac (nextInBag). Sans montant.
export const discard = (target) => ({ action: "discard", ...(target === undefined ? {} : { target }) });

// Rebond : renvoie en main la bille elle-même (sans cible : sur le triangle, ou en
// partance pendant son Final ou son Éjection), celle d'un emplacement, des billes
// actives au choix (choice) ou toutes les billes actives filtrées (allActive). Sans
// montant.
export const bounce = (target) => ({ action: "bounce", ...(target === undefined ? {} : { target }) });

// Ramasser : reprend en main la dernière bille arrivée à la défausse
// (LAST_DISCARDED) ou des billes de la défausse au choix (choice). Toujours une
// cible. Sans montant.
export const retrieve = (target) => ({ action: "retrieve", target });

// APPLIQUER UN STATUT (marbles/content/statuses/) à la partie : `id`, le statut ;
// `intensity`, son intensité (1 par défaut) ; `duration` (facultatif), le nombre de
// tours ou de charges, pour un statut dont la durée se compte seulement (la sorte de
// durée est celle du statut). applyStatus("whiplash"), applyStatus("cushion",
// { intensity: 2 }), applyStatus("cushion", { duration: 1 }).
export const applyStatus = (id, { intensity = 1, duration } = {}) => ({ action: "applyStatus", status: id, amount: intensity, ...(duration === undefined ? {} : { duration }) });
