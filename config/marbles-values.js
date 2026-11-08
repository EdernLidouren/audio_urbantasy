// Jeu des billes : réglages et table des billes. Donnée pure, zéro import ;
// validée au chargement par core/marbles.js/validateMarbleTypes.
//
// Une bille, chaque champ d'effet étant facultatif (absent : aucun effet) :
//   base        effet joué sur une base ;
//   baseVariant effet propre à UNE base, { leftBase?, rightBase? }, qui
//               remplace `base` sur cette base seulement ;
//   apex        effet joué sur la pointe ;
//   hit         le Tic : effet joué quand la bille est posée sur un emplacement
//               occupé, après l'éjection de l'occupante ;
//   knockout    l'Éjection : effet joué quand la bille est remplacée ;
//   maxWear     usure maximale, sinon MARBLES_SETTINGS.defaultMaxWear ;
//   sound       son profil sonore, une clé de MARBLE_SOUND_PROFILES : sa balise
//               et son bruit de chute. Présentation seulement : la simulation
//               l'accepte sans jamais le lire ; la vue le valide au chargement
//               (view/marbles/sounds.js).
//
// Un effet est une LISTE DE CLAUSES ; une clause (core/marbles-effects.js) :
//   action  ce qu'elle fait : "speed" ou "mass", qui ajoutent `amount` (entier,
//           négatif permis) à la Vitesse ou à la Masse ;
//   amount  la valeur ;
//   target  (facultatif) l'emplacement dont elle modifie l'effet de phase, au
//           lieu d'agir sur le compteur du tour ;
//   when    (facultatif) sa condition, évaluée au déclenchement. Une condition
//           lit toujours l'effet IMPRIMÉ d'une bille, jamais un effet déjà
//           modifié : aucune dépendance circulaire n'est possible.
//
// Le nom d'une bille se déduit de son id : `marble.<id>.name`
// (data/i18n/<langue>/marbles.json), vérifié par les vérifications
// (domaine marbles-view).

export const MARBLES_SETTINGS = {
  firstTurnDraw: 5, // billes piochées au premier tour
  drawPerTurn: 1, // billes piochées à chaque tour suivant
  maxHandSize: 5, // main pleine : la pioche du tour est sautée
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

// Les PROFILS SONORES des billes (champ `sound` d'une bille) :
//   beacon  sa balise, la voix de la bille, à la pioche et sous le curseur ;
//   drop    son bruit de chute, à l'arrivée d'une bille qui roule ;
//   roll    sa boucle de roulement, quand elle va d'une place à l'autre ;
//   impact  le choc, quand une bille posée en déloge une autre. En attendant de
//           vrais sons de choc : la balise.
// Des clés d'asset ou de pool (assets/manifest.json), vérifiées par l'audit du
// contenu. Un profil aura un jour plusieurs voix (marble_small_2_beacon...).
export const MARBLE_SOUND_PROFILES = {
  small: {
    beacon: "assets/sounds/marbles/marble_small_1_beacon",
    drop: "assets/sounds/marbles/marble_small_drop",
    roll: "assets/sounds/marbles/marble_small_rolling",
    impact: "assets/sounds/marbles/marble_small_1_beacon",
  },
  medium: {
    beacon: "assets/sounds/marbles/marble_medium_1_beacon",
    drop: "assets/sounds/marbles/marble_medium_drop",
    roll: "assets/sounds/marbles/marble_medium_rolling",
    impact: "assets/sounds/marbles/marble_medium_1_beacon",
  },
  large: {
    beacon: "assets/sounds/marbles/marble_large_1_beacon",
    drop: "assets/sounds/marbles/marble_large_drop",
    roll: "assets/sounds/marbles/marble_large_rolling",
    impact: "assets/sounds/marbles/marble_large_1_beacon",
  },
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
//   place  de la main à l'emplacement, à la pose ;
//   swap   d'un emplacement à l'autre, à l'échange ;
//   out    d'un emplacement à la défausse : éjectée par une pose, ou usée. Plus
//          lente, et qui s'essouffle ;
//   rotation  le triangle qui tourne : chaque bille roule vers l'emplacement
//          suivant, toutes ensemble. Un seul élan pour plusieurs crans, qui passe
//          par les emplacements sans s'y arrêter.
// Pour place, swap et out :
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
  swap: { speed: 2, endRatio: 0.8 },
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

// La fiche d'une bille (lib/detail-card.js, view/marbles/card.js) : l'ordre de ses
// champs autour de l'annonce principale, du plus proche au plus éloigné. Ajouter
// un nouveau type d'effet à la fiche : sa ligne ici et son gabarit, rien d'autre.
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
  below: [
    { field: "hit", labelKey: "marbles.card.hit" },
    { field: "knockout", labelKey: "marbles.card.knockout" },
  ],
  emptyBelowKey: "marbles.card.no_special_effect",
};

// Formes courtes des clauses de la table : elle se lit mieux, et reste de la
// donnée une fois évaluée.
const speed = (amount) => ({ action: "speed", amount });
const mass = (amount) => ({ action: "mass", amount });

export const MARBLE_TYPES = {
  clay: { base: [speed(1)], apex: [speed(4)], hit: [speed(2)], sound: "medium" },
  glass: { base: [mass(1)], apex: [speed(2)], sound: "small" },
  shooter: { apex: [speed(8)], knockout: [speed(3)], sound: "large" },
  agate: { base: [mass(1)], apex: [mass(2)], hit: [mass(1)], sound: "medium" },
  cats_eye: { base: [speed(3)], baseVariant: { rightBase: [mass(1)] }, apex: [speed(3)], sound: "small" },
  porcelain: { base: [speed(2)], apex: [speed(5)], maxWear: 2, sound: "small" },
  leaded: { base: [mass(2)], apex: [speed(-3)], knockout: [mass(1)], sound: "large" },
  mica: { base: [speed(1)], apex: [speed(1)], maxWear: 6, sound: "small" },
  sulphide: { apex: [mass(3)], sound: "large" },
  stoneware: { base: [speed(2)], sound: "medium" },
  tiger: { base: [speed(3)], apex: [speed(-1)], maxWear: 4, sound: "medium" },
  giant: { base: [speed(6)], apex: [speed(6)], maxWear: 1, sound: "large" },
  // En base gauche, renforce la pointe si elle donne de la Vitesse.
  magnifier: {
    base: [speed(1)],
    baseVariant: {
      leftBase: [{ ...speed(4), target: "apex", when: { type: "printedStat", slot: "apex", stat: "speed", atLeast: 1 } }],
    },
    apex: [speed(2)],
    sound: "medium",
  },
};

// Sac de test : un exemplaire de chaque bille. Une liste d'ids, pas un
// dérivé de la table : un sac peut porter plusieurs exemplaires d'une bille.
export const STARTING_BAG = [
  "clay",
  "glass",
  "shooter",
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
