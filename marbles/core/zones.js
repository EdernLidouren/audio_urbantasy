// JEU DES BILLES — LES ZONES, déclarées ici et nulle part ailleurs : le triangle et
// son ordre horaire (SLOTS, nextSlot, previousSlot), les zones de la partie que lisent
// les conditions d'état et les nombres de billes (GAME_ZONES, ZONE_STATES), celles où
// un joueur choisit une cible (CHOICE_ZONES), et celles où peut se trouver la bille
// qui joue un effet (HOLDER_ZONES, NO_REFERENCE_ZONES). De la donnée et des lectures
// pures ; ce qu'en font les règles vit chez elles (marbles/core/effects.js : les
// conditions, les cibles ; marbles/core/choices.js : les cibles d'un choix par zone ;
// marbles/core/path.js : le départ d'une bille par zone).

import { characteristic } from "./statuses.js";

// LES EMPLACEMENTS, dans l'ORDRE HORAIRE, le seul ordre du triangle, déclaré ici
// seulement : base droite, base gauche, pointe, puis de nouveau base droite. Il est
// celui de la résolution (les phases, la pointe en dernier), des retraits par usure,
// des billes actives visées ensemble, des écouteurs du bus, de la prévision et de
// tout ce que l'écran énumère ; la disposition spatiale de l'écran, elle, n'en
// dépend pas. Il définit l'emplacement SUIVANT (nextSlot) et le PRÉCÉDENT
// (previousSlot) : la rotation de fin de tour fait avancer chaque bille vers son
// suivant.
export const SLOTS = Object.freeze(["rightBase", "leftBase", "apex"]);

function slotIndex(slot) {
  const index = SLOTS.indexOf(slot);
  if (index < 0) throw new Error(`marbles : emplacement inconnu "${slot}".`);
  return index;
}

// L'emplacement suivant dans le sens horaire : base droite -> base gauche, base
// gauche -> pointe, pointe -> base droite.
export function nextSlot(slot) {
  return SLOTS[(slotIndex(slot) + 1) % SLOTS.length];
}

// L'emplacement précédent, le sens inverse : base gauche -> base droite, pointe ->
// base gauche, base droite -> pointe.
export function previousSlot(slot) {
  return SLOTS[(slotIndex(slot) + SLOTS.length - 1) % SLOTS.length];
}

// LES ZONES DE LA PARTIE, déclarées ICI ET NULLE PART AILLEURS, pour les conditions
// d'état (`zone`) et les sources de nombre de billes (`zoneCount`). Chacune :
//   count     son nombre de billes dans un état, (state) -> entier ; une bille en
//             transit (en cours de lancer, en partance) n'est dans aucune zone de
//             l'état : elle ne compte nulle part ;
//   capacity  (facultatif) sa capacité EN VIGUEUR, (state, statuses) -> entier : les
//             caractéristiques de la partie (taille de la main, capacité du pot),
//             statuts compris (marbles/core/statuses.js/characteristic) ; une zone
//             au-delà de sa capacité compte pleine ;
//   states    les états qu'une condition peut lui demander (ZONE_STATES).
// AJOUTER une zone ou un état : une entrée ici (et dans ZONE_STATES), ses textes
// (`marbles.condition.zone.<zone>.<état>`, `marbles.effect.per_zone`), rien d'autre.
export const GAME_ZONES = {
  triangle: { count: (state) => SLOTS.filter((slot) => state.triangle[slot] !== null).length, capacity: () => SLOTS.length, states: ["full", "empty", "single"] },
  hand: { count: (state) => state.hand.length, capacity: (state, statuses) => characteristic(state, "handSize", statuses), states: ["empty", "full"] },
  bag: { count: (state) => state.bag.length, states: ["empty"] },
  discard: { count: (state) => state.discard.length, states: ["empty"] },
  pot: { count: (state) => state.pot.length, capacity: (state, statuses) => characteristic(state, "potCapacity", statuses), states: ["full", "empty"] },
  lost: { count: (state) => state.lost.length, states: [] },
};

// Les ÉTATS d'une zone qu'une condition peut lire : `test(count, capacity)` ;
// `needsCapacity`, l'état n'a de sens que pour une zone qui a une capacité.
export const ZONE_STATES = {
  empty: { test: (count) => count === 0 },
  single: { test: (count) => count === 1 },
  full: { needsCapacity: true, test: (count, capacity) => count >= capacity },
};
for (const [id, zone] of Object.entries(GAME_ZONES)) {
  for (const state of zone.states) {
    if (!Object.hasOwn(ZONE_STATES, state)) throw new Error(`marbles : la zone "${id}" demande un état inconnu "${state}".`);
    if (ZONE_STATES[state].needsCapacity && zone.capacity === undefined) throw new Error(`marbles : l'état "${state}" demande une capacité, que la zone "${id}" n'a pas.`);
  }
}

// Les ZONES où un joueur peut choisir une cible, déclarées ici et nulle part
// ailleurs : `available`, le choix y est possible aujourd'hui (les cibles de chaque
// zone disponible : marbles/core/choices.js/CHOICE_TARGETS) ; `picks`, ce qui s'y choisit.
// Ajouter le pot ou le sac : `available` à vrai, ses cibles dans le core, ses textes
// dans la vue.
export const CHOICE_ZONES = {
  hand: { available: true, picks: ["marble"] },
  triangle: { available: true, picks: ["marble", "slot"] },
  pot: { available: false, picks: ["marble"] },
  // La défausse, dans l'ordre d'arrivée (Ramasser).
  discard: { available: true, picks: ["marble"] },
  bag: { available: false, picks: ["marble"] },
};

// OÙ EST LA BILLE ELLE-MÊME quand son effet joue : sa ZONE, selon la valeur `marble`
// de son déclencheur (marbles/config/values.js/MARBLE_TRIGGERS ; "pot" pour un moment
// En poche ; une phase, qui n'en a pas, est sur le triangle comme "onSlot"). C'est la
// `zone` de holder (la situation, en-tête) et des écouteurs (marbles/core/run.js) ;
// `where` dit à la validation pourquoi une action ne l'y prend pas (targetProblem).
// Chaque valeur `marble` d'un déclencheur y a son entrée (vérifié au chargement,
// marbles/core/run.js).
export const HOLDER_ZONES = {
  onSlot: { zone: "triangle", where: "elle est sur le triangle" },
  drawn: { zone: "hand", where: "elle vient d'être piochée, en main (son Éveil)" },
  thrown: { zone: "thrown", where: "elle est en cours de lancer (sa Chiquenaude)" },
  leaving: { zone: "leaving", where: "elle est en partance (son Final, son Éjection)" },
  dropped: { zone: "discard", where: "elle vient d'arriver à la défausse (sa Chute)" },
  pot: { zone: "pot", where: "elle est dans le pot" },
  // Un STATUT qui réagit (marbles/core/statuses.js) : aucune bille ne joue l'effet.
  status: { zone: "status", where: "c'est un statut, sans bille" },
};

// Les zones de la bille qui joue un effet où elle n'a JAMAIS d'emplacement de
// référence (HOLDER_ZONES) : en main (l'Éveil), dans le pot, et un statut.
export const NO_REFERENCE_ZONES = ["hand", "pot", "status"];
