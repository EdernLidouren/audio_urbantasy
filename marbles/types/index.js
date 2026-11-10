// Registre des billes : id -> archétype. Connecteur pur, zéro logique, même patron
// que collections/index.js. Une bille par fichier, de la donnée pure (seul import
// permis : les formes courtes des clauses, marbles/effects.js).
//
// Le core ne l'importe JAMAIS (CLAUDE.md) : la vue, les outils et les vérifications
// le lui passent en paramètre (`types`). Validé au démarrage
// (core/marbles.js/validateMarblesContent, appelé par main.js et par l'audit du
// contenu). L'ordre des clés est celui de la table : les outils de simulation en
// tirent leurs sacs aléatoires, le changer change leurs résultats.
//
// Une bille, chaque champ d'effet étant facultatif (absent : aucun effet) :
//   base        effet joué sur une base ;
//   baseVariant effet propre à UNE base, { leftBase?, rightBase? }, qui
//               remplace `base` sur cette base seulement ;
//   apex        effet joué sur la pointe ;
//   hit         le Tic : effet joué quand la bille est posée sur un emplacement
//               occupé, après l'éjection de l'occupante ;
//   knockout    l'Éjection : effet joué quand la bille est remplacée ;
//   final       le Final : effet joué quand la bille est retirée par usure, une fois
//               à la défausse, avant l'Impact du tour ;
//   maxWear     usure maximale, sinon MARBLES_SETTINGS.defaultMaxWear ;
//   size        sa taille, une clé de MARBLE_SIZES (config/marbles-values.js) : ce
//               qu'EST la bille. Règle la force de ses collisions ;
//   sound       son profil sonore, une clé de MARBLE_SOUND_PROFILES
//               (config/marbles-values.js) : ce qu'on ENTEND. Jamais déduit de la
//               taille, ni l'inverse : une grosse bille peut porter le son d'une
//               moyenne si c'est ce qui sonne juste.
// `size` et `sound` sont de la présentation, obligatoires : la simulation les
// accepte sans jamais les lire ; la vue les valide au chargement
// (view/marbles/sounds.js).
//
// Un effet est une LISTE DE CLAUSES ; une clause (core/marbles-effects.js) :
//   action  ce qu'elle fait : "speed" ou "mass", qui ajoutent `amount` (entier,
//           négatif permis) à la Vitesse ou à la Masse ; "draw", la Pioche, qui
//           pioche `amount` billes (au moins 1, jamais de cible) ; "polish", le
//           Polissage, et "crack", la Fêlure, qui retirent ou ajoutent `amount`
//           d'usure (au moins 1) à la bille elle-même ou à celle de `target` ;
//   amount  la valeur ;
//   target  (facultatif) pour une Vitesse ou une Masse, l'emplacement dont elle
//           modifie l'effet de phase, au lieu d'agir sur le compteur du tour (jamais
//           une phase toujours passée, ni dans un Final) ; pour un Polissage ou une
//           Fêlure, l'emplacement dont la bille la reçoit ;
//   when    (facultatif) sa condition, évaluée au déclenchement. Une condition
//           lit toujours l'effet IMPRIMÉ d'une bille, jamais un effet déjà
//           modifié : aucune dépendance circulaire n'est possible.
//
// Le nom d'une bille se déduit de son id : `marble.<id>.name`
// (data/i18n/<langue>/marbles.json), vérifié par les vérifications
// (domaine marbles-view). AJOUTER UNE BILLE : son fichier ici, sa ligne
// ci-dessous, son nom dans chaque langue, et sa place dans
// config/marbles-values.js/STARTING_BAG pour la mettre en jeu.
import clay from "./clay.js";
import glass from "./glass.js";
import shooter from "./shooter.js";
import agate from "./agate.js";
import cats_eye from "./cats_eye.js";
import porcelain from "./porcelain.js";
import leaded from "./leaded.js";
import mica from "./mica.js";
import sulphide from "./sulphide.js";
import stoneware from "./stoneware.js";
import tiger from "./tiger.js";
import giant from "./giant.js";
import magnifier from "./magnifier.js";

export default {
  clay,
  glass,
  shooter,
  agate,
  cats_eye,
  porcelain,
  leaded,
  mica,
  sulphide,
  stoneware,
  tiger,
  giant,
  magnifier,
};
