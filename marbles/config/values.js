// Jeu des billes : réglages, modèle de fiche, sac de test, et tout ce que la vue
// fait entendre. Donnée pure, zéro import. Les billes elles-mêmes sont du contenu,
// une par fichier : marbles/content/types/ (champs décrits dans marbles/content/types/index.js).

// La PARTIE PAR DÉFAUT : les valeurs de sa définition (marbles/content/definitions/
// free.js, format : marbles/core/definitions.js), celle que lance le jeu. Les autres
// définitions les reprennent et changent ce qui diffère.
export const DEFAULT_GAME = {
  // Les valeurs de DÉPART (definition.start).
  start: {
    firstTurnDraw: 5, // billes piochées au premier tour
    drawPerTurn: 1, // billes piochées à chaque tour suivant
    // Les valeurs de départ des CARACTÉRISTIQUES de la partie, que des statuts changent
    // (marbles/core/statuses.js/characteristic) :
    handSize: 5, // main pleine : la pioche est sautée, la bille reste au sac
    // Lancers par tour : un lancer est une pose depuis la main, sur un emplacement
    // vide ou occupé (l'échange n'en est pas un). Borne ce qu'un joueur peut
    // enchaîner dans un tour, une pose qui pioche à chaque fois comprise.
    throws: 5,
    // Capacité du POT : une bille envoyée au pot plein n'y entre pas, elle est perdue
    // pour la partie.
    potCapacity: 3,
  },
  // Le nombre de tours (definition.turns).
  turns: 10,
  // Les PALIERS de la partie libre (definition.goal.tiers) : des repères techniques
  // PROVISOIRES, tirés du simulateur (joueur glouton, sac de test du premier set,
  // 1000 parties) : les 25e, 50e et 90e centiles du score final.
  tiers: { bronze: 120, silver: 148, gold: 193 },
};

export const MARBLES_SETTINGS = {
  // L'usure maximale d'une bille qui n'en déclare pas (marbles/content/types/).
  defaultMaxWear: 3,
  // Fiches : le curseur secondaire revient à l'annonce principale dès que le
  // curseur principal se déplace. Pourra devenir une option.
  cardResetOnMove: true,
  // Séquence de résolution (marbles/view/sequence.js) : après chaque étape, une
  // pause de resolutionPauseBaseMs + resolutionPausePerCharMs × le nombre de
  // caractères de l'annonce, pour que le lecteur d'écran finisse avant la
  // suivante. Ni R ni les autres annonces n'en ont.
  resolutionPauseBaseMs: 400,
  resolutionPausePerCharMs: 40,
  // Enchaînement des sons (marbles/view/sounds.js), pour le son seulement : le
  // joueur n'attend jamais. Après un brassage du sac, la première balise de
  // pioche part au bout de shuffleToDrawMs, puis une balise toutes les
  // drawSoundIntervalMs ; un échange fait rouler la bille choisie, puis
  // l'autre swapSoundDelayMs plus tard. Les sons d'usure (Polissage, Fêlure)
  // d'un même geste se suivent à wearSoundIntervalMs ; une bille qu'une Fêlure
  // retire part à la défausse crackToOutMs après le son de sa fêlure, qu'on
  // l'entende avant le roulement. Le son d'Éveil d'une bille piochée part
  // awakenAfterDrawMs après sa balise de pioche, et la balise suivante l'attend ;
  // ceux du Final et de la Trouvaille d'un même geste se suivent à
  // triggerSoundIntervalMs.
  shuffleToDrawMs: 900,
  drawSoundIntervalMs: 350,
  swapSoundDelayMs: 150,
  wearSoundIntervalMs: 120,
  crackToOutMs: 150,
  awakenAfterDrawMs: 250,
  triggerSoundIntervalMs: 120,
  // Après qu'Entrée a passé la séquence de résolution, un second Entrée est ignoré
  // pendant skipGuardMs : pressé avant que le lecteur d'écran ait dit la question
  // d'un choix ou la fin de partie, il choisirait ou quitterait sans qu'on l'ait
  // entendue.
  skipGuardMs: 400,
  // Mode debug : la démonstration des places (Maj+B) fait entendre une balise à chaque
  // place, une toutes les placesDemoIntervalMs.
  placesDemoIntervalMs: 700,
};

// Les CALIBRES (Size) : ce qu'EST une bille par sa taille, champ `size` obligatoire
// de chaque bille, statique (aucune action ne le change). Un entier, pour que les
// comparaisons (plus petit, plus grand, écart) se fassent sur lui ; mais jamais
// écrit en chiffre ailleurs que dans ces comparaisons : toujours par ces constantes.
// Lu par la simulation (les conditions de calibre, marbles/core/effects.js) et par
// le son (le profil et la force des chocs, plus bas).
export const SMALL = 1;
export const MEDIUM = 2;
export const LARGE = 3;

