// Jeu des billes : la TABLE DE BILLES DES VÉRIFICATIONS, et les réglages de leurs
// parties. Les vérifications des MÉCANISMES (core/checks/marbles*.check.js) jouent
// ces billes-ci, jamais celles du jeu (marbles/content/types/) : les billes du jeu sont en
// phase de design et changent à chaque itération ; une vérification qui passait par
// elles cassait (ou disparaissait du total) dès qu'une valeur bougeait, sans
// qu'aucune règle n'ait changé. Les vraies billes n'ont que leur CONTRAT : elles se
// valident, ont leurs textes et leurs sons, et jouent des parties sans anomalie
// (domaine marbles-content).
//
// FIGÉES : chaque bille est écrite en entier, sans rien lire de la vraie table, son
// usure maximale comprise (jamais MARBLES_SETTINGS.defaultMaxWear). Ne les changer
// que pour vérifier un mécanisme nouveau, en sachant que les attentes chiffrées des
// vérifications en dépendent : mieux vaut AJOUTER une bille. Chacune est nommée
// d'après ce qu'elle a de particulier ; ses autres champs servent de valeurs de
// base aux vérifications (Vitesse, Masse, usure).
//
// Aucune n'a de texte : leurs noms (`marble.<id>.name`) n'existent pas. Les
// vérifications de vue qui les jouent lisent les CLÉS et leurs paramètres
// (marbles-view, marbles-sequence) ; les phrases complètes se vérifient sur
// quelques témoins de la vraie table.

import { activeSize, allActive, choice, crack, draw, eject, mass, pocket, polish, sizeIs, speed, tally, turnsInHand } from "../../content/effects.js";
import { LARGE, MEDIUM, SMALL } from "../../config/values.js";
import { createMarblesRules } from "../../core/rules.js";

// Gèle une table et chacune de ses billes en profondeur : une vérification qui
// modifierait une bille par mégarde lèverait au lieu de fausser les suivantes.
function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

