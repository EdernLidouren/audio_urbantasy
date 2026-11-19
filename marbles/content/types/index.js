// Registre des billes : id -> archétype. Connecteur pur, zéro logique, même patron
// que collections/index.js. Une bille par fichier, de la donnée pure (seuls imports
// permis : les formes courtes des clauses, marbles/content/effects.js, et les constantes de
// calibre, marbles/config/values.js).
//
// Le core ne l'importe JAMAIS (CLAUDE.md) : la vue, les outils et les vérifications
// le lui passent en paramètre (`types`). Validé au démarrage
// (marbles/core/validation.js/validateMarblesContent, appelé par main.js et par l'audit du
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
//               triangle), dans l'ordre horaire, avant que la pioche ne reprenne ;
//   knockout    l'Éjection : effet joué quand la bille est chassée du triangle, par
//               une pose (remplacée) ou par l'action Éjecter ;
//   final       le Final : effet joué quand la bille est retirée par usure, en
//               partance (pas encore à la défausse), avant l'Impact du tour ;
//   drop        la Chute : effet joué quand la bille arrive à la défausse, d'où
//               qu'elle vienne, jamais si une redirection l'envoie ailleurs ;
//   pocketed    En poche : des effets qui ne jouent que lorsque la bille est dans le
//               POT, un objet { <moment>: effet } (marbles/config/values.js/
//               MARBLE_POCKET) : `entry`, à son entrée au pot ; `resolution`, à chaque
//               résolution, après les phases ; ou l'identifiant d'une valeur de
//               partie écoutable, à chaque incrément (`flick`, `shuffles`,
//               `ejectedMarbles`… : marbles/core/content.js/REACTION_KEYS). Rien sur la
//               bille elle-même ;
//   maxWear     usure maximale, sinon MARBLES_SETTINGS.defaultMaxWear ;
//   families    ses FAMILLES, obligatoires : une liste d'au moins une famille de
//               marbles/config/values.js/MARBLE_FAMILIES, chacune une fois ;
//               plusieurs pour une bille bicolore. Statiques. Lues par les filtres,
//               les conditions de famille et les sources de montant, et dites dans
//               son annonce (touche F) ;
//   rarity      sa RARETÉ, obligatoire : une de MARBLE_RARITIES. Statique. Lue par
//               les filtres et les conditions de rareté, dite dans son annonce ;
//   size        son CALIBRE, obligatoire : SMALL, MEDIUM ou LARGE, toujours par ces
//               constantes (marbles/config/values.js), validé au chargement. Statique.
//               Lu par les conditions de calibre, et par le son : le profil sonore
//               et la force des chocs de la bille viennent de lui ;
//   beacon      (facultatif) sa BALISE propre, la voix de la bille à la pioche et
//               sous le curseur : une clé du manifeste audio (assets/manifest.json),
//               un pool dont une variante numérotée se tire au hasard, ou un
//               fichier ; absente, la balise de son calibre
//               (marbles/config/values.js/MARBLE_SOUND_PROFILES). Vérifiée par
//               l'audit du contenu ; la simulation ne la lit jamais.
//
// Un effet est une LISTE DE CLAUSES ; une clause (marbles/core/effects.js, CLAUSE_ACTIONS
// pour la liste des actions et ce que chacune accepte ; les formes courtes, une par
// action : marbles/content/effects.js) :
//   action  ce qu'elle fait : une VALEUR (Vitesse, Masse, Pioche), une action SUR
//           UNE BILLE (Polissage, Fêlure, Empocher, Éjecter, Défausser, Rebond,
//           Ramasser), ou Appliquer un statut (marbles/content/statuses/) ;
//   amount  la valeur : un entier, ou un MONTANT CALCULÉ { base, step, source,
//           max? }, base + step × la valeur de la source, plafonné à max, évalué
//           au déclenchement (sources : turnsInHand(), tally(valeur, portée),
//           zoneCount(zone, filtre?), familyCount()) ;
//   target  (facultatif) un emplacement ; une cible relative (NEXT_SLOT,
//           PREVIOUS_SLOT) ; un CHOIX du joueur, choice({ zones, count, mode }) ;
//           « toutes les billes actives », allActive(...filtres) ; et ce que
//           l'action déclare de plus (la première de la main, la dernière arrivée à
//           la défausse, les prochaines du sac). Pour une Vitesse ou une Masse, un
//           emplacement donne un bonus à sa phase (jamais une phase toujours passée,
//           ni dans un Final) ;
//   when    (facultatif) sa condition, évaluée au déclenchement (calibre, famille,
//           rareté ou bille précise d'un emplacement, emplacement vide ou occupé,
//           calibre d'une bille d'un remplacement, état d'une zone, un nombre comparé
//           à une borne, la Vitesse ou la Masse du tour, effet imprimé), niée par
//           not(…) quand elle l'accepte. Une condition lit toujours l'effet IMPRIMÉ
//           d'une bille, jamais un effet déjà modifié : aucune dépendance circulaire
//           n'est possible ;
//   otherwise (facultatif, avec `when`) la clause jouée à sa place quand la condition
//           est fausse, « …, sinon … » : orElse(clause, condition, autre clause) ; une
//           chaîne, chaque clause pouvant avoir son propre sinon.
//
// Le nom d'une bille se déduit de son id : `marble.<id>.name`
// (data/i18n/<langue>/marbles.json), vérifié par les vérifications
// (domaine marbles-view) ; sa DESCRIPTION aussi, facultative, un texte d'ambiance
// sans effet de jeu (touche V) : `marble.<id>.description`. AJOUTER UNE BILLE : son
// fichier ici, sa ligne ci-dessous, son nom (et sa description) dans chaque langue,
// et sa place dans un sac (marbles/content/bags/) pour la mettre en jeu.
import copper from "./copper.js";
import quicksilver from "./quicksilver.js";
import ruby from "./ruby.js";
import ingot from "./ingot.js";
import bloodstone from "./bloodstone.js";
import moon from "./moon.js";
import comet from "./comet.js";
import galaxy from "./galaxy.js";
import eclipse from "./eclipse.js";
import star from "./star.js";
import bubble from "./bubble.js";
import ghost from "./ghost.js";
import pearl from "./pearl.js";
import ocean from "./ocean.js";
import snow_globe from "./snow_globe.js";
import bee from "./bee.js";
import dolphin from "./dolphin.js";
import turtle from "./turtle.js";
import spider from "./spider.js";
import dragon from "./dragon.js";
import sling_shot from "./sling_shot.js";
import fireball from "./fireball.js";
import tornado from "./tornado.js";
import grenade from "./grenade.js";
import red_devil from "./red_devil.js";
import clay from "./clay.js";
import cats_eye from "./cats_eye.js";
import agate from "./agate.js";
import steel from "./steel.js";
import soda from "./soda.js";

export default {
  copper,
  quicksilver,
  ruby,
  ingot,
  bloodstone,
  moon,
  comet,
  galaxy,
  eclipse,
  star,
  bubble,
  ghost,
  pearl,
  ocean,
  snow_globe,
  bee,
  dolphin,
  turtle,
  spider,
  dragon,
  sling_shot,
  fireball,
  tornado,
  grenade,
  red_devil,
  clay,
  cats_eye,
  agate,
  steel,
  soda,
};
