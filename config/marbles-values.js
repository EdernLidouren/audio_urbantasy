// Jeu des billes : réglages, modèle de fiche, sac de test, et tout ce que la vue
// fait entendre. Donnée pure, zéro import. Les billes elles-mêmes sont du contenu,
// une par fichier : marbles/types/ (champs décrits dans marbles/types/index.js).

export const MARBLES_SETTINGS = {
  firstTurnDraw: 5, // billes piochées au premier tour
  drawPerTurn: 1, // billes piochées à chaque tour suivant
  // Capacités du joueur, qui pourront devenir ses caractéristiques :
  maxHandSize: 5, // main pleine : la pioche est sautée, la bille reste au sac
  // Lancers par tour : un lancer est une pose depuis la main, sur un emplacement
  // vide ou occupé (l'échange n'en est pas un). Borne ce qu'un joueur peut
  // enchaîner dans un tour, une pose qui pioche à chaque fois comprise.
  throwsPerTurn: 5,
  turnCount: 9,
  defaultMaxWear: 3,
  // Fiches : le curseur secondaire revient à l'annonce principale dès que le
  // curseur principal se déplace. Pourra devenir une option.
  cardResetOnMove: true,
  // Séquence de résolution (view/marbles/sequence.js) : après chaque étape, une
  // pause de resolutionPauseBaseMs + resolutionPausePerCharMs × le nombre de
  // caractères de l'annonce, pour que le lecteur d'écran finisse avant la
  // suivante. Ni R ni les autres annonces n'en ont.
  resolutionPauseBaseMs: 400,
  resolutionPausePerCharMs: 40,
  // Enchaînement des sons (view/marbles/sounds.js), pour le son seulement : le
  // joueur n'attend jamais. Après un brassage du sac, la première balise de
  // pioche part au bout de shuffleToDrawMs, puis une balise toutes les
  // drawSoundIntervalMs ; un échange fait rouler la bille choisie, puis
  // l'autre swapSoundDelayMs plus tard.
  shuffleToDrawMs: 900,
  drawSoundIntervalMs: 350,
  swapSoundDelayMs: 150,
};

// Les CALIBRES (Size) : ce qu'EST une bille par sa taille, champ `size` obligatoire
// de chaque bille, statique (aucune action ne le change). Un entier, pour que les
// comparaisons (plus petit, plus grand, écart) se fassent sur lui ; mais jamais
// écrit en chiffre ailleurs que dans ces comparaisons : toujours par ces constantes.
// Lu par la simulation (les conditions de calibre, core/marbles-effects.js) et par
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
};