// Chaque calibre et son identifiant de texte : son nom est `marbles.size.<id>.name`
// (data/i18n/<langue>/marbles.json). La liste des calibres valides.
export const MARBLE_SIZES = Object.freeze({
  [SMALL]: "small",
  [MEDIUM]: "medium",
  [LARGE]: "large",
});

// Les FAMILLES : champ `families` obligatoire de chaque bille, une LISTE (une famille
// au moins, plusieurs permises : une bille bicolore), statique. Dans l'ordre de la
// roue, puis la famille neutre ; aucune n'a d'exception de règle, les Classiques
// comprises. Le nom de chacune : `marbles.family.<id>.name`. Lues par les filtres,
// les conditions et les sources de montant (marbles/core/effects.js) et par
// l'annonce d'une bille.
export const MARBLE_FAMILIES = Object.freeze(["treasure", "stars", "mist", "bestiary", "blast", "classics"]);

// Les RARETÉS : champ `rarity` obligatoire de chaque bille, exactement une, statique.
// De la plus commune à la plus rare : le rang d'une rareté est sa place dans cette
// liste. Le nom de chacune : `marbles.rarity.<id>.name`.
export const MARBLE_RARITIES = Object.freeze(["common", "uncommon", "rare", "epic", "legendary"]);

// Les PROFILS SONORES, un par CALIBRE : le son d'une bille dépend de son calibre
// (couplage voulu, une seule source de vérité). Chacun :
//   beacon  sa balise, la voix de la bille, à la pioche et sous le curseur ;
//   drop    son bruit de chute, à l'arrivée d'une bille qui roule ;
//   roll    sa boucle de roulement, quand elle va d'une place à l'autre ;
//   impact  son bruit de collision, quand elle en déloge une autre ou qu'on la
//           déloge (voir MARBLES_COLLISION).
// Des clés d'asset ou de pool (assets/manifest.json), vérifiées par l'audit du
// contenu. Un profil aura un jour plusieurs voix (marble_small_2_beacon...).
export const MARBLE_SOUND_PROFILES = {
  [SMALL]: {
    beacon: "assets/sounds/marbles/marble_small_1_beacon",
    drop: "assets/sounds/marbles/marble_small_drop",
    roll: "assets/sounds/marbles/marble_small_rolling",
    impact: "assets/sounds/marbles/marble_small_collision",
  },
  [MEDIUM]: {
    beacon: "assets/sounds/marbles/marble_medium_1_beacon",
    drop: "assets/sounds/marbles/marble_medium_drop",
    roll: "assets/sounds/marbles/marble_medium_rolling",
    impact: "assets/sounds/marbles/marble_medium_collision",
  },
  [LARGE]: {
    beacon: "assets/sounds/marbles/marble_large_1_beacon",
    drop: "assets/sounds/marbles/marble_large_drop",
    roll: "assets/sounds/marbles/marble_large_rolling",
    impact: "assets/sounds/marbles/marble_large_collision",
  },
};

// La COLLISION, quand une bille posée en déloge une autre :
//   flamMs          l'écart entre le son de la frappeuse et celui de la frappée.
//                   Sous une vingtaine de millisecondes, l'oreille entend UN choc,
//                   plus épais, deux corps ; au-delà de 30 à 40, deux coups ;
//   weights         le POIDS de chaque calibre, pour le son seulement ;
//   weightExponent  la FORCE du choc : le rapport des poids des calibres de la
//                   posée (frappeuse) et de l'éjectée (frappée), élevé à cette
//                   puissance. 0 : toujours 1 ; 0,3 : un calot sur une minibille (3
//                   sur 1) frappe à 1,39, une minibille sur un calot à 0,72 ; deux
//                   billes de même calibre, à 1. La force règle le volume des deux
//                   sons, et la vitesse de départ de la bille délogée (roulement
//                   knocked, MARBLES_ROLLS).
export const MARBLES_COLLISION = {
  flamMs: 12,
  weights: { [SMALL]: 1, [MEDIUM]: 2, [LARGE]: 3 },
  weightExponent: 0.3,
};

// VARIATIONS DE TON : à chaque son, une vitesse de lecture tirée dans
// [1 - v, 1 + v], pour que deux sons de suite ne soient jamais identiques. Par
// famille de son : collision, chute, roulement (sa boucle, tirée une fois par
// trajet). Jamais sur les balises : la balise est l'identité de la bille, la
// faire varier brouillerait ce qu'elle permet de reconnaître.
export const MARBLES_PITCH_VARIATION = {
  impact: 0.04,
  drop: 0.03,
  roll: 0.02,
  polish: 0.03,
  crack: 0.03,
  flick: 0.03,
  awaken: 0.03,
  final: 0.03,
  windfall: 0.03,
};

