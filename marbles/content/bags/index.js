// Registre des SACS PRÉFAITS : id -> sac. Connecteur pur, zéro logique, même patron
// que marbles/content/definitions/index.js. Un sac par fichier, de la donnée pure.
// Fournis par le jeu, en LECTURE SEULE : le joueur s'en sert, il ne les modifie pas.
//
// Le core ne l'importe JAMAIS (CLAUDE.md) : les règles le reçoivent avec les autres
// tables (marbles/core/rules.js/createMarblesRules). Validé au démarrage
// (marbles/core/validation.js/validateMarblesContent, appelé par main.js et par l'audit
// du contenu) : chaque sac bien formé, et VALIDE selon les règles de construction par
// défaut (marbles/config/values.js/BAG_BUILD_RULES).
//
// Un sac (le format complet : en-tête de marbles/core/bags.js) :
//   id       son identifiant, celui de sa clé ici ;
//   marbles  sa composition, [{ marble, count }], chaque bille une fois.
// Pas de nom dans le fichier : il se déduit de l'id, `marbles.bag.<id>.name` (en
// minuscules, data/i18n/<langue>/marbles.json), obligatoire. AJOUTER UN SAC : son
// fichier ici, sa ligne ci-dessous, son nom dans chaque langue.
import starter from "./starter.js";
import treasure from "./treasure.js";
import stars from "./stars.js";
import mist from "./mist.js";
import bestiary from "./bestiary.js";
import blast from "./blast.js";
import classics from "./classics.js";

// Dans l'ordre du menu des sacs (mode debug) : le sac de départ, puis un sac par
// famille, dans l'ordre de la roue, la famille neutre en dernier.
export const PRESET_BAGS = {
  starter,
  treasure,
  stars,
  mist,
  bestiary,
  blast,
  classics,
};

// Le sac que le jeu fournit au lancement depuis le menu principal.
export const STARTER_BAG = "starter";