// La table. L'ordre des clés ne sert
// qu'au sac de test (FIXTURE_BAG).
export const FIXTURE_TYPES = deepFreeze({
  // Chiquenaude qui croît avec les tours passés en main ; phases de Vitesse simples.
  aging_flick: {
    base: [speed(1)],
    apex: [speed(4)],
    flick: [speed({ base: 0, step: 1, source: turnsInHand(), max: 5 })],
    hit: [speed(2)],
    maxWear: 3,
    size: MEDIUM,
  },
  // Tic : Polissage d'une bille active au choix ; sa pointe lit une valeur de
  // partie (les Trouvailles de la partie).
  hit_polish: {
    base: [mass(1)],
    apex: [speed({ base: 0, step: 1, source: tally("windfall", "game"), max: 10 })],
    hit: [polish(1, choice({ zones: ["triangle"], mode: "required" }))],
    maxWear: 3,
    size: MEDIUM,
  },
  // Tic : Vitesse si l'éjectée est plus petite, puis Empocher une bille de la main
  // au choix ; Éjection : Vitesse. Un calot sans base.
  hit_pocket: {
    apex: [speed(6)],
    hit: [{ ...speed(4), when: { type: "relativeSize", marble: "ejected", is: "smaller" } }, pocket(choice({ zones: ["hand"], mode: "required" }))],
    knockout: [speed(3)],
    maxWear: 3,
    size: LARGE,
  },
  // Final : Polissage de la pointe, puis s'empoche elle-même depuis la défausse ; En
  // poche, à chaque résolution. Pointe conditionnée au calibre de la base gauche ;
  // Trouvaille.
  final_pocket: {
    base: [mass(1)],
    apex: [mass(1), { ...mass(2), when: { type: "sizeAt", slot: "leftBase", size: LARGE } }],
    hit: [mass(1)],
    windfall: [polish(1)],
    final: [polish(1, "apex"), pocket()],
    pocketed: { resolution: [mass(1)] },
    maxWear: 3,
    size: MEDIUM,
  },
  // Variante de base (la base droite donne de la Masse) ; Tic : Pioche.
  split_base: {
    base: [speed(3)],
    baseVariant: { rightBase: [mass(1)] },
    apex: [speed(3)],
    hit: [draw(1)],
    maxWear: 3,
    size: MEDIUM,
  },
  // Fragile (usure 2) ; Chiquenaude de Masse ; Final : Vitesse, puis Polissage de
  // jusqu'à deux billes actives au choix ; En poche, à l'entrée.
  fragile: {
    base: [speed(2)],
    apex: [speed(5)],
    flick: [mass(1)],
    final: [speed(4), polish(1, choice({ zones: ["triangle"], count: 2, mode: "optional" }))],
    pocketed: { entry: [speed(10)] },
    maxWear: 2,
    size: SMALL,
  },
  // Chiquenaude sur la pointe : l'Éjecte (posée en pointe sur une bille, vide
  // l'emplacement avant d'y arriver) ; pointe négative ; Éjection : Masse.
  flick_strike: {
    base: [mass(2)],
    apex: [speed(-3)],
    flick: [eject("apex")],
    knockout: [mass(1)],
    maxWear: 3,
    size: LARGE,
  },
  // Éveil : Pioche (qui peut en éveiller une autre) ; base : Pioche ; Éjection
  // conditionnée au calibre de la posée ; En poche, à chaque mélange du sac.
  awaken_draw: {
    awaken: [draw(1)],
    base: [draw(1)],
    apex: [speed(2), polish(1)],
    knockout: [{ ...draw(1), when: { type: "relativeSize", marble: "placed", is: "larger" } }],
    pocketed: { shuffles: [polish(1, "apex")] },
    maxWear: 3,
    size: SMALL,
  },
  // Base : Empocher la bille en pointe (sa phase est alors sautée) ; Trouvaille :
  // Fêlure ; En poche, à chaque résolution, selon les minibilles actives.
  base_pocket: {
    base: [pocket("apex")],
    apex: [mass(3)],
    windfall: [crack(1, "rightBase")],
    pocketed: { resolution: [speed({ base: 0, step: 2, source: activeSize(SMALL) })] },
    maxWear: 3,
    size: LARGE,
  },
  // Base qui compte les minibilles actives ; Éjection : Pioche ; En poche, à chaque
  // bille éjectée du triangle. Sans pointe.
  size_count: {
    base: [speed({ base: 0, step: 1, source: activeSize(SMALL) })],
    knockout: [draw(1)],
    pocketed: { ejectedMarbles: [mass(1)] },
    maxWear: 3,
    size: MEDIUM,
  },
  // Beaucoup de déclencheurs : base qui Éjecte une bille active au choix, Éveil,
  // Trouvaille, Final, En poche à chaque Chiquenaude ; usure 4.
  all_rounder: {
    base: [eject(choice({ zones: ["triangle"], mode: "required" }))],
    apex: [speed(-1)],
    awaken: [speed(2)],
    windfall: [speed(3)],
    final: [mass(1)],
    pocketed: { flick: [speed(2)] },
    maxWear: 4,
    size: MEDIUM,
  },
  // Usure 1 : joue puis part dès son premier tour ; Éveil : Polissage de la
  // pointe ; Final : Pioche, puis Éjecter toutes les minibilles actives.
  one_shot: {
    base: [speed(6)],
    apex: [speed(6)],
    awaken: [polish(1, "apex")],
    final: [draw(1), eject(allActive(sizeIs(SMALL)))],
    maxWear: 1,
    size: LARGE,
  },
  // Chiquenaude qui lit une valeur de partie (les Chiquenaudes du tour, la sienne
  // comprise) ; en base gauche, renforce la pointe si elle donne de la Vitesse
  // (cible et condition d'effet imprimé) ; Éjection : Vitesse. Minibille.
  tally_flick: {
    flick: [speed({ base: 0, step: 2, source: tally("flick", "turn"), max: 6 })],
    base: [speed(1)],
    baseVariant: {
      leftBase: [{ ...speed(4), target: "apex", when: { type: "printedStat", slot: "apex", stat: "speed", atLeast: 1 } }],
    },
    apex: [speed(2)],
    knockout: [speed(3)],
    maxWear: 3,
    size: SMALL,
  },
});