// OÙ S'ENTEND chaque place de la table (marbles/view/sounds/space.js/renderAt) :
//   x  de gauche (-1) à droite (+1), le panoramique. Les billes de la main se
//      répartissent de fromX à toX selon leur rang, la première tout à gauche ; une
//      bille seule s'entend au milieu. Jamais aux extrêmes : un son tout d'un côté
//      disparaît d'une oreille, fatigant au casque. C'est déjà la PERSPECTIVE : plus
//      une place est loin, plus elle est resserrée vers le centre, comme les lignes
//      d'un dessin ; un son qui se déplacera d'une place à l'autre la suivra donc.
//   y  la profondeur, de la main (0, au plus près) à la pointe (1, au plus loin),
//      rendue par MARBLES_SOUND_DEPTH.
// La défausse, où roulent les billes éjectées ou usées : à droite, derrière les
// bases, pour que le joueur apprenne où elles « tombent ». Le pot, où roulent les
// billes mises en poche, en face : à gauche, à la même profondeur.
export const MARBLES_SOUND_PLACES = {
  hand: { fromX: -0.6, toX: 0.6, y: 0 },
  leftBase: { x: -0.4, y: 0.5 },
  rightBase: { x: 0.4, y: 0.5 },
  apex: { x: 0, y: 1 },
  discard: { x: 0.8, y: 0.7 },
  pot: { x: -0.8, y: 0.7 },
};

// La PROFONDEUR, interpolée de la main (y = 0) à la pointe (y = 1). Trois indices,
// qui ne marchent bien qu'ensemble :
//   farGainDb                    le volume au plus loin, en décibels ;
//   nearLowpassHz, farLowpassHz  le passe-bas (l'air absorbe les aigus), sur une
//                                échelle logarithmique ; discret : un passe-bas marqué
//                                veut dire « derrière une paroi » en ville ;
//   nearReverbSend, farReverbSend  la part envoyée à la réverbération de la table,
//                                l'indice le plus convaincant : un son lointain a plus
//                                d'écho par rapport au son direct ;
//   reverb                       la « pièce » de la table : durée, déclin, niveau de
//                                retour (lib/audio/reverb.js).
// Un son sans place (brassage, menus) reste sec, au centre, à plein volume.
export const MARBLES_SOUND_DEPTH = {
  farGainDb: -6,
  nearLowpassHz: 20000,
  farLowpassHz: 7000,
  nearReverbSend: 0.05,
  farReverbSend: 0.35,
  reverb: { durationSec: 1.2, decay: 3, wet: 0.6 },
};

// Les ROULEMENTS : une bille qui va d'une place à l'autre fait entendre la boucle
// de roulement de son profil, déplacée en continu sur la table (panoramique et
// profondeur, comme une place), puis sa chute ou son choc à l'arrivée.
// Un style par trajet :
//   place    de la main à un emplacement vide, à la pose : elle ralentit pour se
//            poser ;
//   strike   de la main à un emplacement occupé : elle est TIRÉE, plus vite et
//            presque sans ralentir, et l'oreille anticipe le choc ;
//   swap     d'un emplacement à l'autre, à l'échange ;
//   knocked  la bille délogée, de son emplacement à la défausse. Sa vitesse de
//            départ est multipliée par la force du choc (MARBLES_COLLISION) ;
//   out      la bille usée, de son emplacement à la défausse. Plus lente, et qui
//            s'essouffle ; aussi la bille mise en poche, de là où elle était au pot ;
//   rotation  le triangle qui tourne : chaque bille roule vers l'emplacement
//          suivant, toutes ensemble. Un seul élan pour plusieurs crans, qui passe
//          par les emplacements sans s'y arrêter.
// Pour place, strike, swap, knocked et out :
//   speed     la vitesse au départ, en unités de la table par seconde (la largeur
//             de la table, de x = -1 à x = 1, fait 2 ; de la main à la pointe, 1) ;
//   endRatio  la vitesse à l'arrivée, en part de celle du départ : 1, elle ne
//             ralentit pas ; 0,2, elle arrive presque arrêtée. La durée du trajet
//             en découle : distance divisée par la vitesse moyenne.
// Pour rotation, un bloc rigide : les billes partent et arrivent ensemble, chacune
// à sa vitesse, les côtés du triangle n'ayant pas la même longueur :
//   notchMs   la durée d'un cran ; plusieurs crans s'enchaînent d'un seul élan ;
//   endRatio  comme ci-dessus, sur tout l'élan ;
//   gain      le volume de chaque bille : trois boucles ensemble sonnent plus fort
//             qu'une seule ;
//   dropGain  le volume des chutes à l'arrivée, le triangle qui se cale : plus
//             discrètes que celle d'une pose.
// Et pour tous :
//   restRate     la vitesse de lecture de la boucle d'une bille presque arrêtée (1 à
//                sa vitesse de départ) : elle ralentit ET grave, comme une bande
//                qu'on freine. Le volume suit aussi la vitesse ;
//   fadeMs       le fondu d'entrée et de sortie de la boucle, contre les clics ;
//   impactToOutMs  après un choc, le délai avant que la bille délogée ne parte ;
//   outStaggerMs   l'écart entre les départs de plusieurs billes usées à la fois.
export const MARBLES_ROLLS = {
  place: { speed: 2, endRatio: 0.8 },
  strike: { speed: 3, endRatio: 0.95 },
  swap: { speed: 2, endRatio: 0.8 },
  knocked: { speed: 2, endRatio: 0.2 },
  out: { speed: 1.6, endRatio: 0.2 },
  rotation: { notchMs: 700, endRatio: 0.4, gain: 0.6, dropGain: 0.5 },
  restRate: 0.7,
  fadeMs: 50,
  impactToOutMs: 30,
  outStaggerMs: 200,
};

