// Registre des billes : id -> archétype. Connecteur pur, zéro logique, même patron
// que collections/index.js. Une bille par fichier, de la donnée pure (seuls imports
// permis : les formes courtes des clauses, marbles/effects.js, et les constantes de
// calibre, config/marbles-values.js).
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
//   awaken      l'Éveil : effet joué quand la bille est piochée (du sac à la main),
//               pioche du tour ou effet, juste après sa pioche et avant la suivante ;
//               la bille est alors en main, à 0 tour en main (pas de Polissage ni de
//               Fêlure sur elle-même) ; jamais prévu (la prévision ignore les billes
//               piochées) ;
//   flick       la Chiquenaude : effet joué à chaque pose de la bille depuis la
//               main, sur un emplacement vide ou occupé, avant tout le reste ; la
//               bille, en cours de lancer, n'est ni en main ni sur le triangle (pas
//               de Polissage ni de Fêlure sur elle-même) ;
//   hit         le Tic : effet joué quand la bille est posée sur un emplacement
//               occupé, après l'éjection de l'occupante ;
//   windfall    la Trouvaille : effet joué à chaque régénération du sac depuis la
//               défausse, à tout moment du tour, si la bille est active (sur le
//               triangle), dans l'ordre des phases, avant que la pioche ne reprenne ;
//   knockout    l'Éjection : effet joué quand la bille est remplacée ;
//   final       le Final : effet joué quand la bille est retirée par usure, une fois
//               à la défausse, avant l'Impact du tour ;
//   pocketed    En poche : des effets qui ne jouent que lorsque la bille est dans le
//               POT, un objet { <moment>: effet } (config/marbles-values.js/
//               MARBLE_POCKET) : `entry`, à son entrée au pot ; `resolution`, à chaque
//               résolution, après les phases ; ou l'identifiant d'une valeur de
//               partie écoutable, à chaque incrément (`flick`, `shuffles`,
//               `ejectedMarbles`… : core/marbles.js/REACTION_KEYS). Rien sur la
//               bille elle-même ;
//   maxWear     usure maximale, sinon MARBLES_SETTINGS.defaultMaxWear ;
//   size        son CALIBRE, obligatoire : SMALL, MEDIUM ou LARGE, toujours par ces
//               constantes (config/marbles-values.js), validé au chargement. Statique.
//               Lu par les conditions de calibre, et par le son : le profil sonore
//               et la force des chocs de la bille viennent de lui.
//
// Un effet est une LISTE DE CLAUSES ; une clause (core/marbles-effects.js) :
//   action  ce qu'elle fait : "speed" ou "mass", qui ajoutent `amount` (entier,
//           négatif permis) à la Vitesse ou à la Masse ; "draw", la Pioche, qui
//           pioche `amount` billes (au moins 1, jamais de cible) ; "polish", le
//           Polissage, et "crack", la Fêlure, qui retirent ou ajoutent `amount`
//           d'usure (au moins 1) à la bille elle-même ou à celle de `target` ;
//           "pocket", Empocher, sans montant, qui envoie au pot la bille elle-même,
//           celle de `target`, la première de la main (`target` FIRST_IN_HAND) ou
//           une bille au choix (`target` choice(...)) ;
//           "eject", Éjecter, sans montant, qui chasse du triangle la bille
//           elle-même (si elle y est), celle de `target`, des billes au choix, ou
//           toutes les billes actives filtrées (`target` allActive(sizeIs(SMALL))) ;
//   amount  la valeur : un entier, ou un MONTANT CALCULÉ { base, step, source,
//           max? }, base + step × la valeur de la source, plafonné à max, évalué
//           au déclenchement (sources : turnsInHand(), activeSize(calibre),
//           tally(valeur, portée), marbles/effects.js) ;
//   target  (facultatif) pour une Vitesse ou une Masse, l'emplacement dont elle
//           modifie l'effet de phase, au lieu d'agir sur le compteur du tour (jamais
//           une phase toujours passée, ni dans un Final) ; pour un Polissage ou une
//           Fêlure, l'emplacement dont la bille la reçoit ; ou un CHOIX du joueur,
//           choice({ zones, count, upTo }) (marbles/effects.js ; doc/marbles.md,
//           « Cibles au choix ») : « Polissage 1 à une bille active au choix »,
//           polish(1, choice({ zones: ["triangle"] })) ;
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
import gorilla from "./gorilla.js";
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
  gorilla,
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
