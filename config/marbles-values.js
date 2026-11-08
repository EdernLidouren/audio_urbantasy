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
//   maxWear     usure maximale, sinon MARBLES_SETTINGS.defaultMaxWear.
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
  clay: { base: [speed(1)], apex: [speed(4)], hit: [speed(2)] },
  glass: { base: [mass(1)], apex: [speed(2)] },
  shooter: { apex: [speed(8)], knockout: [speed(3)] },
  agate: { base: [mass(1)], apex: [mass(2)], hit: [mass(1)] },
  cats_eye: { base: [speed(3)], baseVariant: { rightBase: [mass(1)] }, apex: [speed(3)] },
  porcelain: { base: [speed(2)], apex: [speed(5)], maxWear: 2 },
  leaded: { base: [mass(2)], apex: [speed(-3)], knockout: [mass(1)] },
  mica: { base: [speed(1)], apex: [speed(1)], maxWear: 6 },
  sulphide: { apex: [mass(3)] },
  stoneware: { base: [speed(2)] },
  tiger: { base: [speed(3)], apex: [speed(-1)], maxWear: 4 },
  giant: { base: [speed(6)], apex: [speed(6)], maxWear: 1 },
  // En base gauche, renforce la pointe si elle donne de la Vitesse.
  magnifier: {
    base: [speed(1)],
    baseVariant: {
      leftBase: [{ ...speed(4), target: "apex", when: { type: "printedStat", slot: "apex", stat: "speed", atLeast: 1 } }],
    },
    apex: [speed(2)],
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