// Les sons de l'écran des billes qui ne sont pas la voix d'un calibre : la musique
// (en boucle s'il n'y a qu'un morceau, sinon enchaînée), le brassage du sac, les
// sons d'usure, les mêmes pour tous les calibres, joués à l'emplacement de la bille
// touchée : le Polissage (polish) et la Fêlure (crack) ; les sons de DÉCLENCHEUR,
// joués quand le mot-clé se déclenche chez une bille qui en a l'effet, là où elle
// est : la Chiquenaude (flick, à sa place dans la main), l'Éveil (awaken, à sa place
// dans la main, après sa balise de pioche), le Final (final, à l'emplacement
// quitté), la Trouvaille (windfall, à son emplacement) ; et le début du tour du
// joueur (playerTurn, au centre), quand la main lui revient. Enfin, des POINTS
// D'ACCROCHE sans fichier pour l'instant (null : rien ne se joue), au centre : la
// victoire et l'échec (objectif cible), le palier atteint (partie libre, en cours de
// partie et à la fin), la fin de l'endurance (marbles/core/definitions.js).
export const MARBLES_AUDIO = {
  music: "assets/musics/marbles_classic",
  shuffle: "assets/sounds/marbles/marbles_shuffling",
  polish: "assets/sounds/marbles/marble_polishing",
  crack: "assets/sounds/marbles/marble_cracking",
  flick: "assets/sounds/marbles/marble_flick",
  awaken: "assets/sounds/marbles/marble_awaken",
  final: "assets/sounds/marbles/marble_final",
  windfall: "assets/sounds/marbles/marble_windfall",
  playerTurn: "assets/sounds/marbles/player_turn",
  victory: null,
  defeat: null,
  tier: null,
  enduranceEnd: null,
};

// Les PHASES, déclarées UNE fois : l'effet de base ou de pointe d'une bille, joué
// pendant la résolution. Chacune :
//   id      son identifiant, celui de son mot-clé et de sa valeur de partie ;
//   field   le champ d'effet de la bille (marbles/content/types/index.js) ; la base a aussi
//           ses variantes par emplacement (`baseVariant`) ;
//   slots   les emplacements où elle joue, dans l'ordre de la résolution ;
//   texts   `name`, le nom du mot-clé (« Pointe ») ; `description`, ce qu'il fait
//           (aide des mots-clés, touches E et Maj+E). Une phase sans eux échoue au
//           chargement (marbles/core/content.js).
// L'ordre de la liste est celui des mots-clés (pointe, puis base).
export const MARBLE_PHASES = [
  {
    id: "apex",
    field: "apex",
    slots: ["apex"],
    texts: { name: "marbles.keyword.apex.name", description: "marbles.keyword.apex.description" },
  },
  {
    id: "base",
    field: "base",
    // Dans l'ordre horaire (marbles/core/effects.js/SLOTS).
    slots: ["rightBase", "leftBase"],
    texts: { name: "marbles.keyword.base.name", description: "marbles.keyword.base.description" },
  },
];

