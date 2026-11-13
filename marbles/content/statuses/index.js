// Registre des STATUTS : id -> définition. Connecteur pur, zéro logique, même patron
// que marbles/content/types/index.js. Un statut par fichier, de la donnée pure (seuls
// imports permis : les formes courtes des clauses, marbles/content/effects.js, pour
// les effets des réactions).
//
// Le core ne l'importe JAMAIS (CLAUDE.md) : les règles le reçoivent avec la table des
// billes (marbles/core/rules.js/createMarblesRules). Validé au démarrage
// (marbles/core/validation.js/validateMarblesContent, appelé par main.js et par l'audit
// du contenu).
//
// Un statut (le modèle complet : en-tête de marbles/core/statuses.js) :
//   stacking   son CUMUL quand il est appliqué alors qu'il est déjà là :
//              "intensity" (l'intensité s'ajoute), "duration" (la durée s'ajoute),
//              "unique" (sans effet) ;
//   duration   { kind, count? } : "turn" (ce tour), "turns" (`count` tours, celui en
//              cours compris), "nextTurn" (le prochain tour), "game" (toute la
//              partie), "charges" (`count` charges) ;
//   behaviors  ses COMPORTEMENTS, une liste non vide :
//              { type: "stat", stat, amount } : une caractéristique ("throws", les
//                lancers ; "handSize", la taille de la main ; "potCapacity", la
//                capacité du pot) augmentée de `amount` par intensité (négatif
//                permis) ;
//              { type: "modifier", point, operation, value } : un modificateur de
//                valeur ("speedGain", "speedLoss", "massGain", "massLoss", "impact",
//                "turnDraw", "effectDraw", "polish", "crack", "phaseWear" : la liste
//                de marbles/core/statuses.js/MODIFIER_POINTS ; "add" ou "multiply") ;
//              { type: "reaction", on, effect } : un effet (une liste de clauses)
//                joué à chaque incrément de la valeur de partie écoutable `on` ;
//              { type: "lock", lock, trigger? } : un VERROU ("swap", l'échange ;
//                "replacement", la pose sur un emplacement occupé ; "trigger", le
//                mot-clé `trigger` ; "pot", les billes du pot : marbles/core/statuses.js/
//                LOCKS).
// Un modificateur peut porter `filters`, des filtres sur la bille SOURCE de la valeur
// (ceux des cibles : { type: "size", size }), et multiplier par une fraction (0,5).
// Une RÈGLE de partie (marbles/content/definitions/) est un statut de cette table, de
// durée « game ».
//
// Ses textes découlent de son id : `marbles.status.<id>.name` (en minuscules) et
// `marbles.status.<id>.description` (data/i18n/<langue>/marbles.json), obligatoires.
// AJOUTER UN STATUT : son fichier ici, sa ligne ci-dessous, ses deux textes dans
// chaque langue ; une bille le donne par applyStatus(id) (marbles/content/effects.js).
import extraThrow from "./extraThrow.js";
import deepPocket from "./deepPocket.js";
import whiplash from "./whiplash.js";
import cushion from "./cushion.js";
import fervor from "./fervor.js";
import doubleStrike from "./doubleStrike.js";
import fatigue from "./fatigue.js";
import quickHand from "./quickHand.js";
import inspiration from "./inspiration.js";
import luster from "./luster.js";
import brittleness from "./brittleness.js";
import respite from "./respite.js";
import acceleratedWear from "./acceleratedWear.js";
// Les statuts des RÈGLES de partie (marbles/content/definitions/), de durée « toute la
// partie » ; réutilisables d'une définition à l'autre.
import gravel from "./gravel.js";
import oneThrowLess from "./oneThrowLess.js";
import noSwap from "./noSwap.js";
import inertPot from "./inertPot.js";
import silence from "./silence.js";

export default {
  extraThrow,
  deepPocket,
  whiplash,
  cushion,
  fervor,
  doubleStrike,
  fatigue,
  quickHand,
  inspiration,
  luster,
  brittleness,
  respite,
  acceleratedWear,
  gravel,
  oneThrowLess,
  noSwap,
  inertPot,
  silence,
};
