// Registre des DÉFINITIONS DE PARTIE : id -> définition. Connecteur pur, zéro logique,
// même patron que marbles/content/statuses/index.js. Une définition par fichier, de la
// donnée pure (seuls imports permis : les réglages, marbles/config/values.js, pour
// reprendre les valeurs de la partie par défaut).
//
// Le core ne l'importe JAMAIS (CLAUDE.md) : les règles le reçoivent avec les tables des
// billes et des statuts (marbles/core/rules.js/createMarblesRules). Validé au démarrage
// (marbles/core/validation.js/validateMarblesContent, appelé par main.js et par l'audit
// du contenu).
//
// Une définition (le modèle complet : en-tête de marbles/core/definitions.js) :
//   id     son identifiant, celui de sa clé ici (elle le porte : l'état en garde une
//          copie, qui doit se nommer) ;
//   start  ses valeurs de départ : firstTurnDraw, drawPerTurn, handSize, throws,
//          potCapacity ;
//   bag    la source de son sac : { kind: "player", buildRules? }, { kind: "preset",
//          bag } ou { kind: "random", size, maxCopies } ;
//   turns  son nombre de tours ;
//   goal   son objectif, { kind, ... } ;
//   rules  ses règles, une liste (vide : aucune).
//
// Ses textes découlent de son id : `marbles.definition.<id>.name` (en minuscules) et
// `marbles.definition.<id>.description` (data/i18n/<langue>/marbles.json),
// obligatoires. AJOUTER UNE DÉFINITION : son fichier ici, sa ligne ci-dessous, ses
// deux textes dans chaque langue.
import free from "./free.js";
// Les définitions de TEST, provisoires : un défi par objectif, et une partie libre par
// règle.
import target from "./target.js";
import endurance from "./endurance.js";
import gravel from "./gravel.js";
import narrowGround from "./narrowGround.js";
import potless from "./potless.js";
import silence from "./silence.js";

export const GAME_DEFINITIONS = {
  free,
  target,
  endurance,
  gravel,
  narrowGround,
  potless,
  silence,
};

// La définition que lance le jeu.
export const DEFAULT_DEFINITION = "free";