// Les DÉCLENCHEURS propres d'une bille, déclarés UNE fois : la validation de la
// table, les écouteurs du core (marbles/core/run.js), la prévision, la narration, la
// fiche et les outils lisent cette liste, jamais une copie. La phase, l'effet de
// base ou de pointe, est à part : elle a ses propres champs et se dit par son
// emplacement. L'ordre de la liste est celui de la fiche et des mots-clés : la vie
// d'une bille, de sa pioche à son départ.
//   id        son identifiant : la valeur `trigger` de l'évènement `effect` ;
//   field     le champ d'effet de la bille (marbles/content/types/index.js) ;
//   event     l'évènement du journal qui le déclenche ;
//   marble    la bille concernée : "onSlot", celle qui est sur l'emplacement de
//             l'évènement ; "leaving", celle que l'évènement nomme, EN PARTANCE :
//             sortie de sa zone, pas encore arrivée (marbles/core/path.js/travel) ;
//             "dropped", celle que l'évènement nomme, qui vient d'arriver à la
//             DÉFAUSSE ; "thrown", celle que l'évènement nomme, EN COURS DE LANCER :
//             sortie de la main, pas encore sur le triangle ; "drawn", celle que
//             l'évènement nomme, qui vient d'être piochée : en main, à 0 tour en
//             main (seules Empocher et Défausser y prennent la bille elle-même) ;
//   moment    quand il joue : "play", pendant la phase de jeu (toutes les phases
//             restent à venir) ; "afterPhases", après toutes les phases (une Vitesse
//             ou une Masse ciblée n'y a plus de sens : marbles/core/effects.js) ;
//             "anytime", à tout moment du tour (rien ne se refuse à la validation :
//             un bonus ciblé dont la phase est passée se perd à l'exécution) ;
//   replacement  (facultatif) vrai s'il joue pendant un REMPLACEMENT : son
//             évènement porte la posée et l'éjectée, que la condition de calibre
//             relatif compare (relativeSize, refusée ailleurs) ;
//   forecast  où sa prévision se dit :
//               { line: "placement", marble, order } : pendant une pose, sa propre
//               ligne de la confirmation, pour la bille "occupant" (la remplacée)
//               ou "placed" (la posée), à la place `order` (l'ordre réel des
//               évènements) ; toujours présente, sur un emplacement occupé
//               seulement pour un déclencheur de remplacement (`replacement`) ;
//               { line: "slot" } : avec l'emplacement de la bille, après son effet
//               de phase (R, valeurs de la confirmation) ;
//               { line: "regeneration" } : juste après l'annonce de la régénération
//               du sac (R, confirmation), une phrase par effet, qui nomme sa bille ;
//               { line: "none" } : jamais prévu, la bille concernée étant inconnue
//               de la prévision (l'Éveil : marbles/core/forecast.js, « incertain ») ;
//   texts     ses gabarits i18n : `name`, le nom du mot-clé (« Chiquenaude ») ;
//             `description`, ce qu'il fait (aide des mots-clés, touches E et
//             Maj+E) ; `card`, son champ de fiche ({effect}) ; `effect`,
//             son effet joué dans le journal ({marble}, {effect}, {speed}, {mass}) ;
//             `placement` (ligne "placement"), `slot` (ligne "slot") ou
//             `regeneration` (ligne "regeneration"), sa prévision ({marble},
//             {effect} ; {effect} seul pour "slot") ;
//   card      sa place dans la fiche : "below", au-dessous de l'annonce principale.
// AJOUTER un déclencheur : une entrée ici, son champ dans les billes, ses textes, et
// l'émission de son évènement dans marbles/core/marbles.js ou marbles/core/run.js au bon
// moment du tour.
export const MARBLE_TRIGGERS = [
  // L'Éveil : à chaque bille piochée (du sac à la main), pioche du tour ou effet,
  // juste après sa pioche et avant la suivante ; jamais pour une bille restée au sac
  // faute de place en main.
  {
    id: "awaken",
    field: "awaken",
    event: "awaken",
    marble: "drawn",
    moment: "anytime",
    forecast: { line: "none" },
    texts: {
      name: "marbles.keyword.awaken.name",
      description: "marbles.keyword.awaken.description",
      card: "marbles.card.awaken",
      effect: "marbles.event.effect_awaken",
    },
    card: "below",
  },
  // La Chiquenaude : à chaque pose depuis la main, sur un emplacement vide ou occupé,
  // avant tout le reste, la bille en cours de lancer (ni en main ni sur le triangle).
  {
    id: "flick",
    field: "flick",
    event: "flick",
    marble: "thrown",
    moment: "play",
    forecast: { line: "placement", marble: "placed", order: 0 },
    texts: {
      name: "marbles.keyword.flick.name",
      description: "marbles.keyword.flick.description",
      card: "marbles.card.flick",
      effect: "marbles.event.effect_flick",
      placement: "marbles.place.flick",
    },
    card: "below",
  },
  {
    id: "hit",
    field: "hit",
    event: "hit",
    marble: "onSlot",
    moment: "play",
    replacement: true,
    forecast: { line: "placement", marble: "placed", order: 2 },
    texts: {
      name: "marbles.keyword.hit.name",
      description: "marbles.keyword.hit.description",
      card: "marbles.card.hit",
      effect: "marbles.event.effect_hit",
      placement: "marbles.place.hit",
    },
    card: "below",
  },
  // La Trouvaille : à chaque régénération du sac depuis la défausse, à tout moment du
  // tour, chez chaque bille ACTIVE (sur le triangle), dans l'ordre horaire, avant
  // que la pioche interrompue ne reprenne.
  {
    id: "windfall",
    field: "windfall",
    event: "windfall",
    marble: "onSlot",
    moment: "anytime",
    forecast: { line: "regeneration" },
    texts: {
      name: "marbles.keyword.windfall.name",
      description: "marbles.keyword.windfall.description",
      card: "marbles.card.windfall",
      effect: "marbles.event.effect_windfall",
      regeneration: "marbles.forecast.windfall",
    },
    card: "below",
  },
  // L'Éjection : la bille chassée du triangle (par une pose, par Éjecter), EN
  // PARTANCE : partie de son emplacement, pas encore arrivée.
  {
    id: "knockout",
    field: "knockout",
    event: "knockout",
    marble: "leaving",
    // À tout moment : une pose pendant la phase de jeu, mais aussi l'action Éjecter
    // d'un effet de résolution (une phase, un Final).
    moment: "anytime",
    replacement: true,
    forecast: { line: "placement", marble: "occupant", order: 1 },
    texts: {
      name: "marbles.keyword.knockout.name",
      description: "marbles.keyword.knockout.description",
      card: "marbles.card.knockout",
      effect: "marbles.event.effect_knockout",
      placement: "marbles.place.knockout",
    },
    card: "below",
  },
  // Le Final : au retrait par USURE seulement, la bille EN PARTANCE, avant son
  // arrivée à la défausse. Ses valeurs comptent pour le tour en cours (les retraits
  // précèdent l'Impact).
  {
    id: "final",
    field: "final",
    event: "final",
    marble: "leaving",
    moment: "afterPhases",
    forecast: { line: "slot" },
    texts: {
      name: "marbles.keyword.final.name",
      description: "marbles.keyword.final.description",
      card: "marbles.card.final",
      effect: "marbles.event.effect_final",
      slot: "marbles.outcome.final",
    },
    card: "below",
  },
  // La Chute : à chaque arrivée de la bille à la défausse, d'où qu'elle vienne
  // (triangle, main, sac), au bout de son trajet (marbles/core/path.js/travel), jamais
  // si une redirection l'envoie ailleurs. Elle est alors à la défausse. Sa prévision :
  // avec l'emplacement qu'elle a quitté, après son Final ; une bille arrivée d'une
  // autre zone n'en a pas.
  {
    id: "drop",
    field: "drop",
    event: "discarded",
    marble: "dropped",
    moment: "anytime",
    forecast: { line: "slot" },
    texts: {
      name: "marbles.keyword.drop.name",
      description: "marbles.keyword.drop.description",
      card: "marbles.card.drop",
      effect: "marbles.event.effect_drop",
      slot: "marbles.outcome.drop",
    },
    card: "below",
  },
];