// OÙ S'ENTEND chaque place de la table (view/marbles/sounds.js/renderAt) :
//   x  de gauche (-1) à droite (+1), le panoramique. Les billes de la main se
//      répartissent de fromX à toX selon leur rang, la première tout à gauche ; une
//      bille seule s'entend au milieu. Jamais aux extrêmes : un son tout d'un côté
//      disparaît d'une oreille, fatigant au casque. C'est déjà la PERSPECTIVE : plus
//      une place est loin, plus elle est resserrée vers le centre, comme les lignes
//      d'un dessin ; un son qui se déplacera d'une place à l'autre la suivra donc.
//   y  la profondeur, de la main (0, au plus près) à la pointe (1, au plus loin),
//      rendue par MARBLES_SOUND_DEPTH.
// La défausse, où roulent les billes éjectées ou usées : à droite, derrière les
// bases, pour que le joueur apprenne où elles « tombent ».
export const MARBLES_SOUND_PLACES = {
  hand: { fromX: -0.6, toX: 0.6, y: 0 },
  leftBase: { x: -0.4, y: 0.5 },
  rightBase: { x: 0.4, y: 0.5 },
  apex: { x: 0, y: 1 },
  discard: { x: 0.8, y: 0.7 },
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
//            s'essouffle ;
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

// Les sons de l'écran des billes qui ne sont pas ceux d'une bille : la musique
// (en boucle s'il n'y a qu'un morceau, sinon enchaînée) et le brassage du sac.
export const MARBLES_AUDIO = {
  music: "assets/musics/marbles_classic",
  shuffle: "assets/sounds/marbles/marbles_shuffling",
};

// Les DÉCLENCHEURS propres d'une bille, déclarés UNE fois : la validation de la
// table, les écouteurs du core (core/marbles.js), la prévision, la narration, la
// fiche et les outils lisent cette liste, jamais une copie. La phase, l'effet de
// base ou de pointe, est à part : elle a ses propres champs et se dit par son
// emplacement. L'ordre de la liste est celui de la fiche.
//   id        son identifiant : la valeur `trigger` de l'évènement `effect` ;
//   field     le champ d'effet de la bille (marbles/types/index.js) ;
//   event     l'évènement du journal qui le déclenche ;
//   marble    la bille concernée : "onSlot", celle qui est sur l'emplacement de
//             l'évènement ; "removed", celle que l'évènement nomme, déjà retirée du
//             triangle ; "thrown", celle que l'évènement nomme, EN COURS DE LANCER :
//             sortie de la main, pas encore sur le triangle ;
//   moment    quand il joue : "play", pendant la phase de jeu (toutes les phases
//             restent à venir) ; "afterPhases", après toutes les phases (une Vitesse
//             ou une Masse ciblée n'y a plus de sens : core/marbles-effects.js) ;
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
//   texts     ses gabarits i18n : `card`, son champ de fiche ({effect}) ; `effect`,
//             son effet joué dans le journal ({marble}, {effect}, {speed}, {mass}) ;
//             `placement` (ligne "placement") ou `slot` (ligne "slot"), sa
//             prévision ({marble}, {effect} ; {effect} seul pour "slot") ;
//   card      sa place dans la fiche : "below", au-dessous de l'annonce principale.
// AJOUTER un déclencheur : une entrée ici, son champ dans les billes, ses textes, et
// l'émission de son évènement dans core/marbles.js au bon moment du tour.
export const MARBLE_TRIGGERS = [
  // La Chiquenaude : à chaque pose depuis la main, sur un emplacement vide ou occupé,
  // avant tout le reste, la bille en cours de lancer (ni en main ni sur le triangle).
  {
    id: "flick",
    field: "flick",
    event: "flick",
    marble: "thrown",
    moment: "play",
    forecast: { line: "placement", marble: "placed", order: 0 },
    texts: { card: "marbles.card.flick", effect: "marbles.event.effect_flick", placement: "marbles.place.flick" },
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
    texts: { card: "marbles.card.hit", effect: "marbles.event.effect_hit", placement: "marbles.place.hit" },
    card: "below",
  },
  {
    id: "knockout",
    field: "knockout",
    event: "knockout",
    marble: "onSlot",
    moment: "play",
    replacement: true,
    forecast: { line: "placement", marble: "occupant", order: 1 },
    texts: { card: "marbles.card.knockout", effect: "marbles.event.effect_knockout", placement: "marbles.place.knockout" },
    card: "below",
  },
  // Le Final : au retrait par USURE seulement, la bille déjà à la défausse. Ses
  // valeurs comptent pour le tour en cours (les retraits précèdent l'Impact).
  {
    id: "final",
    field: "final",
    event: "final",
    marble: "removed",
    moment: "afterPhases",
    forecast: { line: "slot" },
    texts: { card: "marbles.card.final", effect: "marbles.event.effect_final", slot: "marbles.outcome.final" },
    card: "below",
  },
];

// La fiche d'une bille (lib/detail-card.js, view/marbles/card.js) : l'ordre de ses
// champs autour de l'annonce principale, du plus proche au plus éloigné. Les champs
// des déclencheurs viennent de MARBLE_TRIGGERS (`card`), dans son ordre ; un autre
// type d'effet : sa ligne ici et son gabarit, rien d'autre.
//   field            le champ de la bille dans MARBLE_TYPES ;
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
  below: MARBLE_TRIGGERS.filter((trigger) => trigger.card === "below").map((trigger) => ({ field: trigger.field, labelKey: trigger.texts.card })),
  emptyBelowKey: "marbles.card.no_special_effect",
};

// Sac de test : un exemplaire de chaque bille. Une liste d'ids, pas un
// dérivé du registre (marbles/types/) : un sac peut porter plusieurs exemplaires
// d'une bille. Validé au démarrage (core/marbles.js/validateMarblesContent).
export const STARTING_BAG = [
  "clay",
  "glass",
  "gorilla",
  "agate",
  "cats_eye",
  "porcelain",
  "leaded",
  "mica",
  "sulphide",
  "stoneware",
  "tiger",
  "giant",
  "magnifier",
];