// La même table SANS CIBLE AU CHOIX NI ÉJECTER : les vérifications des mécanismes
// qui n'en dépendent pas (Empocher la première bille de la main, Polissage et
// Fêlure ciblés, Final, Trouvaille…) n'ont ainsi aucun choix à trancher. Les ids ne
// changent pas ; seuls ces champs-ci diffèrent, écrits en entier :
//   hit_pocket    Tic : Empocher la PREMIÈRE bille de la main ;
//   hit_polish    Tic : Polissage 1 de la pointe ;
//   fragile       Final : Vitesse seulement ;
//   flick_strike  Chiquenaude : Fêlure 3 de la pointe ;
//   one_shot      Final : Pioche seulement ;
//   tally_flick   aucune Éjection ;
//   all_rounder   base : Vitesse +3.
export const CHOICELESS_TYPES = deepFreeze({
  ...FIXTURE_TYPES,
  hit_pocket: {
    apex: [speed(6)],
    hit: [{ ...speed(4), when: { type: "relativeSize", marble: "ejected", is: "smaller" } }, pocket("firstInHand")],
    knockout: [speed(3)],
    maxWear: 3,
    size: LARGE,
  },
  hit_polish: {
    base: [mass(1)],
    apex: [speed({ base: 0, step: 1, source: tally("windfall", "game"), max: 10 })],
    hit: [polish(1, "apex")],
    maxWear: 3,
    size: MEDIUM,
  },
  fragile: {
    base: [speed(2)],
    apex: [speed(5)],
    flick: [mass(1)],
    final: [speed(4)],
    pocketed: { entry: [speed(10)] },
    maxWear: 2,
    size: SMALL,
  },
  flick_strike: {
    base: [mass(2)],
    apex: [speed(-3)],
    flick: [crack(3, "apex")],
    knockout: [mass(1)],
    maxWear: 3,
    size: LARGE,
  },
  one_shot: {
    base: [speed(6)],
    apex: [speed(6)],
    awaken: [polish(1, "apex")],
    final: [draw(1)],
    maxWear: 1,
    size: LARGE,
  },
  tally_flick: {
    flick: [speed({ base: 0, step: 2, source: tally("flick", "turn"), max: 6 })],
    base: [speed(1)],
    baseVariant: {
      leftBase: [{ ...speed(4), target: "apex", when: { type: "printedStat", slot: "apex", stat: "speed", atLeast: 1 } }],
    },
    apex: [speed(2)],
    maxWear: 3,
    size: SMALL,
  },
  all_rounder: {
    base: [speed(3)],
    apex: [speed(-1)],
    awaken: [speed(2)],
    windfall: [speed(3)],
    final: [mass(1)],
    pocketed: { flick: [speed(2)] },
    maxWear: 4,
    size: MEDIUM,
  },
});

// Le sac de test : un exemplaire de chaque bille, dans l'ordre de la table.
export const FIXTURE_BAG = Object.freeze(Object.keys(FIXTURE_TYPES));

// Les réglages d'une partie de test, ÉCRITS ICI : changer MARBLES_SETTINGS (le
// nombre de tours, la taille de main, la capacité du pot…) ne change aucune
// vérification de mécanisme.
export const FIXTURE_SETTINGS = Object.freeze({
  firstTurnDraw: 5,
  drawPerTurn: 1,
  maxHandSize: 5,
  throwsPerTurn: 5,
  potCapacity: 3,
  turnCount: 10,
});