// Les VALEURS DE PARTIE (Tally) : des compteurs tenus par la simulation, dans l'état
// (`tally`, sérialisé avec lui), chacun en deux portées, « ce tour » et « cette
// partie ». La plupart sont GÉNÉRÉS (marbles/core/counters.js) : un par mot-clé de
// déclenchement (MARBLE_TRIGGERS et les phases), un ou deux par action mot-clé (ses
// déclenchements, et sa quantité réelle si elle en a une : marbles/core/effects.js/
// CLAUSE_ACTIONS), quatre par compteur du tour (Vitesse, Masse). Ici, les seuls déclarés à la main : les ÉVÈNEMENTS RÉELS,
// ce qui arrive aux billes, quel que soit le mot-clé qui y réagit. Chacun :
//   id      son identifiant, aussi celui de sa source de montant calculé
//           (`tally(id, portée)`, marbles/content/effects.js) ; ses textes en découlent :
//           `marbles.tally.<id>.name` (menu de debug) et `.unit` (« par bille
//           éjectée ») ;
//   events  les types d'évènements du journal qui l'augmentent de 1
//           (marbles/core/content.js/JOURNAL_EVENTS) ;
//   match   (facultatif) des champs de l'évènement et leur valeur exigée, ou la
//           liste des valeurs admises : { cause: "wear" }, { cause: ["a", "b"] } ;
//   filter  (facultatif) { type: "size", size } : la bille que nomme l'évènement
//           est de ce calibre (un évènement qui nomme toujours une bille connue,
//           jamais la pioche, dont la bille est cachée dans la prévision).
// Tous comptent À L'ÉMISSION de leur évènement, avant que les billes n'y réagissent.
// AJOUTER un compteur d'évènement : une entrée ici et ses deux textes dans chaque
// langue, rien d'autre ; ses deux portées, sa source et sa ligne du menu suivent.
export const MARBLE_TALLIES = [
  // Chaque pose depuis la main, que la bille ait une Chiquenaude ou non.
  { id: "thrownMarbles", events: ["flick"] },
  // Chaque bille posée sur un emplacement occupé (après sa Chiquenaude : si elle a
  // vidé l'emplacement, la pose est simple).
  { id: "hitMarbles", events: ["hit"] },
  // Chaque bille chassée du triangle : par un remplacement (une pose), ou par
  // l'action Éjecter.
  { id: "ejectedMarbles", events: ["removed"], match: { cause: ["replacement", "eject"] } },
  // Chaque régénération du sac depuis la défausse.
  { id: "shuffles", events: ["bagRegenerated"] },
  // Chaque bille piochée, pioche du tour comme effets.
  { id: "drawnMarbles", events: ["draw"] },
  // Chaque retrait par usure, usure de phase ou Fêlure.
  { id: "wornMarbles", events: ["removed"], match: { cause: "wear" } },
  // Toute sortie du triangle, quelle qu'en soit la cause (usure, éjection, mise en
  // poche, défausse, rebond).
  { id: "triangleExits", events: ["removed"] },
  // Chaque bille entrée au pot.
  { id: "pocketedMarbles", events: ["pocketed"] },
  // Chaque bille perdue, envoyée au pot plein.
  { id: "lostMarbles", events: ["lost"] },
  // Chaque bille arrivée à la défausse, d'où qu'elle vienne (triangle, main, sac).
  { id: "discardedMarbles", events: ["discarded"] },
  // LES STATUTS (marbles/core/statuses.js) : chaque statut reçu (une instance neuve),
  // renforcé (fusionné avec celui qui est là), chaque charge consommée, chaque fin.
  { id: "statusesReceived", events: ["statusGained"] },
  { id: "statusesStrengthened", events: ["statusStrengthened"] },
  { id: "statusChargesUsed", events: ["statusCharge"] },
  { id: "statusesExpired", events: ["statusExpired"] },
];

// Le mot-clé EN POCHE (Pocketed) : des effets qui ne s'appliquent que lorsque la
// bille est dans le POT, chacun attaché à un MOMENT. Le champ de bille `field` est un
// objet { <moment>: effet } (marbles/content/types/index.js). Déclaré UNE fois :
//   field    le champ de la bille ;
//   texts    `name` et `description`, le mot-clé (aide des mots-clés, E et Maj+E) ;
//   moments  la liste des moments, dans l'ordre de la fiche. Chacun :
//     id       sa clé dans le champ ;
//     trigger  l'identifiant de son effet (`trigger` de l'évènement `effect`), aussi
//              celui de sa valeur de partie ;
//     event    l'évènement du journal qui le déclenche, qui nomme la bille du pot ;
//     moment   quand il joue, comme un déclencheur (MARBLE_TRIGGERS) : la règle des
//              cibles en dépend ;
//     texts    `card`, son champ de fiche ({effect}) ; `effect`, son effet joué dans
//              le journal ({marble}, {effect}, {speed}, {mass}) ; `forecast`
//              (facultatif), sa ligne dans R ({marble}, {effect}) ;
//     reactive (facultatif, un seul moment) vrai pour le moment RÉACTIF, « à chaque
//              (occurrence) » : ses clés dans le champ ne sont pas `id` mais les
//              identifiants des valeurs de partie ÉCOUTABLES (marbles/core/counters.js :
//              évènements réels, déclenchements de mots-clés et d'actions ; jamais
//              une quantité réelle, ni Vitesse et Masse), `pocketed: { flick: [...] }`.
//              Une réaction par incrément du compteur écouté ; son évènement nomme la
//              bille du pot et le compteur ({ index, marble, counter }). Sa ligne de
//              fiche reçoit aussi {occurrence} (`marbles.tally.<id>.each`).
// Une action sur la bille elle-même y est refusée : dans le pot, elle n'a ni usure
// ni place à quitter. AJOUTER un moment fixe : une entrée ici, ses textes, et
// l'émission de son évènement dans marbles/core/run.js. Une occurrence écoutable de plus
// n'a rien à déclarer ici : tout compteur écoutable ajouté l'est par construction.
export const MARBLE_POCKET = {
  field: "pocketed",
  texts: { name: "marbles.keyword.pocketed.name", description: "marbles.keyword.pocketed.description" },
  moments: [
    // À l'entrée au pot : quand la bille y entre effectivement (jamais si elle est
    // perdue faute de place), juste après son arrivée.
    {
      id: "entry",
      trigger: "pocketEntry",
      event: "pocketed",
      moment: "anytime",
      texts: { card: "marbles.card.pocketed_entry", effect: "marbles.event.effect_pocket_entry" },
    },
    // À chaque résolution : une fois par tour, après les trois phases et avant les
    // retraits par usure, chaque bille du pot dans l'ordre d'arrivée.
    {
      id: "resolution",
      trigger: "pocketResolution",
      event: "potResolution",
      moment: "afterPhases",
      texts: { card: "marbles.card.pocketed_resolution", effect: "marbles.outcome.pot", forecast: "marbles.outcome.pot" },
    },
    // À chaque (occurrence) : une réaction à ce qui se passe pendant la partie, une
    // par incrément du compteur écouté, après l'effet de la bille concernée, chaque
    // bille du pot dans l'ordre d'arrivée. Jamais à sa propre mise en poche.
    {
      id: "each",
      reactive: true,
      trigger: "pocketReaction",
      event: "pocketReaction",
      moment: "anytime",
      texts: { card: "marbles.card.pocketed_reaction", effect: "marbles.outcome.pot" },
    },
  ],
};