// La TABLE DES STATUTS DES VÉRIFICATIONS (marbles/core/statuses.js), figée comme les
// billes : chaque statut nommé d'après ce qu'il a de particulier, une sorte de durée,
// un cumul et un comportement chacun, ceux de la vraie table et quelques autres.
// Aucun n'a de texte (leurs noms n'existent pas) : les vérifications de vue lisent
// les CLÉS.
export const FIXTURE_STATUSES = deepFreeze({
  // Lancers +1, le prochain tour, en intensité.
  throws_next: { stacking: "intensity", duration: { kind: "nextTurn" }, behaviors: [{ type: "stat", stat: "throws", amount: 1 }] },
  // Lancers +1, ce tour, en intensité : reçu pendant le tour, il s'ajoute aussitôt.
  throws_now: { stacking: "intensity", duration: { kind: "turn" }, behaviors: [{ type: "stat", stat: "throws", amount: 1 }] },
  // Lancers −1, le prochain tour, en intensité : un statut négatif.
  throws_minus: { stacking: "intensity", duration: { kind: "nextTurn" }, behaviors: [{ type: "stat", stat: "throws", amount: -1 }] },
  // Capacité du pot +1, toute la partie, en intensité.
  pot_game: { stacking: "intensity", duration: { kind: "game" }, behaviors: [{ type: "stat", stat: "potCapacity", amount: 1 }] },
  // Taille de main −2, ce tour, en intensité : vers le plancher.
  hand_shrink: { stacking: "intensity", duration: { kind: "turn" }, behaviors: [{ type: "stat", stat: "handSize", amount: -2 }] },
  // Gains de Vitesse ×2, une charge, en durée.
  gain_charge: { stacking: "duration", duration: { kind: "charges", count: 1 }, behaviors: [{ type: "modifier", point: "speedGain", operation: "multiply", value: 2 }] },
  // Gains de Vitesse +1, deux tours, en durée.
  gain_add: { stacking: "duration", duration: { kind: "turns", count: 2 }, behaviors: [{ type: "modifier", point: "speedGain", operation: "add", value: 1 }] },
  // Pertes de Vitesse −1, trois tours, en intensité.
  loss_cushion: { stacking: "intensity", duration: { kind: "turns", count: 3 }, behaviors: [{ type: "modifier", point: "speedLoss", operation: "add", value: -1 }] },
  // Gains et pertes de Masse ×2, deux charges, en durée : une charge par vrai changement.
  mass_double: {
    stacking: "duration",
    duration: { kind: "charges", count: 2 },
    behaviors: [
      { type: "modifier", point: "massGain", operation: "multiply", value: 2 },
      { type: "modifier", point: "massLoss", operation: "multiply", value: 2 },
    ],
  },
  // Impact ×2, ce tour, unique.
  impact_double: { stacking: "unique", duration: { kind: "turn" }, behaviors: [{ type: "modifier", point: "impact", operation: "multiply", value: 2 }] },
  // Impact −5, toute la partie, en intensité : vers le plancher 0.
  impact_tax: { stacking: "intensity", duration: { kind: "game" }, behaviors: [{ type: "modifier", point: "impact", operation: "add", value: -5 }] },
  // À chaque chiquenaude (le mot-clé) : Vitesse +2 ; deux tours, unique.
  flick_react: { stacking: "unique", duration: { kind: "turns", count: 2 }, behaviors: [{ type: "reaction", on: "flick", effect: [speed(2)] }] },
  // À chaque statut reçu : Vitesse +1 ; toute la partie, unique (jamais à sa propre
  // réception).
  received_react: { stacking: "unique", duration: { kind: "game" }, behaviors: [{ type: "reaction", on: "statusesReceived", effect: [speed(1)] }] },
  // À chaque bille lancée : Masse +1 ; toute la partie, unique.
  throw_react: { stacking: "unique", duration: { kind: "game" }, behaviors: [{ type: "reaction", on: "thrownMarbles", effect: [mass(1)] }] },
});

// Les règles d'une table de test (FIXTURE_TYPES par défaut, ou une table fabriquée),
// et de la table des statuts de test (FIXTURE_STATUSES par défaut), dont chaque
// partie neuve part du sac de test et des réglages de test ; `options` de createGame
// les remplace au cas par cas (un sac vide, une autre capacité…).
export function fixtureRules(types = FIXTURE_TYPES, statuses = FIXTURE_STATUSES) {
  const rules = createMarblesRules(types, statuses);
  return Object.freeze({
    ...rules,
    createGame: (seed, options = {}) => rules.createGame(seed, { bag: FIXTURE_BAG, ...FIXTURE_SETTINGS, ...options }),
  });
}