// La fiche d'une bille (lib/detail-card.js, marbles/view/card.js) : l'ordre de ses
// champs autour de l'annonce principale, du plus proche au plus éloigné. Les champs
// des déclencheurs viennent de MARBLE_TRIGGERS (`card`), dans son ordre ; un autre
// type d'effet : sa ligne ici et son gabarit, rien d'autre.
//   field            le champ de la bille dans MARBLE_TYPES ;
//   part             (facultatif) la clé dans ce champ, quand il est un objet de
//                    moments (En poche) ;
//   reactive         (facultatif) le moment réactif d'En poche : une ligne par
//                    occurrence écoutée par la bille, dans l'ordre des valeurs de
//                    partie (marbles/view/card.js) ;
//   labelKey         son gabarit, qui reçoit {effect} ;
//   variantLabelKey  (facultatif) son gabarit quand l'effet diffère selon la base ;
//   required         champ toujours présent, « aucun effet » s'il est vide ; sinon,
//                    il n'existe que si la bille l'a.
// emptyBelowKey : le champ de repli au-dessous, si aucun n'y existe.
export const MARBLE_CARD_MODEL = {
  above: [
    { field: "apex", labelKey: "marbles.card.apex", required: true },
    { field: "base", labelKey: "marbles.card.base", variantLabelKey: "marbles.card.base_variant", required: true },
  ],
  below: [
    ...MARBLE_TRIGGERS.filter((trigger) => trigger.card === "below").map((trigger) => ({ field: trigger.field, labelKey: trigger.texts.card })),
    // En poche, en dernier : un champ par moment fixe, puis une ligne par occurrence
    // écoutée.
    ...MARBLE_POCKET.moments.map((moment) =>
      moment.reactive ? { field: MARBLE_POCKET.field, reactive: true, labelKey: moment.texts.card } : { field: MARBLE_POCKET.field, part: moment.id, labelKey: moment.texts.card }
    ),
  ],
  emptyBelowKey: "marbles.card.no_special_effect",
};

// La fiche d'un STATUT (lib/detail-card.js, marbles/view/narration/statuses.js), dans
// le menu des statuts (Maj+A) : au-dessous de l'annonce principale (son nom, son
// intensité, ce qui lui reste), son effet, ce qui lui reste, son origine.
//   field  le champ du statut (STATUS_FIELDS de la narration) ;
//   required  toujours présent.
export const STATUS_CARD_MODEL = {
  above: [],
  below: [
    { field: "effect", required: true },
    { field: "remaining", required: true },
    { field: "origin", required: true },
  ],
};

// Sac de test : un exemplaire de chacune des 30 billes du premier set, le sac de la
// partie par défaut
// (DEFAULT_GAME). Une liste d'ids, pas un dérivé du registre (marbles/content/types/) :
// un sac peut porter plusieurs exemplaires d'une bille. Validé au démarrage avec les
// définitions (marbles/core/validation.js/validateMarblesContent).
export const STARTING_BAG = [
  "copper",
  "quicksilver",
  "ruby",
  "ingot",
  "bloodstone",
  "moon",
  "comet",
  "galaxy",
  "eclipse",
  "star",
  "bubble",
  "ghost",
  "pearl",
  "ocean",
  "snow_globe",
  "bee",
  "dolphin",
  "turtle",
  "spider",
  "dragon",
  "sling_shot",
  "fireball",
  "tornado",
  "grenade",
  "red_devil",
  "clay",
  "cats_eye",
  "agate",
  "steel",
  "soda",
];
